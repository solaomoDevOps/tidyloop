/**
 * photoScanner.ts
 *
 * IMPORTANT PLATFORM REALITY — read before extending this file:
 *
 * iOS sandboxes third-party apps hard. A "storage cleaner" on iOS can only
 * ever see the Photos library (via expo-media-library, with permission)
 * and its own Documents/Cache dirs — nothing else.
 *
 * NATIVE MODULE NOTICE: this file now hashes via react-native-skia
 * (duplicateDetector.ts) and expo-video-thumbnails, and hashes real file
 * bytes via expo-crypto (exactHash.ts). None of these work in Expo Go —
 * a development build is required from here on (`npx expo run:ios` /
 * `npx expo run:android`, or an EAS dev build).
 *
 * SPEED: processing is done in small concurrent batches (CONCURRENCY)
 * rather than one asset fully at a time — hashing is I/O + native-call
 * bound, so a handful of assets in flight at once is meaningfully faster
 * than a strictly sequential for-loop, without needing real threads.
 * Previously-hashed assets (unchanged modifiedAt since last scan) are
 * pulled from the local cache instead of being re-hashed at all.
 */

import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import { ScannedAsset } from "../../types";
import { computeDHash } from "./duplicateDetector";
import { computeExactHash } from "./exactHash";
import { getVideoThumbnailUri } from "./videoThumbnail";
import { getCachedAssetsMap, upsertAssets, CachedAssetMeta } from "../storage/db";

const CONCURRENCY = 6;

const COMMON_SCREENSHOT_RESOLUTIONS: Array<[number, number]> = [
  [1170, 2532], [1179, 2556], [1284, 2778], [1290, 2796],
  [1080, 1920], [1080, 2340], [1080, 2400], [1440, 3200],
];

export async function requestPhotoPermission(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === "granted";
}

export async function scanPhotoLibrary(
  onProgress?: (scanned: number, total: number) => void
): Promise<ScannedAsset[]> {
  const granted = await requestPhotoPermission();
  if (!granted) {
    throw new Error("Photo library permission denied — cannot scan.");
  }

  const cache = getCachedAssetsMap();
  const results: ScannedAsset[] = [];
  const seenIds = new Set<string>();
  let after: string | undefined = undefined;
  let total = 0;
  let scannedCount = 0;
  let pageNumber = 0;

  // Hard safety cap: even if the pagination cursor never reports "no more
  // pages" correctly, this guarantees the loop terminates instead of
  // re-fetching forever. 200 per page, generous headroom over any real
  // photo library size.
  const MAX_PAGES = 2000;

  do {
    pageNumber++;
    if (pageNumber > MAX_PAGES) {
      console.warn(`scanPhotoLibrary: hit MAX_PAGES safety cap (${MAX_PAGES}) — stopping. This means pagination never reported completion; investigate the expo-media-library version in use.`);
      break;
    }

    const page: MediaLibrary.PagedInfo<MediaLibrary.Asset> = await MediaLibrary.getAssetsAsync({
      first: 200,
      after,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    });

    // Use the library's own reported total once, rather than accumulating
    // it per page — accumulating is what let a stuck cursor make the
    // denominator grow without bound.
    if (pageNumber === 1) {
      total = (page as any).totalCount ?? page.assets.length;
    }

    // If an entire page is assets we've already processed, the cursor is
    // stuck re-serving the same page — stop instead of looping forever.
    const newAssetsInPage = page.assets.filter((a) => a && !seenIds.has(a.id));
    if (page.assets.length > 0 && newAssetsInPage.length === 0) {
      console.warn("scanPhotoLibrary: page returned no new assets — pagination cursor appears stuck, stopping.");
      break;
    }

    console.log(`scanPhotoLibrary: page ${pageNumber}, ${newAssetsInPage.length} new assets, hasNextPage=${page.hasNextPage}`);

    const pageResults = await mapWithConcurrency(newAssetsInPage, CONCURRENCY, async (asset) => {
      if (!asset) return null;
      seenIds.add(asset.id);
      const scanned = await processAsset(asset, cache);
      scannedCount++;
      onProgress?.(scannedCount, total);
      return scanned;
    });

    const validResults = pageResults.filter((r): r is ScannedAsset => r !== null);
    results.push(...validResults);
    upsertAssets(validResults);

    after = page.hasNextPage ? page.endCursor : undefined;
  } while (after);

  console.log(`scanPhotoLibrary: finished after ${pageNumber} page(s), ${results.length} assets total.`);
  return results;
}

