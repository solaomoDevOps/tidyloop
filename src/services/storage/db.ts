/**
 * db.ts — local-only SQLite cache.
 *
 * Stores the last scan's asset metadata + review decisions so re-opening
 * the app doesn't require a full re-scan/re-hash every time, and so the
 * user has a "recently freed" history (a big part of why this feels
 * trustworthy: they can see exactly what they removed and when).
 *
 * Nothing here ever leaves the device — there is no network call in this
 * file, intentionally.
 */

import * as SQLite from "expo-sqlite";
import { ScannedAsset, ReviewAction, ScanCategoryResult } from "../../types";

const db = SQLite.openDatabaseSync("tidyloop.db");

// Tables are created immediately at module load — NOT deferred to a
// lifecycle hook — so any screen that queries the database during its
// first render never races against table creation. (This was previously
// lazy inside initDb() and caused a real "no such table" crash; kept as
// eager execSync calls going forward.)
db.execSync(`
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    uri TEXT NOT NULL,
    kind TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    modifiedAt INTEGER NOT NULL,
    lastAccessedAt INTEGER,
    isFavorite INTEGER,
    perceptualHash TEXT,
    exactHash TEXT,
    score INTEGER
  );
  CREATE TABLE IF NOT EXISTS review_actions (
    assetId TEXT PRIMARY KEY,
    decision TEXT NOT NULL,
    decidedAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS freed_space_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    freedAt INTEGER NOT NULL,
    bytesFreed INTEGER NOT NULL,
    itemCount INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS backups (
    assetId TEXT PRIMARY KEY,
    backupUri TEXT NOT NULL,
    filename TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL,
    backedUpAt INTEGER NOT NULL
  );
`);

// Kept as a no-op so the existing App.tsx call site (`initDb()` in a
// useEffect) doesn't need to change — table creation already happened
// above, the moment this module was imported.
export function initDb(): void {}

export function upsertAssets(assets: ScannedAsset[]): void {
  const stmt = db.prepareSync(`
    INSERT INTO assets (id, uri, kind, sizeBytes, createdAt, modifiedAt, lastAccessedAt, isFavorite, perceptualHash, exactHash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      uri=excluded.uri, sizeBytes=excluded.sizeBytes, modifiedAt=excluded.modifiedAt,
      lastAccessedAt=excluded.lastAccessedAt, isFavorite=excluded.isFavorite,
      perceptualHash=excluded.perceptualHash, exactHash=excluded.exactHash;
  `);
  try {
    for (const a of assets) {
      stmt.executeSync([
        a.id, a.uri, a.kind, a.sizeBytes, a.createdAt, a.modifiedAt,
        a.lastAccessedAt ?? null, a.isFavorite ? 1 : 0, a.perceptualHash ?? null, a.exactHash ?? null,
      ]);
    }
  } finally {
    stmt.finalizeSync();
  }
}

export function recordReviewAction(action: ReviewAction): void {
  db.runSync(
    `INSERT INTO review_actions (assetId, decision, decidedAt) VALUES (?, ?, ?)
     ON CONFLICT(assetId) DO UPDATE SET decision=excluded.decision, decidedAt=excluded.decidedAt;`,
    [action.assetId, action.decision, action.decidedAt]
  );
}

export function logFreedSpace(bytesFreed: number, itemCount: number): void {
  db.runSync(
    `INSERT INTO freed_space_log (freedAt, bytesFreed, itemCount) VALUES (?, ?, ?);`,
    [Date.now(), bytesFreed, itemCount]
  );
}

export function getTotalFreedBytes(): number {
  const row = db.getFirstSync<{ total: number | null }>(
    `SELECT SUM(bytesFreed) as total FROM freed_space_log;`
  );
  return row?.total ?? 0;
}

export interface CachedAssetMeta {
  modifiedAt: number;
  perceptualHash: string | null;
  exactHash: string | null;
}

/** Returns previously-computed hashes keyed by asset id, so a re-scan can
 * skip re-hashing anything whose modifiedAt hasn't changed since last time —
 * this is the single biggest speed win for repeat scans on a large library. */
export function getCachedAssetsMap(): Map<string, CachedAssetMeta> {
  const rows = db.getAllSync<{ id: string; modifiedAt: number; perceptualHash: string | null; exactHash: string | null }>(
    `SELECT id, modifiedAt, perceptualHash, exactHash FROM assets;`
  );
  const map = new Map<string, CachedAssetMeta>();
  for (const row of rows) {
    map.set(row.id, { modifiedAt: row.modifiedAt, perceptualHash: row.perceptualHash, exactHash: row.exactHash });
  }
  return map;
}

const APP_STATE_KEY_PRO = "isPro";

