import React, { useEffect, useRef } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, Animated, Easing } from "react-native";

interface Props {
  isPro: boolean;
  onUpgrade: () => void;
  onRestore: () => void;
  /** Only passed when RevenueCat isn't configured yet, so Pro-gated UI stays testable in dev. */
  devSimulateUnlock?: () => void;
}

const FEATURES = [
  { icon: "⚡", label: "Faster batch hashing", detail: "Scan huge libraries in a fraction of the time." },
  { icon: "🕒", label: "Scheduled background scans", detail: "Tidyloop tidies automatically — you just review." },
  { icon: "☁️", label: "Backup-before-delete", detail: "Every removed item is backed up to iCloud/Drive first, for extra peace of mind." },
];

export default function ProPaywallScreen({ isPro, onUpgrade, onRestore, devSimulateUnlock }: Props) {
  const heroAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(heroAnim, {
      toValue: 1,
      duration: 550,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
  }, []);

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

      <View style={styles.featureList}>
        {FEATURES.map((f) => (
          <View key={f.label} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <View style={styles.featureText}>
              <Text style={styles.featureLabel}>{f.label}</Text>
              <Text style={styles.featureDetail}>{f.detail}</Text>
            </View>
          </View>
        ))}
      </View>

      {isPro ? (
        <View style={styles.thanksBox}>
          <Text style={styles.thanksText}>You're on Pro. Thank you for supporting Tidyloop.</Text>
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
  featureList: { width: "100%", gap: 16, marginVertical: 12 },
  featureRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  featureIcon: { fontSize: 22 },
  featureText: { flex: 1 },
  featureLabel: { fontSize: 15, fontWeight: "700", color: "#1b2a4a" },
  featureDetail: { fontSize: 13, color: "#5a6482", marginTop: 2 },
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
