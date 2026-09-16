/**
 * localBackup.ts — Pro's "backup-before-delete".
 *
 * This is a LOCAL safety copy, not actual iCloud/Google Drive sync — real
 * cloud sync needs account linking (CloudKit entitlements or a Drive OAuth
 * flow) this app doesn't have yet. Copying into the app's own Documents
 * directory is honest about what it actually does: a swipe-delete isn't
 * truly gone until you clear backups from Settings.
 */

import * as FileSystem from "expo-file-system/legacy";
import { ScannedAsset } from "../../types";
import { recordBackup, getAllBackups, clearBackupRecords } from "../storage/db";

const BACKUP_DIR = FileSystem.documentDirectory + "Backups/";

async function ensureBackupDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(BACKUP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(BACKUP_DIR, { intermediates: true });
  }
}

/** Best-effort: one asset failing to back up never blocks the others or the delete flow. */
export async function backupAssets(assets: ScannedAsset[]): Promise<void> {
  const withLocalUri = assets.filter((a) => !!a.localUri);
  if (withLocalUri.length === 0) return;

  await ensureBackupDir();

  for (const asset of withLocalUri) {
    try {
      const ext = asset.localUri!.split(".").pop() || "dat";
      const filename = `${asset.id}.${ext}`;
      const backupUri = BACKUP_DIR + filename;
      await FileSystem.copyAsync({ from: asset.localUri!, to: backupUri });
      recordBackup({
        assetId: asset.id,
        backupUri,
        filename,
        sizeBytes: asset.sizeBytes,
        backedUpAt: Date.now(),
      });
    } catch (err) {
      console.warn("backupAssets: failed to back up", asset.id, err);
    }
  }
}

export async function clearAllBackups(): Promise<void> {
  const entries = getAllBackups();
  for (const entry of entries) {
    try {
      await FileSystem.deleteAsync(entry.backupUri, { idempotent: true });
    } catch (err) {
      console.warn("clearAllBackups: failed to delete", entry.backupUri, err);
    }
  }
  clearBackupRecords();
}
