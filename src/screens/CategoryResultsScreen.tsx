import React, { useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Easing } from "react-native";
import { ScanCategoryResult, ScanCategoryId } from "../types";
import { SCAN_CATEGORIES } from "../services/scanning/categoryScanner";
import { formatBytes } from "../components/format";

interface Props {
  results: ScanCategoryResult[];
  onReviewCategory: (categoryId: ScanCategoryId) => void;
}

export default function CategoryResultsScreen({ results, onReviewCategory }: Props) {
  const totalBytes = results.reduce((s, r) => s + r.reclaimableBytes, 0);
  const totalItems = results.reduce((s, r) => s + r.assets.length, 0);

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

      {results.map((result, i) => {
        const def = SCAN_CATEGORIES.find((c) => c.id === result.categoryId)!;
        const isEmpty = result.assets.length === 0;
        return (
          <ResultCard
            key={result.categoryId}
            delay={i * 90}
            icon={def.icon}
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
  label,
  isEmpty,
  itemCount,
  reclaimableBytes,
  onReview,
}: {
  delay: number;
  icon: string;
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
        <Text style={styles.cardIcon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{label}</Text>
          <Text style={styles.cardMeta}>
            {isEmpty ? "Nothing found — you're already tidy here" : `${itemCount} items · ${formatBytes(reclaimableBytes)}`}
          </Text>
        </View>
        {!isEmpty && (
          <Pressable
            style={styles.reviewButton}
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
  card: { backgroundColor: "white", borderRadius: 18, padding: 16, shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  cardEmpty: { opacity: 0.6 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardIcon: { fontSize: 28 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1b2a4a" },
  cardMeta: { fontSize: 13, color: "#8189a0", marginTop: 2 },
  reviewButton: { backgroundColor: "#3f7ce0", paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12 },
  reviewButtonText: { color: "white", fontWeight: "700", fontSize: 13 },
});
