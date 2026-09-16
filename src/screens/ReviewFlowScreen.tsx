import React, { useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Modal, Alert } from "react-native";
import ReviewQueueScreen from "./ReviewQueueScreen";
import { ScannedAsset, UsefulnessScore, ReviewAction } from "../types";
import { deleteAssets } from "../services/scanning/photoScanner";
import { backupAssets } from "../services/backup/localBackup";
import { logFreedSpace } from "../services/storage/db";

interface Props {
  queue: { asset: ScannedAsset; score: UsefulnessScore }[];
  isPro: boolean;
  onComplete: () => void;
}

type Stage = null | "backing-up" | "deleting";

/**
 * Wraps ReviewQueueScreen with the actual delete (and, for Pro, backup)
 * side effects, plus a visible blocking overlay while they run — without
 * this, "backup before delete" was a silent await with no on-screen sign
 * anything was happening between tapping Done and the OS delete dialog.
 */
export default function ReviewFlowScreen({ queue, isPro, onComplete }: Props) {
  const [stage, setStage] = useState<Stage>(null);

  async function handleFinished(decisions: ReviewAction[]) {
    const deleted = decisions.filter((d) => d.decision === "delete");
    if (deleted.length === 0) {
      onComplete();
      return;
    }

    const assetsToDelete = deleted
      .map((d) => queue.find((q) => q.asset.id === d.assetId)?.asset)
      .filter((a): a is ScannedAsset => !!a);

    if (isPro) {
      setStage("backing-up");
      await backupAssets(assetsToDelete).catch((err) => console.warn("backupAssets failed:", err));
    }

    setStage("deleting");
    let confirmed = false;
    try {
      confirmed = await deleteAssets(deleted.map((d) => d.assetId));
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
    logFreedSpace(freedBytes, deleted.length);
    Alert.alert(
      `${deleted.length} item${deleted.length === 1 ? "" : "s"} moved to Recently Deleted`,
      (isPro
        ? `A local backup of ${deleted.length} item${deleted.length === 1 ? "" : "s"} was saved first — see Settings → Local backups. `
        : "") +
        "iOS keeps them there for 30 days as a safety net, so they're not gone for good yet. To reclaim the space right now, open Photos → Albums → Recently Deleted, select them, and delete permanently."
    );
    onComplete();
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
