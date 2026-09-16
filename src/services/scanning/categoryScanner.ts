/**
 * categoryScanner.ts
 *
 * Turns scanning into distinct, sequential batches instead of one flat
 * "scanning..." spinner. Each category finishes fully before the next
 * starts, and reports its own progress — this is what BatchScanScreen
 * animates against, so the user sees "Duplicates ✓ → Screenshots ✓ →
 * Live Photos (scanning...) → ..." rather than staring at one bar.
 *
 * This also matches how competitors' 1-star reviews describe things: a
 * single number that doesn't map to anything concrete. Naming the
 * category as it completes is a direct answer to that.
 */

import { Platform } from "react-native";
import { ScannedAsset, ScanCategoryId, ScanCategoryResult, ScanCategoryDefinition } from "../../types";
import { scanPhotoLibrary } from "./photoScanner";
import { scanAccessibleDownloads, filterLargeOrStale } from "./fileScanner";
import { groupExactDuplicates, groupNearDuplicates } from "./duplicateDetector";

export const SCAN_CATEGORIES: ScanCategoryDefinition[] = [
  { id: "duplicates", label: "Duplicate photos & videos", icon: "🪞" },
  { id: "screenshots", label: "Screenshots", icon: "📱" },
  { id: "livePhotos", label: "Live Photos", icon: "🎞️" },
  { id: "staleFiles", label: "Old, unopened files", icon: "🗄️" },
  { id: "largeVideos", label: "Large videos", icon: "🎬" },
];

const STALE_DAYS = 180;
const LARGE_VIDEO_BYTES = 100 * 1024 * 1024; // 100MB

export interface CategoryScanCallbacks {
  onCategoryStart?: (categoryId: ScanCategoryId) => void;
  onCategoryProgress?: (categoryId: ScanCategoryId, scanned: number, total: number) => void;
  onCategoryComplete?: (result: ScanCategoryResult) => void;
}

/**
 * Runs one full photo-library pass (the expensive part — permission +
 * paging + hashing), then slices the same result set into each visible
 * category so the user isn't waiting through five separate full scans.
 * The Android-only general-file pass runs as its own batch after.
 */
export async function runCategorizedScan(callbacks: CategoryScanCallbacks = {}): Promise<ScanCategoryResult[]> {
  const results: ScanCategoryResult[] = [];

  // --- Underlying photo-library pass (feeds duplicates/screenshots/liveShots/stale) ---
  const photoAssets = await scanPhotoLibrary((scanned, total) => {
    // surfaced under "duplicates" since that's the first category shown,
    // and it's genuinely the same underlying scan pass
    callbacks.onCategoryProgress?.("duplicates", scanned, total);
  });

  // 1. Duplicates
  callbacks.onCategoryStart?.("duplicates");
  const exact = groupExactDuplicates(photoAssets);
  const near = groupNearDuplicates(photoAssets);
  const duplicateAssets = [...exact, ...near].flatMap((g) =>
    g.assets.filter((a) => a.id !== g.recommendedKeepId)
  );
  const duplicatesResult: ScanCategoryResult = {
    categoryId: "duplicates",
    assets: duplicateAssets,
    reclaimableBytes: duplicateAssets.reduce((s, a) => s + a.sizeBytes, 0),
  };
  results.push(duplicatesResult);
  callbacks.onCategoryComplete?.(duplicatesResult);

  // 2. Screenshots
  callbacks.onCategoryStart?.("screenshots");
  const screenshotAssets = photoAssets.filter((a) => a.screenshotLikely);
  const screenshotsResult: ScanCategoryResult = {
    categoryId: "screenshots",
    assets: screenshotAssets,
    reclaimableBytes: screenshotAssets.reduce((s, a) => s + a.sizeBytes, 0),
  };
  results.push(screenshotsResult);
  callbacks.onCategoryComplete?.(screenshotsResult);

  // 3. Live Photos
  callbacks.onCategoryStart?.("livePhotos");
  const livePhotoAssets = photoAssets.filter((a) => a.kind === "livePhoto");
  const livePhotosResult: ScanCategoryResult = {
    categoryId: "livePhotos",
    assets: livePhotoAssets,
    reclaimableBytes: livePhotoAssets.reduce((s, a) => s + a.sizeBytes, 0),
  };
  results.push(livePhotosResult);
  callbacks.onCategoryComplete?.(livePhotosResult);

  // 4. Stale files (old, never revisited, not favorited/albumed)
  callbacks.onCategoryStart?.("staleFiles");
  const now = Date.now();
  const staleAssets = photoAssets.filter(
    (a) =>
      now - a.modifiedAt > STALE_DAYS * 24 * 60 * 60 * 1000 &&
      !a.isFavorite &&
      (!a.albumIds || a.albumIds.length === 0)
  );
  const staleResult: ScanCategoryResult = {
    categoryId: "staleFiles",
    assets: staleAssets,
    reclaimableBytes: staleAssets.reduce((s, a) => s + a.sizeBytes, 0),
  };
  results.push(staleResult);
  callbacks.onCategoryComplete?.(staleResult);

  // 5. Large videos
  callbacks.onCategoryStart?.("largeVideos");
  const largeVideoAssets = photoAssets.filter((a) => a.kind === "video" && a.sizeBytes >= LARGE_VIDEO_BYTES);
  const largeVideosResult: ScanCategoryResult = {
    categoryId: "largeVideos",
    assets: largeVideoAssets,
    reclaimableBytes: largeVideoAssets.reduce((s, a) => s + a.sizeBytes, 0),
  };
  results.push(largeVideosResult);
  callbacks.onCategoryComplete?.(largeVideosResult);

  // Android-only general file sweep (Downloads etc.) — see fileScanner.ts
  // for why this doesn't exist on iOS at all.
  if (Platform.OS === "android") {
    const downloads = await scanAccessibleDownloads();
    const largeOrStale = filterLargeOrStale(downloads);
    if (largeOrStale.length > 0) {
      const existing = results.find((r) => r.categoryId === "staleFiles")!;
      existing.assets.push(...largeOrStale);
      existing.reclaimableBytes += largeOrStale.reduce((s, a) => s + a.sizeBytes, 0);
      callbacks.onCategoryComplete?.(existing);
    }
  }

  return results;
}
