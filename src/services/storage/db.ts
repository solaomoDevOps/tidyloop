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
import { ScannedAsset, ReviewAction } from "../../types";

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
