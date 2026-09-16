/**
 * videoThumbnail.ts
 *
 * Skia's Image.MakeImageFromEncoded can decode still-image formats, but
 * not video containers (.mp4/.mov). To perceptually hash a video for
 * near-duplicate detection (e.g. two exports of the same clip), we first
 * pull a single representative frame out as a JPEG via expo-video-thumbnails,
 * then hash that frame exactly like a photo.
 */

import * as VideoThumbnails from "expo-video-thumbnails";

const THUMBNAIL_TIME_MS = 1000; // 1s in — avoids a black first-frame on many clips

export async function getVideoThumbnailUri(videoUri: string): Promise<string | undefined> {
  try {
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: THUMBNAIL_TIME_MS, quality: 0.5 });
    return uri;
  } catch (err) {
    console.warn("getVideoThumbnailUri failed for", videoUri, err);
    return undefined;
  }
}
