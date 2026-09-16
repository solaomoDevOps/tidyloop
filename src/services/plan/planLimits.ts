/**
 * planLimits.ts — the free-tier cap.
 *
 * Free is unlimited for scanning and review (you always see everything
 * and decide on everything — that stays true regardless of plan). The
 * cap only applies to actually freeing space: once a free-plan user has
 * freed FREE_TIER_CAP_BYTES cumulatively (tracked via the existing
 * freed_space_log, so it's lifetime total, not per-session), further
 * deletions require Pro. Pro removes the cap entirely.
 */

import { getTotalFreedBytes } from "../storage/db";

export const FREE_TIER_CAP_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

export function getRemainingFreeBytes(): number {
  return Math.max(0, FREE_TIER_CAP_BYTES - getTotalFreedBytes());
}

export function hasReachedFreeCap(): boolean {
  return getTotalFreedBytes() >= FREE_TIER_CAP_BYTES;
}
