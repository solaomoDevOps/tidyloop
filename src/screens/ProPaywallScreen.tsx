import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import type { PurchasesPackage } from "react-native-purchases";
import { colors } from "../theme/colors";
import { getProPricingTiers, isIAPConfigured, ProPricingTiers } from "../services/payments/iap";
import { FREE_TIER_CAP_BYTES } from "../services/plan/planLimits";
import { formatBytes } from "../components/format";

interface Props {
  isPro: boolean;
  onUpgrade: (pkg: PurchasesPackage) => void;
  onRestore: () => void;
  /** Only passed when RevenueCat isn't configured yet, so Pro-gated UI stays testable in dev. */
  devSimulateUnlock?: () => void;
}

type TierKey = "monthly" | "annual" | "lifetime";
const TIER_LABELS: Record<TierKey, string> = { monthly: "Monthly", annual: "Yearly", lifetime: "Lifetime" };

const FEATURES = [
  { icon: "📦", label: `No ${formatBytes(FREE_TIER_CAP_BYTES)} free limit`, detail: `Free plans can free up to ${formatBytes(FREE_TIER_CAP_BYTES)} total, lifetime — Pro removes the cap completely.`, color: colors.blue, comingSoon: false },
  { icon: "⚡", label: "Faster batch hashing", detail: "Scans run at double the concurrency — noticeably faster on large libraries.", color: colors.sky, comingSoon: false },
  { icon: "🕒", label: "Scheduled background scans", detail: "Coming soon — Tidyloop will tidy automatically, you just review.", color: colors.green, comingSoon: true },
  { icon: "💾", label: "Backup-before-delete", detail: "Every removed item gets a local safety copy on this device first — never truly gone by accident.", color: colors.pink, comingSoon: false },
];

const COMPARISON: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: "Unlimited scans & review", free: true, pro: true },
  { label: "Duplicate & clutter detection", free: true, pro: true },
  { label: "Storage you can free", free: formatBytes(FREE_TIER_CAP_BYTES), pro: "Unlimited" },
  { label: "2x faster batch hashing", free: false, pro: true },
  { label: "Local backup before delete", free: false, pro: true },
  { label: "Scheduled background scans", free: false, pro: "soon" },
];

function ComparisonCell({ value }: { value: boolean | string }) {
  if (value === "soon") return <Text style={[styles.cellMark, styles.cellSoon]}>Soon</Text>;
  if (typeof value === "string") return <Text style={[styles.cellMark, styles.cellText]}>{value}</Text>;
  return <Text style={[styles.cellMark, value ? styles.cellYes : styles.cellNo]}>{value ? "✓" : "—"}</Text>;
}

