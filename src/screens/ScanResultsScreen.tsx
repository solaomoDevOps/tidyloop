import React, { useMemo } from "react";
import { View, Text, FlatList, Pressable, StyleSheet } from "react-native";
import { ScanSummary, UsefulnessScore } from "../types";
import { scoreAsset, applyDuplicatePenalty, bucketFor } from "../services/scoring/usefulnessScorer";
import { formatBytes } from "../components/format";

interface Props {
  summary: ScanSummary;
  onReview: (bucket: "removeCandidate" | "secondLook") => void;
}

export default function ScanResultsScreen({ summary, onReview }: Props) {
  const scoredBuckets = useMemo(() => {
    const scores = new Map<string, UsefulnessScore>();

    for (const group of summary.duplicateGroups) {
      for (const asset of group.assets) {
        scores.set(asset.id, scoreAsset(asset));
      }
      applyDuplicatePenalty(
        scores,
        group.recommendedKeepId,
        group.assets.map((a) => a.id)
      );
    }
    for (const asset of summary.largeUnusedAssets) {
      if (!scores.has(asset.id)) scores.set(asset.id, scoreAsset(asset));
    }

    const counts = { removeCandidate: 0, secondLook: 0, keep: 0 };
    let removeBytes = 0;
    for (const [, s] of scores) {
      const bucket = bucketFor(s.score);
      counts[bucket]++;
    }
    return { counts, scores };
  }, [summary]);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Here's exactly what we found</Text>
      <Text style={styles.reclaimable}>{formatBytes(summary.totalReclaimableBytes)} reclaimable</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Likely safe to remove</Text>
        <Text style={styles.cardCount}>{scoredBuckets.counts.removeCandidate} items</Text>
        <Text style={styles.cardDesc}>
          Duplicates and old, unopened files with no favorites or albums attached.
        </Text>
        <Pressable style={styles.reviewButton} onPress={() => onReview("removeCandidate")}>
          <Text style={styles.reviewButtonText}>Review these</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Worth a second look</Text>
        <Text style={styles.cardCount}>{scoredBuckets.counts.secondLook} items</Text>
        <Text style={styles.cardDesc}>
          Mixed signals — recent but large, or a duplicate that might still matter to you.
        </Text>
        <Pressable style={[styles.reviewButton, styles.secondary]} onPress={() => onReview("secondLook")}>
          <Text style={styles.reviewButtonText}>Review these</Text>
        </Pressable>
      </View>

      <View style={styles.keptCard}>
        <Text style={styles.keptText}>
          {scoredBuckets.counts.keep} items were left alone — favorited, recent, or organized into
          albums. We don't even show these in the queue.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 16 },
  header: { fontSize: 22, fontWeight: "700" },
  reclaimable: { fontSize: 16, color: "#2a6df4", fontWeight: "600" },
  card: { backgroundColor: "#f4f6fb", borderRadius: 16, padding: 16, gap: 6 },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  cardCount: { fontSize: 14, color: "#555" },
  cardDesc: { fontSize: 13, color: "#777" },
  reviewButton: { marginTop: 10, backgroundColor: "#2a6df4", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  secondary: { backgroundColor: "#8a8fa3" },
  reviewButtonText: { color: "white", fontWeight: "600" },
  keptCard: { backgroundColor: "#eefaf0", borderRadius: 16, padding: 16 },
  keptText: { fontSize: 13, color: "#2a7a45" },
});
