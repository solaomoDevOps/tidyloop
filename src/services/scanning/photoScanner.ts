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
import { getCachedAssetsMap, upsertAssets, CachedAssetMeta, getProStatus } from "../storage/db";

const FREE_CONCURRENCY = 3; // lowered from 6 during the crash fix — hashing is memory-bound, not just I/O-bound
const PRO_CONCURRENCY = 6; // safe to restore for Pro: the actual crash cause (full-res images hitting Skia)
// is fixed by the thumbnail-first resize below, not by concurrency — this now runs on tiny thumbnails.

const COMMON_SCREENSHOT_RESOLUTIONS: Array<[number, number]> = [
  [1170, 2532], [1179, 2556], [1284, 2778], [1290, 2796],
  [1080, 1920], [1080, 2340], [1080, 2400], [1440, 3200],
];

export async function requestPhotoPermission(): Promise<boolean> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  return status === "granted";
}

// On iOS, MediaLibrary.deleteAssetsAsync always shows the OS's own
// confirmation sheet and always moves assets to "Recently Deleted"
// (30-day retention) rather than purging instantly — there's no public
// API to bypass that, so the returned boolean reflects whether the user
// confirmed the system dialog, not whether the files are gone for good.
export async function deleteAssets(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true;
  return MediaLibrary.deleteAssetsAsync(ids);
}

export async function scanPhotoLibrary(
  onProgress?: (scanned: number, total: number) => void,
  options?: { deadlineAt?: number }
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
    // Background-task runs pass a wall-clock deadline (iOS gives these
    // seconds-to-minutes before suspending the app) — bail out between
    // pages rather than getting killed mid-page. Results already fetched
    // are already persisted via upsertAssets below, so this is always
    // resumable on the next run/full scan, never lossy.
    if (options?.deadlineAt && Date.now() > options.deadlineAt) {
      console.log(`scanPhotoLibrary: deadline reached after ${pageNumber - 1} page(s) — stopping early.`);
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

    const concurrency = getProStatus() ? PRO_CONCURRENCY : FREE_CONCURRENCY;
    const pageResults = await mapWithConcurrency(newAssetsInPage, concurrency, async (asset) => {
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

/** Metadata-only pass — no hashing. Shared by the full scan (which adds
 * hashing on top) and by the lightweight quick-preview fetch below. */
async function buildAssetMetadata(asset: MediaLibrary.Asset): Promise<ScannedAsset> {
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
      fileInfo = await FileSystem.getInfoAsync(localUri);
    } catch (err) {
      console.warn("getInfoAsync failed for", localUri, err);
    }
  }

  const sizeBytes = fileInfo?.exists ? fileInfo.size ?? 0 : 0;
  const subtypes: string[] = info?.mediaSubtypes ?? [];
  const isLivePhoto = subtypes.includes("livePhoto");
  const isVideo = asset.mediaType === "video";

  // <Image> can decode photos/live-photo stills directly from localUri,
  // but never a raw video file — resolve a real still frame for those so
  // review/compare screens always have something displayable instead of
  // a broken image.
  let previewUri: string | undefined = isVideo ? undefined : localUri;
  if (isVideo && localUri) {
    previewUri = await getVideoThumbnailUri(localUri);
  }

  return {
    id: asset.id,
    uri: asset.uri,
    localUri,
    previewUri,
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
}

/**
 * Fast path for the landing screen's "Quick swipe": grabs the most recent
 * assets and resolves just enough metadata to display and score them —
 * no perceptual/exact hashing, so it's near-instant instead of a full scan.
 */
export async function getQuickPreviewAssets(count: number = 30): Promise<ScannedAsset[]> {
  const granted = await requestPhotoPermission();
  if (!granted) {
    throw new Error("Photo library permission denied — cannot preview.");
  }

  const page = await MediaLibrary.getAssetsAsync({
    first: Math.max(count * 2, 60), // over-fetch since page order isn't guaranteed newest-first
    mediaType: [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video],
  });

  const recent = [...page.assets]
    .filter((a) => !!a)
    .sort((a, b) => (b.creationTime ?? 0) - (a.creationTime ?? 0))
    .slice(0, count);

  const previewAssets = await mapWithConcurrency(recent, FREE_CONCURRENCY, async (asset) => {
    try {
      return await buildAssetMetadata(asset);
    } catch (err) {
      console.warn("getQuickPreviewAssets: failed for", asset.id, err);
      return null;
    }
  });

  return previewAssets.filter((a): a is ScannedAsset => !!a);
}

async function processAsset(asset: MediaLibrary.Asset, cache: Map<string, CachedAssetMeta>): Promise<ScannedAsset> {
  const scanned = await buildAssetMetadata(asset);
  const isVideo = scanned.kind === "video";
  const localUri = scanned.localUri;

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
      // Reuse the still frame buildAssetMetadata already resolved for
      // previewUri instead of extracting a second one from the video.
      const frameUri = scanned.previewUri;
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
    scanned.exactHash = await computeExactHash(localUri, scanned.sizeBytes);
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
