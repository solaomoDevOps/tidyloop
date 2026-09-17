// Core domain types shared across scanning, scoring, and UI.

export type AssetKind = "photo" | "video" | "document" | "cacheFile" | "download" | "livePhoto";

export type ScanCategoryId =
  | "duplicates"
  | "screenshots"
  | "livePhotos"
  | "staleFiles"
  | "largeVideos";

export interface ScanCategoryDefinition {
  id: ScanCategoryId;
  label: string;
  icon: string; // emoji or icon-font key, kept simple for the RN Text-based icon in v1
}

export interface ScanCategoryResult {
  categoryId: ScanCategoryId;
  assets: ScannedAsset[];
  reclaimableBytes: number;
  /** Only populated for "duplicates" — the grouped structure (all copies
   * together, with a recommended keeper) that `assets` above flattens
   * away. Lets the UI offer a side-by-side compare instead of reviewing
   * each non-recommended copy one at a time with nothing to compare it to. */
  duplicateGroups?: DuplicateGroup[];
}

export interface ScannedAsset {
  id: string;              // native asset/file id
  uri: string;              // local URI (ph:// on iOS, file:// on Android) — not directly loadable by <Image> on iOS
  localUri?: string;        // file:// path resolved via getAssetInfoAsync, safe to pass to <Image>
  kind: AssetKind;
  sizeBytes: number;
  createdAt: number;        // epoch ms
  modifiedAt: number;       // epoch ms
  lastAccessedAt?: number;  // epoch ms, when the OS exposes it (mostly Android)
  isFavorite?: boolean;     // starred/favorited in the native gallery
  albumIds?: string[];      // albums this asset belongs to, e.g. "Favorites", a named album
  perceptualHash?: string;  // for images/video thumbnails, used for near-duplicate grouping
  exactHash?: string;       // sha256 of file bytes, used for exact-duplicate grouping
  width?: number;
  height?: number;
  screenshotLikely?: boolean;
}

export interface DuplicateGroup {
  id: string;
  kind: "exact" | "near";
  assets: ScannedAsset[];
  recommendedKeepId: string; // the asset the scorer thinks is the best copy to keep
  reclaimableBytes: number;  // sum of all but the best copy
}

export interface UsefulnessScore {
  assetId: string;
  score: number;             // 0 (safe to suggest removing) to 100 (definitely keep)
  reasons: ScoreReason[];    // human-readable, shown to the user so nothing is a black box
}

export interface ScoreReason {
  label: string;             // e.g. "Marked as favorite"
  weight: number;            // signed contribution to the score, for transparency in the UI
}

export type ReviewDecision = "keep" | "delete" | "compress" | "skipped";

export interface ReviewAction {
  assetId: string;
  decision: ReviewDecision;
  decidedAt: number;
}

export interface ScanSummary {
  scannedAt: number;
  totalAssetsScanned: number;
  duplicateGroups: DuplicateGroup[];
  largeUnusedAssets: ScannedAsset[];
  totalReclaimableBytes: number;
}
