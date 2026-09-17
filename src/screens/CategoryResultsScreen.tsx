import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Easing, Alert } from "react-native";
import { ScanCategoryResult, ScanCategoryId, ReviewAction, DuplicateGroup } from "../types";
import { SCAN_CATEGORIES } from "../services/scanning/categoryScanner";
import { formatBytes } from "../components/format";
import { categoryColors, colors } from "../theme/colors";
import { getTotalFreedBytes } from "../services/storage/db";
import { FREE_TIER_CAP_BYTES } from "../services/plan/planLimits";

interface Props {
  results: ScanCategoryResult[];
  isPro: boolean;
  onReviewCategory: (categoryId: ScanCategoryId) => void;
  onUpgrade: () => void;
  onSmartClean: (decisions: ReviewAction[], groups: DuplicateGroup[]) => void;
}

export default function CategoryResultsScreen({ results, isPro, onReviewCategory, onUpgrade, onSmartClean }: Props) {
  const totalBytes = results.reduce((s, r) => s + r.reclaimableBytes, 0);
  const totalItems = results.reduce((s, r) => s + r.assets.length, 0);
  const freedSoFar = getTotalFreedBytes();
  const usageFraction = Math.min(1, freedSoFar / FREE_TIER_CAP_BYTES);

  // Smart Clean only ever touches EXACT duplicates — byte-identical files,
  // zero ambiguity about which copy to keep. "Similar" (near-duplicate,
  // perceptual-hash) groups always go through the manual side-by-side
  // compare instead, since "which one is best" there is a judgment call.
  const duplicatesResult = results.find((r) => r.categoryId === "duplicates");
  const exactGroups = (duplicatesResult?.duplicateGroups ?? []).filter((g) => g.kind === "exact");
  const smartCleanAssets = exactGroups.flatMap((g) => g.assets.filter((a) => a.id !== g.recommendedKeepId));
  const smartCleanBytes = smartCleanAssets.reduce((s, a) => s + a.sizeBytes, 0);

  function handleSmartClean() {
    Alert.alert(
      "Clean up exact duplicates?",
      `This deletes ${smartCleanAssets.length} exact duplicate item${smartCleanAssets.length === 1 ? "" : "s"} (keeping the best copy of each), freeing ${formatBytes(smartCleanBytes)}. Nothing else is touched, and you'll still get the normal delete confirmation.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clean up",
          onPress: () => {
            const now = Date.now();
            const decisions: ReviewAction[] = smartCleanAssets.map((a) => ({
              assetId: a.id,
              decision: "delete",
              decidedAt: now,
            }));
            onSmartClean(decisions, exactGroups);
          },
        },
      ]
    );
  }

  const headlineAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(headlineAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Animated.View
        style={{
          opacity: headlineAnim,
          transform: [{ scale: headlineAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        }}
      >
        <Text style={styles.headline}>{formatBytes(totalBytes)}</Text>
        <Text style={styles.subheadline}>reclaimable across {totalItems} items</Text>
      </Animated.View>

      {smartCleanAssets.length > 0 && (
        <Pressable style={styles.smartCleanBanner} onPress={handleSmartClean}>
          <Text style={styles.smartCleanIcon}>⚡</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.smartCleanTitle}>Smart Clean available</Text>
            <Text style={styles.smartCleanSubtitle}>
              {smartCleanAssets.length} exact duplicate{smartCleanAssets.length === 1 ? "" : "s"} · {formatBytes(smartCleanBytes)}
            </Text>
          </View>
          <View style={styles.smartCleanButton}>
            <Text style={styles.smartCleanButtonText}>Clean up</Text>
          </View>
        </Pressable>
      )}

      {!isPro && (
        <Pressable style={styles.capBanner} onPress={onUpgrade}>
          <View style={styles.capBannerHeader}>
            <Text style={styles.capBannerLabel}>Free plan</Text>
            <Text style={styles.capBannerAmount}>
              {formatBytes(freedSoFar)} of {formatBytes(FREE_TIER_CAP_BYTES)} freed
            </Text>
          </View>
          <View style={styles.capBannerTrack}>
            <View style={[styles.capBannerFill, { width: `${usageFraction * 100}%` }]} />
          </View>
          <Text style={styles.capBannerHint}>
            {usageFraction >= 1 ? "Limit reached — upgrade to Pro to keep freeing space" : "Upgrade to Pro to remove the 5GB free limit"}
          </Text>
        </Pressable>
      )}

      {results.map((result, i) => {
        const def = SCAN_CATEGORIES.find((c) => c.id === result.categoryId)!;
        const isEmpty = result.assets.length === 0;
        return (
          <ResultCard
            key={result.categoryId}
            delay={i * 90}
            icon={def.icon}
            color={categoryColors[result.categoryId] ?? "#2a6df4"}
            label={def.label}
            isEmpty={isEmpty}
            itemCount={result.assets.length}
            reclaimableBytes={result.reclaimableBytes}
            onReview={() => onReviewCategory(result.categoryId)}
          />
        );
      })}
    </ScrollView>
  );
}

function ResultCard({
  delay,
  icon,
  color,
  label,
  isEmpty,
  itemCount,
  reclaimableBytes,
  onReview,
}: {
  delay: number;
  icon: string;
  color: string;
  label: string;
  isEmpty: boolean;
  itemCount: number;
  reclaimableBytes: number;
  onReview: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.card,
        isEmpty && styles.cardEmpty,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scale: pressScale },
          ],
        },
      ]}
    >
      <View style={styles.cardRow}>
        <View style={[styles.iconBadge, { backgroundColor: color + "1f" }]}>
          <Text style={styles.cardIcon}>{icon}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{label}</Text>
          <Text style={styles.cardMeta}>
            {isEmpty ? "Nothing found — you're already tidy here" : `${itemCount} items · ${formatBytes(reclaimableBytes)}`}
          </Text>
        </View>
        {!isEmpty && (
          <Pressable
            style={[styles.reviewButton, { backgroundColor: color, shadowColor: color }]}
            onPress={onReview}
            onPressIn={() => Animated.spring(pressScale, { toValue: 0.96, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 4 }).start()}
          >
            <Text style={styles.reviewButtonText}>Review</Text>
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f7f8fc" },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  headline: { fontSize: 34, fontWeight: "800", color: "#1b2a4a", textAlign: "center", marginTop: 8 },
  subheadline: { fontSize: 14, color: "#6b7488", textAlign: "center", marginBottom: 12 },
  smartCleanBanner: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.navy, borderRadius: 18, padding: 16, shadowColor: colors.navy, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  smartCleanIcon: { fontSize: 26 },
  smartCleanTitle: { color: "white", fontWeight: "800", fontSize: 15 },
  smartCleanSubtitle: { color: "#cfd8ee", fontSize: 12, marginTop: 2 },
  smartCleanButton: { backgroundColor: colors.gold, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  smartCleanButtonText: { color: colors.navy, fontWeight: "800", fontSize: 13 },
  capBanner: { backgroundColor: "white", borderRadius: 16, padding: 14, gap: 8, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  capBannerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  capBannerLabel: { fontSize: 13, fontWeight: "700", color: "#1b2a4a" },
  capBannerAmount: { fontSize: 12, color: "#6b7488" },
  capBannerTrack: { height: 6, borderRadius: 3, backgroundColor: "#eef1f8", overflow: "hidden" },
  capBannerFill: { height: "100%", borderRadius: 3, backgroundColor: "#2a6df4" },
  capBannerHint: { fontSize: 12, color: "#2a6df4", fontWeight: "600" },
  card: { backgroundColor: "white", borderRadius: 18, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardEmpty: { opacity: 0.6 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBadge: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardIcon: { fontSize: 24 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1b2a4a" },
  cardMeta: { fontSize: 13, color: "#8189a0", marginTop: 2 },
  reviewButton: { backgroundColor: "#3f7ce0", paddingVertical: 11, paddingHorizontal: 18, borderRadius: 14, shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  reviewButtonText: { color: "white", fontWeight: "700", fontSize: 13 },
});