export default function ProPaywallScreen({ isPro, onUpgrade, onRestore, devSimulateUnlock }: Props) {
  const heroAnim = useRef(new Animated.Value(0)).current;
  const [tiers, setTiers] = useState<ProPricingTiers | null>(null);
  const [selectedTier, setSelectedTier] = useState<TierKey>("annual");

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
    getProPricingTiers()
      .then((t) => {
        setTiers(t);
        if (t.annual) setSelectedTier("annual");
        else if (t.lifetime) setSelectedTier("lifetime");
        else if (t.monthly) setSelectedTier("monthly");
      })
      .catch((err) => console.warn("getProPricingTiers failed:", err));
  }, []);

  const heroOpacity = heroAnim;
  const heroScale = heroAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  const availableTierKeys = (["monthly", "annual", "lifetime"] as TierKey[]).filter((k) => tiers?.[k]);
  const selectedPackage = tiers?.[selectedTier] ?? null;

  const savingsBadge =
    tiers?.annual && tiers?.monthly && tiers.annual.product.pricePerMonth != null
      ? computeSavingsPercent(tiers.monthly.product.price, tiers.annual.product.pricePerMonth)
      : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Animated.Image
        source={require("../../assets/illustrations/hero-more-space.png")}
        style={[styles.hero, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]}
        resizeMode="contain"
      />

      <Text style={styles.title}>Tidyloop Pro</Text>
      <Text style={styles.subtitle}>Pick monthly, yearly, or unlock it for good.</Text>

      {!isPro && availableTierKeys.length > 0 && (
        <>
          <View style={styles.tierTabs}>
            {availableTierKeys.map((key) => (
              <Pressable
                key={key}
                style={[styles.tierTab, selectedTier === key && styles.tierTabActive]}
                onPress={() => setSelectedTier(key)}
              >
                <Text style={[styles.tierTabText, selectedTier === key && styles.tierTabTextActive]}>
                  {TIER_LABELS[key]}
                </Text>
                {key === "annual" && savingsBadge && savingsBadge > 0 && (
                  <View style={styles.savingsBadge}>
                    <Text style={styles.savingsBadgeText}>Save {savingsBadge}%</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>

          <View style={styles.priceBlock}>
            <Text style={styles.priceText}>{selectedPackage?.product.priceString ?? "—"}</Text>
            <Text style={styles.priceCaption}>
              {selectedTier === "lifetime" ? "one-time purchase, yours forever" : `billed ${selectedTier}`}
            </Text>
          </View>
        </>
      )}

      {!isPro && availableTierKeys.length === 0 && (
        <View style={styles.priceBlock}>
          <Text style={styles.priceText}>{isIAPConfigured ? "Loading price…" : "Price set at checkout"}</Text>
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
          {selectedPackage ? (
            <Pressable onPress={() => onUpgrade(selectedPackage)}>
              <LinearGradient colors={[colors.blue, colors.sky]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>
                  {selectedTier === "lifetime" ? "Unlock Pro" : `Start ${TIER_LABELS[selectedTier]}`}
                </Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <View style={styles.disabledButton}>
              <Text style={styles.disabledButtonText}>
                {isIAPConfigured ? "Loading Pro pricing…" : "Pro pricing isn't configured yet"}
              </Text>
            </View>
          )}
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

/** % saved per-month by going annual vs. paying the monthly price every month. */
function computeSavingsPercent(monthlyPrice: number, annualPricePerMonth: number): number | null {
  if (!monthlyPrice || monthlyPrice <= 0) return null;
  const percent = Math.round((1 - annualPricePerMonth / monthlyPrice) * 100);
  return percent > 0 ? percent : null;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, alignItems: "center", padding: 24, gap: 10, backgroundColor: "#f7f8fc" },
  hero: { width: 170, height: 170 },
  title: { fontSize: 26, fontWeight: "800", color: "#1b2a4a" },
  subtitle: { fontSize: 14, color: "#5a6482", marginBottom: 8 },
  tierTabs: { flexDirection: "row", backgroundColor: "#eef1f8", borderRadius: 16, padding: 4, width: "100%", marginTop: 4 },
  tierTab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tierTabActive: { backgroundColor: "white", shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tierTabText: { fontSize: 13, fontWeight: "700", color: "#8a92a8" },
  tierTabTextActive: { color: "#1b2a4a" },
  savingsBadge: { position: "absolute", top: -10, right: 4, backgroundColor: colors.green, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  savingsBadgeText: { color: "white", fontSize: 9, fontWeight: "800" },
  priceBlock: { alignItems: "center", marginTop: 12, marginBottom: 4 },
  priceText: { fontSize: 34, fontWeight: "800", color: colors.blue },
  priceCaption: { fontSize: 12, color: "#8a92a8", marginTop: 2 },
  table: { width: "100%", borderRadius: 16, backgroundColor: "white", padding: 14, marginTop: 12, gap: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tableHeaderRow: { flexDirection: "row", alignItems: "center", paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#eef1f8" },
  tableLabelCol: { flex: 1 },
  tableHeaderCell: { fontSize: 12, fontWeight: "700", color: "#8a92a8", textAlign: "center" },
  tableRow: { flexDirection: "row", alignItems: "center" },
  tableLabel: { flex: 1, fontSize: 13, color: "#1b2a4a" },
  colCell: { width: 64, alignItems: "center" },
  cellMark: { fontSize: 14, fontWeight: "700" },
  cellYes: { color: colors.green },
  cellNo: { color: "#c3c9d6" },
  cellSoon: { color: "#a5730f", fontSize: 11 },
  cellText: { color: "#1b2a4a", fontSize: 11, textAlign: "center" },
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
  primaryButton: { borderRadius: 16, paddingVertical: 17, paddingHorizontal: 40, marginTop: 8, width: "100%", alignItems: "center", shadowColor: colors.blue, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  primaryButtonText: { color: "white", fontSize: 16, fontWeight: "800" },
  disabledButton: { borderRadius: 16, paddingVertical: 17, width: "100%", alignItems: "center", backgroundColor: "#e4e8f2", marginTop: 8 },
  disabledButtonText: { color: "#8a92a8", fontSize: 14, fontWeight: "600" },
  restoreLink: { paddingVertical: 10 },
  restoreLinkText: { color: "#2a6df4", fontSize: 13, textDecorationLine: "underline" },
  thanksBox: { backgroundColor: "#eaf7ee", borderRadius: 12, padding: 16, width: "100%", alignItems: "center", marginTop: 8 },
  thanksText: { color: "#2a8f4f", fontWeight: "600", textAlign: "center" },
  footnote: { fontSize: 12, color: "#8a92a8", textAlign: "center", marginTop: 16, paddingHorizontal: 8 },
  devButton: { marginTop: 20, borderWidth: 1, borderColor: "#e0a53f", borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 },
  devButtonText: { color: "#a5730f", fontSize: 12, fontWeight: "600", textAlign: "center" },
});
