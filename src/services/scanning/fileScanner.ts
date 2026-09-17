/**
 * fileScanner.ts — ANDROID ONLY.
 *
 * Finds large and stale general files (Downloads, WhatsApp media folders,
 * old APKs, etc). This category of scan is not possible on iOS at all
 * (see photoScanner.ts header) — the Settings/Home screens must gate this
 * feature behind Platform.OS === "android" and explain why on iOS.
 *
 * On Android 11+ this requires either:
 *   - Scoped Storage + the Storage Access Framework (SAF) for user-picked
 *     folders (no special permission, but the user must pick each folder
 *     once), or
 *   - The MANAGE_EXTERNAL_STORAGE permission for broad access — Google
 *     Play restricts this heavily to apps whose *core* function requires
 *     it (file managers, backup tools). A storage cleaner qualifies, but
 *     the Play Console declaration form and a demo video are required at
 *     submission time. Budget for that review step; it is not instant.
 *
 * This file scaffolds the scan logic against expo-file-system for the
 * directories that don't require SAF/MANAGE_EXTERNAL_STORAGE (the app's
 * own accessible paths + shared Downloads on API < 29), and marks the
 * broader-access path as a native module TODO.
 */

import * as FileSystem from "expo-file-system/legacy";
import { ScannedAsset } from "../../types";

const LARGE_FILE_THRESHOLD_BYTES = 50 * 1024 * 1024; // 50MB
const STALE_DAYS = 90;

export async function scanAccessibleDownloads(): Promise<ScannedAsset[]> {
  const downloadsDir = FileSystem.documentDirectory
    ? FileSystem.documentDirectory.replace("Documents", "Download")
    : null;
  if (!downloadsDir) return [];

  const exists = await FileSystem.getInfoAsync(downloadsDir);
  if (!exists.exists) return [];

  return scanDirectoryRecursive(downloadsDir);
}

async function scanDirectoryRecursive(dirUri: string): Promise<ScannedAsset[]> {
  const entries = await FileSystem.readDirectoryAsync(dirUri);
  const results: ScannedAsset[] = [];

  for (const entry of entries) {
    const uri = `${dirUri}/${entry}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) continue;

    if (info.isDirectory) {
      results.push(...(await scanDirectoryRecursive(uri)));
      continue;
    }

    const size = (info as any).size ?? 0;
    const modifiedAt = ((info as any).modificationTime ?? 0) * 1000;

    results.push({
      id: uri,
      uri,
      kind: classify(entry),
      sizeBytes: size,
      createdAt: modifiedAt,
      modifiedAt,
    });
  }

  return results;
}

function classify(filename: string): ScannedAsset["kind"] {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "heic", "webp"].includes(ext)) return "photo";
  if (["mp4", "mov", "mkv"].includes(ext)) return "video";
  if (["pdf", "doc", "docx", "txt"].includes(ext)) return "document";
  return "download";
}

export function filterLargeOrStale(assets: ScannedAsset[], now: number = Date.now()): ScannedAsset[] {
  const staleThreshold = now - STALE_DAYS * 24 * 60 * 60 * 1000;
  return assets.filter(
    (a) => a.sizeBytes >= LARGE_FILE_THRESHOLD_BYTES || a.modifiedAt < staleThreshold
  );
}

/**
 * TODO (native module): broad access via MANAGE_EXTERNAL_STORAGE for
 * WhatsApp/Telegram media folders, old APKs in Download, and orphaned
 * app-cache directories left behind by uninstalled apps. This needs a
 * small Kotlin native module calling MediaStore/File APIs directly —
 * expo-file-system cannot reach these paths under scoped storage.
 */
export async function scanBroadAndroidStorage(): Promise<ScannedAsset[]> {
  throw new Error("Not yet implemented — requires native module + MANAGE_EXTERNAL_STORAGE permission flow.");
}
