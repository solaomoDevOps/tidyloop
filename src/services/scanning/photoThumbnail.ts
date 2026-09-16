/**
 * photoThumbnail.ts
 *
 * Produces a small resized copy of a photo BEFORE Skia ever touches it.
 * This is the fix for a real crash: Skia.Image.MakeImageFromEncoded decodes
 * an image at its full original resolution first, THEN downscales — for a
 * modern 20+ MB phone photo, doing that 6-at-a-time concurrently across a
 * large library is enough to exhaust memory and get the app killed by iOS
 * with no error screen at all (which looks like "the app just vanished").
 *
 * expo-image-manipulator uses the OS's own efficient thumbnail-decode path
 * (it doesn't have to materialize the full-resolution bitmap in memory the
 * way a naive full decode does), so resizing here first is dramatically
 * cheaper than letting Skia do the whole thing.
 */

import * as ImageManipulator from "expo-image-manipulator";

const THUMBNAIL_WIDTH = 64; // small enough to be cheap, still plenty for a 9x8 dHash

export async function getPhotoThumbnailUri(localUri: string): Promise<string | undefined> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: THUMBNAIL_WIDTH } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch (err) {
    console.warn("getPhotoThumbnailUri failed for", localUri, err);
    return undefined;
  }
}
