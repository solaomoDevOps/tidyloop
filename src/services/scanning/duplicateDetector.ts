/**
 * duplicateDetector.ts
 *
 * Two passes:
 *  1. Exact duplicates — group by sha256 of file bytes (see exactHash.ts).
 *     Cheap, zero false positives. Skipped for very large files (see
 *     exactHash.ts for the size cutoff and why).
 *  2. Near duplicates — group by perceptual hash (dHash) computed with
 *     react-native-skia, then Hamming-distance cluster. Catches burst-mode
 *     shots, re-saves, and edited copies that exact hashing misses.
 *
 * NATIVE MODULE NOTICE: react-native-skia is a real native module. It is
 * NOT available in Expo Go — from this file onward, testing requires a
 * development build (`npx expo run:ios` / `npx expo run:android`, or an
 * EAS dev build). Expo Go will crash or silently fail to resolve this
 * import.
 *
 * All hashing happens on-device — nothing is uploaded anywhere, which is
 * also the app's privacy pitch ("everything stays on your phone").
 */

import { Skia, ColorType, AlphaType } from "@shopify/react-native-skia";
import { ScannedAsset, DuplicateGroup } from "../../types";
import { scoreAsset } from "../scoring/usefulnessScorer";

const HASH_SIZE = 8; // 8x8 -> 64-bit dHash, a good accuracy/speed tradeoff on-device
const NEAR_DUPLICATE_MAX_DISTANCE = 6; // Hamming distance threshold, tuned conservative

/**
 * Computes a difference hash (dHash) for an image at a real local file URI
 * (ph:// / content:// URIs must be resolved to a local file path first —
 * see photoScanner.ts, which passes `localUri`, and videoThumbnail.ts for
 * video assets, which have no directly-decodable image bytes).
 */
export async function computeDHash(localFileUri: string): Promise<string> {
  const data = await Skia.Data.fromURI(localFileUri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error(`Skia could not decode image at ${localFileUri}`);
  }

  // Downscale to (HASH_SIZE+1) x HASH_SIZE on an offscreen surface — doing
  // the resize on the GPU/Skia side is far faster and more memory-safe
  // than pulling a full-resolution image into JS.
  const width = HASH_SIZE + 1;
  const height = HASH_SIZE;
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) {
    throw new Error("Could not create offscreen Skia surface for hashing.");
  }

  const canvas = surface.getCanvas();
  canvas.drawImageRect(
    image,
    { x: 0, y: 0, width: image.width(), height: image.height() },
    { x: 0, y: 0, width, height },
    Skia.Paint()
  );
  surface.flush();

  const snapshot = surface.makeImageSnapshot();
  const pixels = snapshot.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  }) as Uint8Array | null;

  if (!pixels) {
    throw new Error("readPixels returned no data — hashing failed.");
  }

  const gray = toGrayscale(pixels, width, height);

  let hash = "";
  for (let row = 0; row < HASH_SIZE; row++) {
    for (let col = 0; col < HASH_SIZE; col++) {
      const left = gray[row * width + col];
      const right = gray[row * width + col + 1];
      hash += left < right ? "1" : "0";
    }
  }

  image.dispose();
  snapshot.dispose();
  surface.dispose();

  return hash;
}

function toGrayscale(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) dist++;
  }
  return dist;
}

export function groupExactDuplicates(assets: ScannedAsset[]): DuplicateGroup[] {
  const byHash = new Map<string, ScannedAsset[]>();
  for (const asset of assets) {
    if (!asset.exactHash) continue;
    const list = byHash.get(asset.exactHash) ?? [];
    list.push(asset);
    byHash.set(asset.exactHash, list);
  }

  const groups: DuplicateGroup[] = [];
  for (const [hash, group] of byHash) {
    if (group.length < 2) continue;
    groups.push(buildGroup(`exact-${hash}`, "exact", group));
  }
  return groups;
}

export function groupNearDuplicates(assets: ScannedAsset[]): DuplicateGroup[] {
  const withHash = assets.filter((a) => !!a.perceptualHash);
  const visited = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (let i = 0; i < withHash.length; i++) {
    const a = withHash[i];
    if (visited.has(a.id)) continue;
    const cluster: ScannedAsset[] = [a];
    visited.add(a.id);

    for (let j = i + 1; j < withHash.length; j++) {
      const b = withHash[j];
      if (visited.has(b.id)) continue;
      const dist = hammingDistance(a.perceptualHash!, b.perceptualHash!);
      if (dist <= NEAR_DUPLICATE_MAX_DISTANCE) {
        cluster.push(b);
        visited.add(b.id);
      }
    }

    if (cluster.length > 1) {
      groups.push(buildGroup(`near-${a.id}`, "near", cluster));
    }
  }

  return groups;
}

function buildGroup(id: string, kind: "exact" | "near", assets: ScannedAsset[]): DuplicateGroup {
  const scored = assets.map((asset) => ({ asset, score: scoreAsset(asset).score }));
  scored.sort((x, y) => {
    if (y.score !== x.score) return y.score - x.score;
    return y.asset.sizeBytes - x.asset.sizeBytes;
  });

  const best = scored[0].asset;
  const reclaimableBytes = assets
    .filter((a) => a.id !== best.id)
    .reduce((sum, a) => sum + a.sizeBytes, 0);

  return { id, kind, assets, recommendedKeepId: best.id, reclaimableBytes };
}
