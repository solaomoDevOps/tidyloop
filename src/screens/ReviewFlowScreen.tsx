import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Modal, Alert } from "react-native";
import ReviewQueueScreen from "./ReviewQueueScreen";
import DuplicateCompareScreen from "./DuplicateCompareScreen";
import { ScannedAsset, UsefulnessScore, ReviewAction, DuplicateGroup } from "../types";
import { deleteAssets } from "../services/scanning/photoScanner";
import { backupAssets } from "../services/backup/localBackup";
import { compressAssets } from "../services/compression/compress";
import { logFreedSpace, clearLastScanSnapshot } from "../services/storage/db";
import { getRemainingFreeBytes } from "../services/plan/planLimits";
import { formatBytes } from "../components/format";

interface Props {
  /** Exactly one of queue (generic swipe review), duplicateGroups
   * (side-by-side compare), or prebuiltDecisions (Smart Clean — already
   * decided, no review UI shown at all) is provided. duplicateGroups can
   * accompany prebuiltDecisions purely to supply the asset lookup. */
  queue?: { asset: ScannedAsset; score: UsefulnessScore }[];
  duplicateGroups?: DuplicateGroup[];
  prebuiltDecisions?: ReviewAction[];
  isPro: boolean;
  onComplete: () => void;
  onUpgradeNeeded: () => void;
}

type Stage = null | "backing-up" | "deleting" | "compressing";

/**
 * Wraps ReviewQueueScreen (or, for duplicates, DuplicateCompareScreen; or,
 * for Smart Clean, no UI at all — see prebuiltDecisions) with the actual
 * delete/compress (and, for Pro, backup) side effects, plus a visible
 * blocking overlay while they run — without this, these ran as a silent
 * await with no on-screen sign anything was happening between tapping
 * Done and the next screen.
 */
