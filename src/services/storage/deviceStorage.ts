/**
 * deviceStorage.ts
 *
 * Real, OS-level device storage stats — total/available disk space, not
 * anything scoped to the Photos library. No permission needed beyond what
 * the app already has, and no scan required: this is what lets the landing
 * screen show something real the instant the app opens, before the user
 * has granted photo access or run anything.
 *
 * Uses the current `Paths` API (expo-file-system's root export), not the
 * `/legacy` FileSystem.getFreeDiskStorageAsync()/getTotalDiskCapacityAsync()
 * pair used elsewhere in this app for file I/O — those are deprecated in
 * SDK 57 for disk-space queries specifically. Paths.availableDiskSpace /
 * Paths.totalDiskSpace are synchronous number properties, not promises.
 */

import { Paths } from "expo-file-system";

export interface DeviceStorageStats {
  totalBytes: number;
  availableBytes: number;
  usedBytes: number;
  usedFraction: number; // 0..1
}

export function getDeviceStorageStats(): DeviceStorageStats | null {
  try {
    const totalBytes = Paths.totalDiskSpace;
    const availableBytes = Paths.availableDiskSpace;
    if (!totalBytes || totalBytes <= 0) return null;
    const usedBytes = Math.max(0, totalBytes - availableBytes);
    return { totalBytes, availableBytes, usedBytes, usedFraction: usedBytes / totalBytes };
  } catch (err) {
    console.warn("getDeviceStorageStats failed:", err);
    return null;
  }
}
