import React, { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView } from "react-native";
import { DuplicateGroup, ReviewAction, ScannedAsset } from "../types";
import { recordReviewAction } from "../services/storage/db";
import { formatBytes, formatDate } from "../components/format";
import { colors } from "../theme/colors";

interface Props {
  groups: DuplicateGroup[];
  onFinished: (decisions: ReviewAction[]) => void;
}

/**
 * Duplicates get their own flow instead of the generic one-at-a-time
 * swipe queue: you can't judge "which copy is best" without seeing the
 * other copies. Walks through each group, showing every member side by
 * side with size/date/resolution, the algorithm's suggested keeper
 * pre-selected — tap any thumbnail to override it. Produces the exact
 * same ReviewAction[] shape ReviewQueueScreen does, so it hands off to
 * ReviewFlowScreen for the actual backup/delete/free-cap logic unchanged.
 */
export default function DuplicateCompareScreen({ groups, onFinished }: Props) {
  const [groupIndex, setGroupIndex] = useState(0);
  const [decisions, setDecisions] = useState<ReviewAction[]>([]);
  const [selectedKeepId, setSelectedKeepId] = useState<string>(groups[0]?.recommendedKeepId ?? "");

  const group = groups[groupIndex];

  if (!group) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No duplicate groups to compare.</Text>
      </View>
    );
  }

  function selectGroupKeep(id: string) {
    setSelectedKeepId(id);
  }

  function advance(nextDecisions: ReviewAction[]) {
    if (groupIndex + 1 >= groups.length) {
      onFinished(nextDecisions);
    } else {
      setDecisions(nextDecisions);
      setGroupIndex(groupIndex + 1);
      setSelectedKeepId(groups[groupIndex + 1].recommendedKeepId);
    }
  }

  function confirmGroup() {
    const now = Date.now();
    const groupDecisions: ReviewAction[] = group.assets.map((a) => ({
      assetId: a.id,
      decision: a.id === selectedKeepId ? "keep" : "delete",
      decidedAt: now,
    }));
    groupDecisions.forEach(recordReviewAction);
    advance([...decisions, ...groupDecisions]);
  }

  function keepEveryoneInGroup() {
    const now = Date.now();
    const groupDecisions: ReviewAction[] = group.assets.map((a) => ({
      assetId: a.id,
      decision: "keep" as const,
      decidedAt: now,
    }));
    groupDecisions.forEach(recordReviewAction);
    advance([...decisions, ...groupDecisions]);
  }

  const potentialSavings = group.assets
    .filter((a) => a.id !== selectedKeepId)
    .reduce((s, a) => s + a.sizeBytes, 0);

  return (
    <View style={styles.container}>
      <Text style={styles.counter}>
        Group {groupIndex + 1} of {groups.length}
      </Text>
      <Text style={styles.headline}>
        {group.assets.length} {group.kind === "exact" ? "identical" : "similar"} {group.assets.length === 1 ? "item" : "items"}
      </Text>
      <Text style={styles.subheadline}>Tap the one you want to keep — the rest will be marked to delete.</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardRow}>
        {group.assets.map((asset) => (
          <DuplicateCard
            key={asset.id}
            asset={asset}
            isSelected={asset.id === selectedKeepId}
            isSuggested={asset.id === group.recommendedKeepId}
            onPress={() => selectGroupKeep(asset.id)}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.savingsText}>Freeing {formatBytes(potentialSavings)} from this group</Text>

        <Pressable style={styles.primaryButton} onPress={confirmGroup}>
          <Text style={styles.primaryButtonText}>Confirm & continue</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={keepEveryoneInGroup}>
          <Text style={styles.secondaryButtonText}>Keep all — decide later</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>Nothing is final until the whole batch is confirmed at the end.</Text>
    </View>
  );
}

function DuplicateCard({
  asset,
  isSelected,
  isSuggested,
  onPress,
}: {
  asset: ScannedAsset;
  isSelected: boolean;
  isSuggested: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[cardStyles.card, isSelected && cardStyles.cardSelected]} onPress={onPress}>
      <View style={cardStyles.imageWrap}>
        <Image source={{ uri: asset.localUri ?? asset.uri }} style={cardStyles.image} resizeMode="cover" />
        {isSuggested && (
          <View style={cardStyles.suggestedBadge}>
            <Text style={cardStyles.suggestedBadgeText}>Suggested</Text>
          </View>
        )}
        {isSelected && (
          <View style={cardStyles.keepBadge}>
            <Text style={cardStyles.keepBadgeText}>✓ Keep</Text>
          </View>
        )}
      </View>
      <Text style={cardStyles.meta}>{formatBytes(asset.sizeBytes)}</Text>
      <Text style={cardStyles.metaSub}>{formatDate(asset.createdAt)}</Text>
      {asset.width && asset.height && (
        <Text style={cardStyles.metaSub}>
          {asset.width}×{asset.height}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fc", paddingTop: 20, gap: 12 },
  counter: { textAlign: "center", color: "#8a92a8", fontSize: 12, fontWeight: "600" },
  headline: { textAlign: "center", fontSize: 22, fontWeight: "800", color: "#1b2a4a", paddingHorizontal: 20 },
  subheadline: { textAlign: "center", fontSize: 13, color: "#6b7488", paddingHorizontal: 24 },
  cardRow: { paddingHorizontal: 20, gap: 14, paddingVertical: 8 },
  footer: { paddingHorizontal: 20, gap: 10, marginTop: 4 },
  savingsText: { textAlign: "center", fontSize: 13, color: colors.green, fontWeight: "700" },
  primaryButton: { backgroundColor: colors.blue, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  secondaryButton: { paddingVertical: 10, alignItems: "center" },
  secondaryButtonText: { color: "#6b7488", fontSize: 13, fontWeight: "600" },
  hint: { fontSize: 11, color: "#a4abbd", textAlign: "center", paddingBottom: 12 },
  emptyContainer: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f7f8fc" },
  emptyText: { color: "#6b7488", fontSize: 15 },
});

const cardStyles = StyleSheet.create({
  card: { width: 150, borderRadius: 18, backgroundColor: "white", padding: 10, gap: 4, borderWidth: 2, borderColor: "transparent", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardSelected: { borderColor: colors.blue },
  imageWrap: { width: "100%", aspectRatio: 1, borderRadius: 12, overflow: "hidden", backgroundColor: "#eee", marginBottom: 4 },
  image: { width: "100%", height: "100%" },
  suggestedBadge: { position: "absolute", top: 6, left: 6, backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  suggestedBadgeText: { color: "white", fontSize: 9, fontWeight: "800" },
  keepBadge: { position: "absolute", bottom: 6, right: 6, backgroundColor: colors.blue, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  keepBadgeText: { color: "white", fontSize: 10, fontWeight: "800" },
  meta: { fontSize: 13, fontWeight: "700", color: "#1b2a4a" },
  metaSub: { fontSize: 11, color: "#8a92a8" },
});