async function processAsset(asset: MediaLibrary.Asset, cache: Map<string, CachedAssetMeta>): Promise<ScannedAsset> {
  let info: any = {};
  try {
    info = await MediaLibrary.getAssetInfoAsync(asset);
  } catch (err) {
    console.warn("getAssetInfoAsync failed for", asset.id, err);
  }

  // localUri is a real file:// path Skia/crypto can actually read.
  // ph:// (iOS) / content:// (Android) URIs are not directly decodable.
  const localUri: string | undefined = info?.localUri ?? (asset.uri.startsWith("file://") ? asset.uri : undefined);

  let fileInfo: any = { exists: false };
  if (localUri) {
    try {
      fileInfo = await FileSystem.getInfoAsync(localUri, { size: true });
    } catch (err) {
      console.warn("getInfoAsync failed for", localUri, err);
    }
  }

  const sizeBytes = fileInfo?.exists ? fileInfo.size ?? 0 : 0;
  const subtypes: string[] = info?.mediaSubtypes ?? [];
  const isLivePhoto = subtypes.includes("livePhoto");
  const isVideo = asset.mediaType === "video";

  const scanned: ScannedAsset = {
    id: asset.id,
    uri: asset.uri,
    kind: isLivePhoto ? "livePhoto" : isVideo ? "video" : "photo",
    sizeBytes,
    createdAt: asset.creationTime ?? Date.now(),
    modifiedAt: asset.modificationTime ?? Date.now(),
    isFavorite: info?.isFavorite ?? undefined,
    albumIds: info?.albums ?? undefined,
    width: asset.width,
    height: asset.height,
    screenshotLikely: isLikelyScreenshot(asset.filename, asset.width, asset.height),
  };

  // Cache check: if this exact asset hasn't been modified since the last
  // scan, reuse its hashes instead of recomputing them.
  const cached = cache.get(asset.id);
  if (cached && cached.modifiedAt === scanned.modifiedAt) {
    scanned.perceptualHash = cached.perceptualHash ?? undefined;
    scanned.exactHash = cached.exactHash ?? undefined;
    return scanned;
  }

  if (!localUri) {
    return scanned; // nothing we can hash without a real file path
  }

  try {
    if (isVideo) {
      const thumbUri = await getVideoThumbnailUri(localUri);
      if (thumbUri) scanned.perceptualHash = await computeDHash(thumbUri);
    } else {
      scanned.perceptualHash = await computeDHash(localUri);
    }
  } catch (hashErr) {
    console.warn("Perceptual hashing failed for", asset.id, hashErr);
  }

  try {
    scanned.exactHash = await computeExactHash(localUri, sizeBytes);
  } catch (hashErr) {
    console.warn("Exact hashing failed for", asset.id, hashErr);
  }

  return scanned;
}

/** Runs `fn` over `items` with at most `limit` in flight at once, preserving
 * input order in the returned array. A small hand-rolled pool — no extra
 * dependency needed for something this contained. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function isLikelyScreenshot(filename?: string, width?: number, height?: number): boolean {
  if (filename && filename.toLowerCase().includes("screenshot")) return true;
  if (width && height) {
    return COMMON_SCREENSHOT_RESOLUTIONS.some(
      ([w, h]) => (width === w && height === h) || (width === h && height === w)
    );
  }
  return false;
}
