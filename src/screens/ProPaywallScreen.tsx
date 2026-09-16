import React, { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, Animated, Easing } from "react-native";
import { colors } from "../theme/colors";
import { getProOffering, isIAPConfigured } from "../services/payments/iap";

interface Props {
  isPro: boolean;
  onUpgrade: () => void;
  onRestore: () => void;
  /** Only passed when RevenueCat isn't configured yet, so Pro-gated UI stays testable in dev. */
  devSimulateUnlock?: () => void;
}

const FEATURES = [
  { icon: "⚡", label: "Faster batch hashing", detail: "Scans run at double the concurrency — noticeably faster on large libraries.", color: colors.sky, comingSoon: false },
  { icon: "🕒", label: "Scheduled background scans", detail: "Coming soon — Tidyloop will tidy automatically, you just review.", color: colors.green, comingSoon: true },
  { icon: "💾", label: "Backup-before-delete", detail: "Every removed item gets a local safety copy on this device first — never truly gone by accident.", color: colors.pink, comingSoon: false },
];

const COMPARISON: { label: string; free: boolean; pro: boolean | "soon" }[] = [
  { label: "Unlimited scans & review", free: true, pro: true },
  { label: "Duplicate & clutter detection", free: true, pro: true },
  { label: "2x faster batch hashing", free: false, pro: true },
  { label: "Local backup before delete", free: false, pro: true },
  { label: "Scheduled background scans", free: false, pro: "soon" },
];

function ComparisonCell({ value }: { value: boolean | "soon" }) {
  if (value === "soon") return <Text style={[styles.cellMark, styles.cellSoon]}>Soon</Text>;
  return <Text style={[styles.cellMark, value ? styles.cellYes : styles.cellNo]}>{value ? "✓" : "—"}</Text>;
}