export default function ReviewFlowScreen({ queue, duplicateGroups, prebuiltDecisions, isPro, onComplete, onUpgradeNeeded }: Props) {
  const [stage, setStage] = useState<Stage>(null);
  const [compressProgress, setCompressProgress] = useState<{ done: number; total: number } | null>(null);

  const assetById = useMemo(() => {
    const all = duplicateGroups ? duplicateGroups.flatMap((g) => g.assets) : (queue ?? []).map((q) => q.asset);
    return new Map(all.map((a) => [a.id, a]));
  }, [queue, duplicateGroups]);

  useEffect(() => {
    if (prebuiltDecisions) {
      handleFinished(prebuiltDecisions);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFinished(decisions: ReviewAction[]) {
    const deleted = decisions.filter((d) => d.decision === "delete");
    const compressed = decisions.filter((d) => d.decision === "compress");

    if (deleted.length === 0 && compressed.length === 0) {
      onComplete();
      return;
    }

    // --- Delete path: free plan is capped at a lifetime total of freed
    // space (freed_space_log), not per-session, so usage spread across
    // many small sessions is treated the same as one big one. ---
    const requestedAssets = deleted
      .map((d) => assetById.get(d.assetId))
      .filter((a): a is ScannedAsset => !!a);

    let assetsToDelete = requestedAssets;
    let trimmedCount = 0;
    if (!isPro && requestedAssets.length > 0) {
      const remaining = getRemainingFreeBytes();
      const requestedBytes = requestedAssets.reduce((s, a) => s + a.sizeBytes, 0);
      if (requestedBytes > remaining) {
        const kept: ScannedAsset[] = [];
        let used = 0;
        for (const a of requestedAssets) {
          if (used + a.sizeBytes <= remaining) {
            kept.push(a);
            used += a.sizeBytes;
          }
        }
        trimmedCount = requestedAssets.length - kept.length;
        assetsToDelete = kept;
      }
    }

    let deleteConfirmed = false;
    let deletedFreedBytes = 0;
    let deleteCancelled = false;

    if (assetsToDelete.length > 0) {
      if (isPro) {
        setStage("backing-up");
        await backupAssets(assetsToDelete).catch((err) => console.warn("backupAssets failed:", err));
      }

      setStage("deleting");
      try {
        deleteConfirmed = await deleteAssets(assetsToDelete.map((a) => a.id));
      } catch (err) {
        console.warn("deleteAssets failed:", err);
        setStage(null);
        Alert.alert("Couldn't delete", "Something went wrong removing these items. Nothing was deleted.");
        onComplete();
        return;
      }

      if (deleteConfirmed) {
        deletedFreedBytes = assetsToDelete.reduce((sum, a) => sum + a.sizeBytes, 0);
        logFreedSpace(deletedFreedBytes, assetsToDelete.length);
      } else {
        deleteCancelled = true; // user cancelled the OS's own delete confirmation
      }
    }

    // --- Compress path: not gated by the free-tier cap (savings aren't
    // known until after compressing, so there's nothing sensible to trim
    // against in advance) — available on every plan. ---
    const assetsToCompress = compressed
      .map((d) => assetById.get(d.assetId))
      .filter((a): a is ScannedAsset => !!a);

    let compressedCount = 0;
    let compressedSavedBytes = 0;
    let compressFailedCount = 0;

    if (assetsToCompress.length > 0) {
      setStage("compressing");
      setCompressProgress({ done: 0, total: assetsToCompress.length });
      const { results, failed } = await compressAssets(assetsToCompress, (done, total) =>
        setCompressProgress({ done, total })
      );
      setCompressProgress(null);

      compressedCount = results.length;
      compressFailedCount = failed.length;
      compressedSavedBytes = results.reduce((s, r) => s + r.savedBytes, 0);
      if (compressedCount > 0) {
        logFreedSpace(compressedSavedBytes, compressedCount);
      }
    }

    setStage(null);

    // Anything actually changed on disk — the cached "last scan" results
    // Home shows instantly no longer reflect reality, so drop it rather
    // than let a re-opened app show items that are already gone.
    if ((assetsToDelete.length > 0 && deleteConfirmed) || compressedCount > 0) {
      clearLastScanSnapshot();
    }

    const parts: string[] = [];
    if (assetsToDelete.length > 0 && deleteConfirmed) {
      parts.push(
        `${assetsToDelete.length} item${assetsToDelete.length === 1 ? "" : "s"} (${formatBytes(deletedFreedBytes)}) moved to Recently Deleted.`
      );
    } else if (deleteCancelled) {
      parts.push("Delete was cancelled — nothing removed.");
    }
    if (compressedCount > 0) {
      parts.push(`${compressedCount} item${compressedCount === 1 ? "" : "s"} compressed, saving ${formatBytes(compressedSavedBytes)}.`);
    }
    if (compressFailedCount > 0) {
      parts.push(`${compressFailedCount} item${compressFailedCount === 1 ? "" : "s"} couldn't be compressed and were left untouched.`);
    }
    if (trimmedCount > 0) {
      parts.push(
        `${trimmedCount} item${trimmedCount === 1 ? "" : "s"} you swiped to delete were kept instead — that's your 5GB free limit. Upgrade to Pro to free those too.`
      );
    }
    if (isPro && assetsToDelete.length > 0 && deleteConfirmed) {
      parts.push("A local backup was saved first — see Settings → Local backups.");
    }
    if (assetsToDelete.length > 0 && deleteConfirmed) {
      parts.push("iOS keeps deleted items in Recently Deleted for 30 days as a safety net.");
    }

    if (parts.length === 0) {
      onComplete();
      return;
    }

    Alert.alert(
      "All done",
      parts.join(" "),
      trimmedCount > 0
        ? [
            { text: "OK", onPress: onComplete },
            { text: "See Pro", onPress: onUpgradeNeeded },
          ]
        : [{ text: "OK", onPress: onComplete }]
    );
  }

  const overlayText =
    stage === "backing-up"
      ? "Backing up before deleting…"
      : stage === "deleting"
        ? "Deleting…"
        : stage === "compressing"
          ? compressProgress
            ? `Compressing ${compressProgress.done} of ${compressProgress.total}…`
            : "Compressing…"
          : "";

  return (
    <>
      {prebuiltDecisions ? (
        <View style={styles.smartCleanBackground} />
      ) : duplicateGroups && duplicateGroups.length > 0 ? (
        <DuplicateCompareScreen groups={duplicateGroups} onFinished={handleFinished} />
      ) : (
        <ReviewQueueScreen queue={queue ?? []} onFinished={handleFinished} />
      )}
      <Modal visible={stage !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.card}>
            <ActivityIndicator size="large" color="#2a6df4" />
            <Text style={styles.text}>{overlayText}</Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  smartCleanBackground: { flex: 1, backgroundColor: "#f7f8fc" },
  overlay: { flex: 1, backgroundColor: "rgba(27,42,74,0.55)", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "white", borderRadius: 18, paddingVertical: 28, paddingHorizontal: 36, alignItems: "center", gap: 14, minWidth: 220 },
  text: { fontSize: 14, color: "#1b2a4a", fontWeight: "600", textAlign: "center" },
});
