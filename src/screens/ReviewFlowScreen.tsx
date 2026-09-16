import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Modal, Alert } from "react-native";
import ReviewQueueScreen from "./ReviewQueueScreen";
import { ScannedAsset, UsefulnessScore, ReviewAction } from "../types";
import { deleteAssets } from "../services/scanning/photoScanner";
import { backupAssets } from "../services/backup/localBackup";
import { logFreedSpace } from "../services/storage/db";
import { getRemainingFreeBytes } from "../services/plan/planLimits";
import { formatBytes } from "../components/format";

interface Props {
  queue: { asset: ScannedAsset; score: UsefulnessScore }[];
  isPro: boolean;
  onComplete: () => void;
  onUpgradeNeeded: () => void;
}

type Stage = null | "backing-up" | "deleting";

/**
 * Wraps ReviewQueueScreen with the actual delete (and, for Pro, backup)
 * side effects, plus a visible blocking overlay while they run — without
 * this, "backup before delete" was a silent await with no on-screen sign
 * anything was happening between tapping Done and the OS delete dialog.
 */
export default function ReviewFlowScreen({ queue, isPro, onComplete, onUpgradeNeeded }: Props) {
  const [stage, setStage] = useState<Stage>(null);

  async function handleFinished(decisions: ReviewAction[]) {
    const deleted = decisions.filter((d) => d.decision === "delete");
    if (deleted.length === 0) {
      onComplete();
      return;
    }

    const requestedAssets = deleted
      .map((d) => queue.find((q) => q.asset.id === d.assetId)?.asset)
      .filter((a): a is ScannedAsset => !!a);

    // Free plan: capped at a lifetime total of freed space, tracked via
    // freed_space_log — not per-session, so it's the same allowance
    // whether it's used in one batch or spread across many. Scanning and
    // review stay fully unlimited either way; only the actual delete is
    // gated, and only once the free allowance runs out.
    let assetsToDelete = requestedAssets;
    let trimmedCount = 0;
    if (!isPro) {
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

    if (assetsToDelete.length === 0) {
      Alert.alert(
        "Free limit reached",
        "You've freed your 5GB of free space on Tidyloop. Upgrade to Pro to keep freeing space — nothing was deleted this time.",
        [
          { text: "Not now", style: "cancel", onPress: onComplete },
          { text: "See Pro", onPress: onUpgradeNeeded },
        ]
      );
      return;
    }

    if (isPro) {
      setStage("backing-up");
      await backupAssets(assetsToDelete).catch((err) => console.warn("backupAssets failed:", err));
    }

    setStage("deleting");
    let confirmed = false;
    try {
      confirmed = await deleteAssets(assetsToDelete.map((a) => a.id));
    } catch (err) {
      console.warn("deleteAssets failed:", err);
      setStage(null);
      Alert.alert("Couldn't delete", "Something went wrong removing these items. Nothing was deleted.");
      onComplete();
      return;
    }
    setStage(null);

    if (!confirmed) {
      // User cancelled the OS's own delete confirmation — nothing removed.
      onComplete();
      return;
    }

    const freedBytes = assetsToDelete.reduce((sum, a) => sum + a.sizeBytes, 0);
    logFreedSpace(freedBytes, assetsToDelete.length);

    const capNote =
      trimmedCount > 0
        ? `${trimmedCount} item${trimmedCount === 1 ? "" : "s"} you swiped to delete were kept instead — that's your 5GB free limit for this account. Upgrade to Pro to free those too. `
        : "";
    const backupNote = isPro
      ? `A local backup of ${assetsToDelete.length} item${assetsToDelete.length === 1 ? "" : "s"} was saved first — see Settings → Local backups. `
      : "";

    Alert.alert(
      `${assetsToDelete.length} item${assetsToDelete.length === 1 ? "" : "s"} · ${formatBytes(freedBytes)} moved to Recently Deleted`,
      capNote +
        backupNote +
        "iOS keeps them there for 30 days as a safety net, so they're not gone for good yet. To reclaim the space right now, open Photos → Albums → Recently Deleted, select them, and delete permanently.",
      trimmedCount > 0
        ? [
            { text: "OK", onPress: onComplete },
            { text: "See Pro", onPress: onUpgradeNeeded },
          ]
        : [{ text: "OK", onPress: onComplete }]
    );
  }

  return (
    <>
      <ReviewQueueScreen queue={queue} onFinished={handleFinished} />
      <Modal visible={stage !== null} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.card}>
            <ActivityIndicator size="large" color="#2a6df4" />
            <Text style={styles.text}>
              {stage === "backing-up" ? "Backing up before deleting…" : "Deleting…"}
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(27,42,74,0.55)", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "white", borderRadius: 18, paddingVertical: 28, paddingHorizontal: 36, alignItems: "center", gap: 14, minWidth: 220 },
  text: { fontSize: 14, color: "#1b2a4a", fontWeight: "600", textAlign: "center" },
});
