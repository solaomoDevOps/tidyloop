/**
 * compress.ts — "compress instead of delete."
 *
 * iOS has no public API to overwrite an existing Photos asset's file in
 * place, so this is really: compress to a temp file, create a NEW asset
 * from it, confirm it landed, then delete the original. The original
 * still goes through the same MediaLibrary.deleteAssetsAsync path as a
 * normal delete — same OS confirmation, same 30-day Recently Deleted net.
 *
 * KNOWN LIMITATION: the new asset lands in the default camera roll, not
 * whatever custom albums the original belonged to — MediaLibrary doesn't
 * carry that over automatically, and re-adding it isn't done here yet.
 *
 * Processed one at a time, not concurrently — video compression is heavy
 * enough (CPU + memory) that batching it the way hashing is batched would
 * risk the same kind of crash the thumbnail-first hashing fix addressed.
 */

import * as MediaLibrary from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import { Image as CompressorImage, Video as CompressorVideo } from "react-native-compressor";
import { ScannedAsset } from "../../types";

export interface CompressResult {
  originalAssetId: string;
  newAssetId: string;
  originalBytes: number;
  newBytes: number;
  savedBytes: number;
}

export async function compressAsset(asset: ScannedAsset): Promise<CompressResult> {
  if (!asset.localUri) {
    throw new Error("No local file available to compress.");
  }

  const compressedUri =
    asset.kind === "video"
      ? await CompressorVideo.compress(asset.localUri, { compressionMethod: "auto" })
      : await CompressorImage.compress(asset.localUri, { compressionMethod: "auto", quality: 0.6 });

  const info = await FileSystem.getInfoAsync(compressedUri);
  const newBytes = info.exists ? info.size ?? 0 : 0;

  if (newBytes <= 0 || newBytes >= asset.sizeBytes) {
    // Didn't actually shrink it (already optimized, or compression
    // silently no-op'd) — leave the original alone rather than replace
    // it with a same-size-or-larger "compressed" copy.
    throw new Error("Compression didn't reduce file size — original kept.");
  }

  const newAsset = await MediaLibrary.createAssetAsync(compressedUri);
  await MediaLibrary.deleteAssetsAsync([asset.id]);

  return {
    originalAssetId: asset.id,
    newAssetId: newAsset.id,
    originalBytes: asset.sizeBytes,
    newBytes,
    savedBytes: asset.sizeBytes - newBytes,
  };
}

export async function compressAssets(
  assets: ScannedAsset[],
  onProgress?: (done: number, total: number) => void
): Promise<{ results: CompressResult[]; failed: ScannedAsset[] }> {
  const results: CompressResult[] = [];
  const failed: ScannedAsset[] = [];

  for (let i = 0; i < assets.length; i++) {
    try {
      results.push(await compressAsset(assets[i]));
    } catch (err) {
      console.warn("compressAsset failed for", assets[i].id, err);
      failed.push(assets[i]);
    }
    onProgress?.(i + 1, assets.length);
  }

  return { results, failed };
}