db.execSync(`
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getProStatus(): boolean {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_PRO]);
  return row?.value === "true";
}

export function setProStatus(isPro: boolean): void {
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_PRO, isPro ? "true" : "false"]
  );
}

const APP_STATE_KEY_ONBOARDED = "hasOnboarded";

export function getHasOnboarded(): boolean {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_ONBOARDED]);
  return row?.value === "true";
}

export function setHasOnboarded(value: boolean): void {
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_ONBOARDED, value ? "true" : "false"]
  );
}

const APP_STATE_KEY_LEAD_SUBMITTED = "hasSubmittedLead";
const APP_STATE_KEY_USER_NAME = "userName";

export function getHasSubmittedLead(): boolean {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_LEAD_SUBMITTED]);
  return row?.value === "true";
}

export function setHasSubmittedLead(value: boolean): void {
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_LEAD_SUBMITTED, value ? "true" : "false"]
  );
}

/** Cached locally so the app can personalize a greeting — separate from
 * whatever was actually submitted to the marketing backend. */
export function getUserName(): string | null {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_USER_NAME]);
  return row?.value ?? null;
}

export function setUserName(name: string): void {
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_USER_NAME, name]
  );
}

const APP_STATE_KEY_USER_PHONE = "userPhone";

/** Cached locally so pay-it-forward requests and grant checks don't need
 * to re-ask for the phone number — it's the identifier used to enforce
 * the 6-month cooldown between free unlocks. */
export function getUserPhone(): string | null {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_USER_PHONE]);
  return row?.value ?? null;
}

export function setUserPhone(phone: string): void {
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_USER_PHONE, phone]
  );
}

export const SCAN_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const APP_STATE_KEY_LAST_SCAN_RESULTS = "lastScanResults";
const APP_STATE_KEY_LAST_SCAN_AT = "lastScanAt";

export interface LastScanSnapshot {
  results: ScanCategoryResult[];
  scannedAt: number;
}

/** Persists the last full scan so re-opening the app can show it straight
 * away instead of re-scanning every time — valid for SCAN_CACHE_MAX_AGE_MS.
 * Cleared via clearLastScanSnapshot() the moment the user actually deletes
 * or compresses something, since the results are stale at that point. */
export function getLastScanSnapshot(): LastScanSnapshot | null {
  const resultsRow = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_LAST_SCAN_RESULTS]);
  const atRow = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_LAST_SCAN_AT]);
  if (!resultsRow?.value || !atRow?.value) return null;
  try {
    return { results: JSON.parse(resultsRow.value) as ScanCategoryResult[], scannedAt: Number(atRow.value) };
  } catch {
    return null;
  }
}

export function setLastScanSnapshot(results: ScanCategoryResult[], scannedAt: number): void {
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_LAST_SCAN_RESULTS, JSON.stringify(results)]
  );
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_LAST_SCAN_AT, String(scannedAt)]
  );
}

export function clearLastScanSnapshot(): void {
  db.runSync(`DELETE FROM app_state WHERE key IN (?, ?);`, [APP_STATE_KEY_LAST_SCAN_RESULTS, APP_STATE_KEY_LAST_SCAN_AT]);
}

const APP_STATE_KEY_BACKGROUND_SCAN_ENABLED = "backgroundScanEnabled";

/** Pro-only preference — whether periodic background pre-scans are on. */
export function getBackgroundScanEnabled(): boolean {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_BACKGROUND_SCAN_ENABLED]);
  return row?.value === "true";
}

export function setBackgroundScanEnabled(value: boolean): void {
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_BACKGROUND_SCAN_ENABLED, value ? "true" : "false"]
  );
}

const APP_STATE_KEY_PENDING_LEAD = "pendingLead";

export interface PendingLead {
  name: string;
  phone: string;
  consentedMarketing: boolean;
}

/** Set when submitLead() fails (e.g. no network) so the app can retry on
 * next launch instead of losing the submission or blocking the user. */
export function getPendingLead(): PendingLead | null {
  const row = db.getFirstSync<{ value: string }>(`SELECT value FROM app_state WHERE key = ?;`, [APP_STATE_KEY_PENDING_LEAD]);
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as PendingLead;
  } catch {
    return null;
  }
}

export function setPendingLead(lead: PendingLead | null): void {
  if (lead === null) {
    db.runSync(`DELETE FROM app_state WHERE key = ?;`, [APP_STATE_KEY_PENDING_LEAD]);
    return;
  }
  db.runSync(
    `INSERT INTO app_state (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [APP_STATE_KEY_PENDING_LEAD, JSON.stringify(lead)]
  );
}

export interface BackupEntry {
  assetId: string;
  backupUri: string;
  filename: string;
  sizeBytes: number;
  backedUpAt: number;
}

export function recordBackup(entry: BackupEntry): void {
  db.runSync(
    `INSERT INTO backups (assetId, backupUri, filename, sizeBytes, backedUpAt) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(assetId) DO UPDATE SET backupUri=excluded.backupUri, filename=excluded.filename,
       sizeBytes=excluded.sizeBytes, backedUpAt=excluded.backedUpAt;`,
    [entry.assetId, entry.backupUri, entry.filename, entry.sizeBytes, entry.backedUpAt]
  );
}

export function getAllBackups(): BackupEntry[] {
  return db.getAllSync<BackupEntry>(`SELECT assetId, backupUri, filename, sizeBytes, backedUpAt FROM backups;`);
}

export function getBackupSummary(): { count: number; totalBytes: number } {
  const row = db.getFirstSync<{ count: number; total: number | null }>(
    `SELECT COUNT(*) as count, SUM(sizeBytes) as total FROM backups;`
  );
  return { count: row?.count ?? 0, totalBytes: row?.total ?? 0 };
}

export function clearBackupRecords(): void {
  db.runSync(`DELETE FROM backups;`);
}
