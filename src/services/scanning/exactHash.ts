/**
 * exactHash.ts
 *
 * Computes a real SHA-256 of file bytes for exact-duplicate detection.
 *
 * DELIBERATE LIMITATION: hashing requires reading the whole file into a
 * base64 string in JS memory first — fine for photos (a few MB), genuinely
 * bad for large videos (multi-hundred-MB files would spike memory and
 * stall the JS thread). So exact hashing is skipped above EXACT_HASH_MAX_BYTES;
 * those assets simply don't participate in "exact" duplicate grouping, but
 * they still get near-duplicate grouping via computeDHash off a generated
 * thumbnail (see videoThumbnail.ts) — a heavy duplicate video pair is
 * still caught, just under the "near" category instead of "exact."
 */

import * as FileSystem from "expo-file-system/legacy";
import * as Crypto from "expo-crypto";

const EXACT_HASH_MAX_BYTES = 10 * 1024 * 1024; // lowered from 25MB — base64-encoding a large file in JS is slow and memory-heavy; near-duplicate hashing still catches large-file matches

export async function computeExactHash(uri: string, sizeBytes: number): Promise<string | undefined> {
  if (sizeBytes <= 0 || sizeBytes > EXACT_HASH_MAX_BYTES) {
    return undefined;
  }

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
    return hash;
  } catch (err) {
    console.warn("computeExactHash failed for", uri, err);
    return undefined;
  }
}
