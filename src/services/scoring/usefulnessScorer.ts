/**
 * usefulnessScorer.ts
 *
 * This is the part of Tidyloop that competitors don't have: instead of a
 * black-box "2.4 GB of junk found" number, every asset gets a score built
 * from named, weighted signals, and the SAME reasons are shown to the user
 * in the review queue. Nothing is ever auto-deleted off this score alone —
 * it only ever sorts what the user reviews and pre-selects the safest
 * candidates to swipe on first.
 *
 * Score scale: 0-100.
 *   0-24   -> "Likely safe to remove" bucket, shown first in review queue
 *   25-59  -> "Worth a second look" bucket
 *   60-100 -> "Probably keep" bucket, hidden from the queue by default
 */

import { ScannedAsset, UsefulnessScore, ScoreReason } from "../../types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface ScoringWeights {
  favorite: number;
  inNamedAlbum: number;
  recentlyCreated: number;
  recentlyAccessed: number;
  screenshot: number;
  isDuplicateNonBest: number;
  neverAccessedLongAge: number;
  tinyOrCorruptLikely: number;
}

// Tunable in one place. If Simeon wants to make the app more or less
// conservative about suggesting removal, these are the only numbers to touch.
export const DEFAULT_WEIGHTS: ScoringWeights = {
  favorite: 45,
  inNamedAlbum: 20,
  recentlyCreated: 25,
  recentlyAccessed: 20,
  screenshot: -15,
  isDuplicateNonBest: -30,
  neverAccessedLongAge: -20,
  tinyOrCorruptLikely: -10,
};

export function scoreAsset(
  asset: ScannedAsset,
  now: number = Date.now(),
  weights: ScoringWeights = DEFAULT_WEIGHTS
): UsefulnessScore {
  const reasons: ScoreReason[] = [];
  let score = 50; // neutral baseline; every asset starts undecided

  if (asset.isFavorite) {
    score += weights.favorite;
    reasons.push({ label: "Marked as favorite", weight: weights.favorite });
  }

  if (asset.albumIds && asset.albumIds.length > 0) {
    score += weights.inNamedAlbum;
    reasons.push({
      label: `Saved in ${asset.albumIds.length} album${asset.albumIds.length > 1 ? "s" : ""}`,
      weight: weights.inNamedAlbum,
    });
  }

  const ageMs = now - asset.createdAt;
  if (ageMs < 14 * DAY_MS) {
    score += weights.recentlyCreated;
    reasons.push({ label: "Created in the last 2 weeks", weight: weights.recentlyCreated });
  }

  if (asset.lastAccessedAt && now - asset.lastAccessedAt < 30 * DAY_MS) {
    score += weights.recentlyAccessed;
    reasons.push({ label: "Opened or viewed in the last month", weight: weights.recentlyAccessed });
  }

  if (asset.screenshotLikely) {
    score += weights.screenshot;
    reasons.push({ label: "Looks like a screenshot", weight: weights.screenshot });
  }

  if (
    !asset.lastAccessedAt &&
    ageMs > 365 * DAY_MS &&
    !asset.isFavorite &&
    (!asset.albumIds || asset.albumIds.length === 0)
  ) {
    score += weights.neverAccessedLongAge;
    reasons.push({
      label: "Over a year old, never opened, not favorited or albumed",
      weight: weights.neverAccessedLongAge,
    });
  }

  if (asset.sizeBytes < 2048) {
    score += weights.tinyOrCorruptLikely;
    reasons.push({ label: "Unusually small file — may be broken or a leftover thumbnail", weight: weights.tinyOrCorruptLikely });
  }

  score = Math.max(0, Math.min(100, score));

  return { assetId: asset.id, score, reasons };
}

/** Marks every non-best copy in a duplicate group down, but never below the
 * point where a favorited/albumed duplicate would still get flagged for
 * deletion — a favorite always outranks "it's a duplicate." */
export function applyDuplicatePenalty(
  scores: Map<string, UsefulnessScore>,
  bestKeepId: string,
  groupAssetIds: string[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): void {
  for (const id of groupAssetIds) {
    if (id === bestKeepId) continue;
    const existing = scores.get(id);
    if (!existing) continue;
    const adjusted = Math.max(0, existing.score + weights.isDuplicateNonBest);
    existing.reasons.push({ label: "A better copy of this exists", weight: weights.isDuplicateNonBest });
    existing.score = adjusted;
  }
}

export function bucketFor(score: number): "removeCandidate" | "secondLook" | "keep" {
  if (score <= 24) return "removeCandidate";
  if (score <= 59) return "secondLook";
  return "keep";
}