export default function ProPaywallScreen({ isPro, onUpgrade, onRestore, devSimulateUnlock }: Props) {
  const heroAnim = useRef(new Animated.Value(0)).current;
  const [priceString, setPriceString] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(heroAnim, {
      toValue: 1,
      duration: 550,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    if (!isIAPConfigured) return;
    getProOffering()
      .then((offering) => setPriceString(offering?.availablePackages[0]?.product.priceString ?? null))
      .catch((err) => console.warn("getProOffering failed:", err));
  }, []);

  const priceDisplay = !isIAPConfigured ? "Price set at checkout" : priceString ?? "Loading price…";

  const heroOpacity = heroAnim;
  const heroScale = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Animated.Image
        source={require("../../assets/illustrations/hero-more-space.png")}
        style={[styles.hero, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]}
        resizeMode="contain"
      />

      <Text style={styles.title}>Tidyloop Pro</Text>
      <Text style={styles.subtitle}>One-time unlock. No subscription, ever.</Text>

      {!isPro && (
        <View style={styles.priceBlock}>
          <Text style={styles.priceText}>{priceDisplay}</Text>
          <Text style={styles.priceCaption}>one-time purchase, not a subscription</Text>
        </View>
      )}

      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <View style={styles.tableLabelCol} />
          <Text style={[styles.tableHeaderCell, styles.colCell]}>Free</Text>
          <Text style={[styles.tableHeaderCell, styles.colCell]}>Pro</Text>
        </View>
        {COMPARISON.map((row) => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={styles.tableLabel}>{row.label}</Text>
            <View style={styles.colCell}>
              <ComparisonCell value={row.free} />
            </View>
            <View style={styles.colCell}>
              <ComparisonCell value={row.pro} />
            </View>
          </View>
        ))}
      </View>

      <View style={styles.featureList}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.featureRow}>
            <View style={[styles.featureIconBadge, { backgroundColor: f.color + "22" }]}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={styles.featureDetail}>{f.detail}</Text>
            </View>
            {isPro && (
              <Text style={[styles.statusTag, f.comingSoon ? styles.statusTagSoon : styles.statusTagActive]}>
                {f.comingSoon ? "Soon" : "✓ Active"}
              </Text>
            )}
          </View>
        ))}
      </View>

      {isPro ? (
        <View style={styles.thanksBox}>
          <Text style={styles.thanksText}>You're on Pro — the checklist above shows what's active right now.</Text>
        </View>
      ) : (
        <>
          <Pressable style={styles.primaryButton} onPress={onUpgrade}>
            <Text style={styles.primaryButtonText}>Unlock Pro</Text>
          </Pressable>
          <Pressable style={styles.restoreLink} onPress={onRestore}>
            <Text style={styles.restoreLinkText}>Restore previous purchase</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.footnote}>
        Every Pro purchase funds a free unlock for someone who can't afford it — see Settings to
        request one if that's you.
      </Text>

      {devSimulateUnlock && !isPro && (
        <Pressable style={styles.devButton} onPress={devSimulateUnlock}>
          <Text style={styles.devButtonText}>DEV: Simulate unlock (RevenueCat not configured)</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", padding: 24, gap: 10, backgroundColor: "#f7f8fc" },
  hero: { width: 180, height: 180 },
  title: { fontSize: 26, fontWeight: "800", color: "#1b2a4a" },
  subtitle: { fontSize: 14, color: "#5a6482", marginBottom: 8 },
  priceBlock: { alignItems: "center", marginTop: 4, marginBottom: 4 },
  priceText: { fontSize: 30, fontWeight: "800", color: colors.blue },
  priceCaption: { fontSize: 12, color: "#8a92a8", marginTop: 2 },
  table: { width: "100%", borderRadius: 16, backgroundColor: "white", padding: 14, marginTop: 8, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tableHeaderRow: { flexDirection: "row", alignItems: "center", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#eef1f8" },
  tableLabelCol: { flex: 1 },
  tableHeaderCell: { fontSize: 12, fontWeight: "700", color: "#8a92a8", textAlign: "center" },
  tableRow: { flexDirection: "row", alignItems: "center" },
  tableLabel: { flex: 1, fontSize: 13, color: "#1b2a4a" },
  colCell: { width: 56, alignItems: "center" },
  cellMark: { fontSize: 14, fontWeight: "700" },
  cellYes: { color: colors.green },
  cellNo: { color: "#c3c9d6" },
  cellSoon: { color: "#a5730f", fontSize: 11 },
  featureList: { width: "100%", gap: 16, marginVertical: 12 },
  featureRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  featureIconBadge: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  featureIcon: { fontSize: 20 },
  featureText: { flex: 1 },
  featureLabel: { fontSize: 15, fontWeight: "700", color: "#1b2a4a" },
  featureDetail: { fontSize: 13, color: "#5a6482", marginTop: 2 },
  statusTag: { fontSize: 11, fontWeight: "700", paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, overflow: "hidden" },
  statusTagActive: { color: colors.green, backgroundColor: colors.green + "1f" },
  statusTagSoon: { color: "#a5730f", backgroundColor: "#f4b94222" },
  primaryButton: { backgroundColor: "#2a6df4", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 40, marginTop: 8, width: "100%", alignItems: "center" },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  restoreLink: { paddingVertical: 10 },
  restoreLinkText: { color: "#2a6df4", fontSize: 13, textDecorationLine: "underline" },
  thanksBox: { backgroundColor: "#eaf7ee", borderRadius: 12, padding: 16, width: "100%", alignItems: "center", marginTop: 8 },
  thanksText: { color: "#2a8f4f", fontWeight: "600", textAlign: "center" },
  footnote: { fontSize: 12, color: "#8a92a8", textAlign: "center", marginTop: 16, paddingHorizontal: 8 },
  devButton: { marginTop: 20, borderWidth: 1, borderColor: "#e0a53f", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  devButtonText: { color: "#a5730f", fontSize: 12, fontWeight: "600", textAlign: "center" },
});
