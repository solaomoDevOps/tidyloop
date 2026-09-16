/**
 * photoScanner.ts
 *
 * IMPORTANT PLATFORM REALITY: iOS sandboxes third-party apps hard. A
 * "storage cleaner" on iOS can only ever see the Photos library (via
 * expo-media-library, with permission) and its own Documents/Cache dirs.
 *
 * CRASH FIX (real, not theoretical): hashing now resizes each photo to a
 * tiny thumbnail via expo-image-manipulator BEFORE Skia touches it. Feeding
 * Skia a full-resolution image (potentially 20+ MB decoded) 6-at-a-time
 * concurrently across a large library was exhausting memory and getting
 * the app silently killed by iOS mid-scan — which looked like the scan
 * "just vanishing" with no error, no report. Concurrency is also reduced.
 */

import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import { ScannedAsset } from "../../types";
import { computeDHash } from "./duplicateDetector";
import { computeExactHash } from "./exactHash";
import { getVideoThumbnailUri } from "./videoThumbnail";
import { getPhotoThumbnailUri } from "./photoThumbnail";
import { getCachedAssetsMap, upsertAssets, CachedAssetMeta } from "../storage/db";

const CONCURRENCY = 3; // lowered from 6 — hashing is memory-bound, not just I/O-bound

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

  const MAX_PAGES = 2000;

  do {
    pageNumber++;
    if (pageNumber > MAX_PAGES) {
      console.warn(`scanPhotoLibrary: hit MAX_PAGES safety cap (${MAX_PAGES}) — stopping.`);
      break;
    }

    const page: MediaLibrary.PagedInfo<MediaLibrary.Asset> = await MediaLibrary.getAssetsAsync({
      first: 200,
      after,
      mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
    });

    if (pageNumber === 1) {
      total = (page as any).totalCount ?? page.assets.length;
    }

    const newAssetsInPage = page.assets.filter((a) => a && !seenIds.has(a.id));
    if (page.assets.length > 0 && newAssetsInPage.length === 0) {
      console.warn("scanPhotoLibrary: page returned no new assets — pagination cursor appears stuck, stopping.");
      break;
    }

    console.log(`scanPhotoLibrary: page ${pageNumber}, ${newAssetsInPage.length} new assets, hasNextPage=${page.hasNextPage}`);

    const pageResults = await mapWithConcurrency(newAssetsInPage, CONCURRENCY, async (asset) => {
      if (!asset) return null;
      seenIds.add(asset.id);
      // A single asset failing (corrupt file, decode error, anything) must
      // never take down the whole scan — catch here and return a minimal
      // record instead of letting the exception propagate and silently
      // kill the entire batch.
      try {
        const scanned = await processAsset(asset, cache);
        scannedCount++;
        onProgress?.(scannedCount, total);
        return scanned;
      } catch (err) {
        console.warn("processAsset failed entirely for", asset.id, err);
        scannedCount++;
        onProgress?.(scannedCount, total);
        return null;
      }
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
    localUri,
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

  const cached = cache.get(asset.id);
  if (cached && cached.modifiedAt === scanned.modifiedAt) {
    scanned.perceptualHash = cached.perceptualHash ?? undefined;
    scanned.exactHash = cached.exactHash ?? undefined;
    return scanned;
  }

  if (!localUri) {
    return scanned;
  }

  // Perceptual hash: always go through a small thumbnail first, never hand
  // Skia the original full-resolution file. This is the core crash fix.
  try {
    if (isVideo) {
      const frameUri = await getVideoThumbnailUri(localUri);
      if (frameUri) {
        const smallUri = await getPhotoThumbnailUri(frameUri);
        scanned.perceptualHash = await computeDHash(smallUri ?? frameUri);
      }
    } else {
      const smallUri = await getPhotoThumbnailUri(localUri);
      if (smallUri) {
        scanned.perceptualHash = await computeDHash(smallUri);
      }
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
