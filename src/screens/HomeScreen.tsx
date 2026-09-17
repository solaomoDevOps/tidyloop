import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Easing, ActivityIndicator, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getTotalFreedBytes } from "../services/storage/db";
import { getDeviceStorageStats } from "../services/storage/deviceStorage";
import { formatBytes } from "../components/format";
import { colors } from "../theme/colors";
import { FREE_TIER_CAP_BYTES } from "../services/plan/planLimits";

interface Props {
  isPro: boolean;
  onStartScan: () => void;
  onQuickSwipe: () => Promise<void>;
  onOpenSettings: () => void;
}

/**
 * The landing screen: a real storage snapshot (device-level, no scan
 * needed) is the first thing you see — not a "Scan my storage" button.
 * "Quick swipe" gives an immediate preview/review loop over recent photos
 * without waiting for a full categorized scan; "Full scan" (duplicates,
 * screenshots, etc.) is offered alongside it, not gating everything else.
 */
export default function HomeScreen({ isPro, onStartScan, onQuickSwipe, onOpenSettings }: Props) {
  const totalFreed = getTotalFreedBytes();
  const storage = useMemo(() => getDeviceStorageStats(), []);

  const [previewLoading, setPreviewLoading] = useState(false);

  const titleAnim = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.85)).current;
  const gaugeAnim = useRef(new Animated.Value(0)).current;
  const heroFloat = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(titleAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.spring(logoScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
    Animated.timing(gaugeAnim, { toValue: 1, duration: 900, delay: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroFloat, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(heroFloat, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    floatLoop.start();
    return () => floatLoop.stop();
  }, []);

  const titleOpacity = titleAnim;
  const titleTranslate = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const heroTranslateY = heroFloat.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  const tone = getStorageTone(storage?.usedFraction ?? 0);

  async function handleQuickSwipe() {
    setPreviewLoading(true);
    try {
      await onQuickSwipe();
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <LinearGradient colors={["#eef3ff", "#ffffff"]} style={styles.container}>
      <View style={styles.blobLayer} pointerEvents="none">
        <View style={[styles.blob, styles.blobBlue]} />
        <View style={[styles.blob, styles.blobPink]} />
        <View style={[styles.blob, styles.blobGold]} />
      </View>

      <Pressable style={styles.settingsLink} onPress={onOpenSettings}>
        <Text style={styles.settingsLinkText}>Settings</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTranslate }], alignItems: "center" }}>
        <Animated.Image
          source={require("../../assets/images/logo-tidyloop.png")}
          style={[styles.logo, { transform: [{ scale: logoScale }] }]}
          resizeMode="contain"
        />
      </Animated.View>

      {storage && (
        <Animated.View style={[styles.gaugeCard, { opacity: titleOpacity }]}>
          <Text style={styles.gaugeHeadline}>{tone.headline}</Text>
          <View style={styles.gaugeTrack}>
            <Animated.View
              style={[
                styles.gaugeFill,
                {
                  backgroundColor: tone.color,
                  width: gaugeAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", `${storage.usedFraction * 100}%`] }),
                },
              ]}
            />
          </View>
          <View style={styles.gaugeStatsRow}>
            <Text style={styles.gaugeStat}>{formatBytes(storage.usedBytes)} used</Text>
            <Text style={styles.gaugeStat}>{formatBytes(storage.availableBytes)} free</Text>
          </View>
        </Animated.View>
      )}

      <Animated.Image
        source={require("../../assets/illustrations/hero-more-space.png")}
        style={[styles.hero, { transform: [{ translateY: heroTranslateY }] }]}
        resizeMode="contain"
      />

      {totalFreed > 0 && (
        <Animated.Text style={[styles.freedStat, { opacity: titleOpacity }]}>
          You've reclaimed {formatBytes(totalFreed)} so far — nothing you wanted was touched.
        </Animated.Text>
      )}

      {!isPro && (
        <Text style={styles.capNote}>Free plan: free up to {formatBytes(FREE_TIER_CAP_BYTES)} total</Text>
      )}

      <View style={styles.actionsRow}>
        <Pressable style={[styles.actionCard, styles.actionCardPrimary]} onPress={handleQuickSwipe} disabled={previewLoading}>
          {previewLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text style={styles.actionCardTitle}>Quick swipe</Text>
              <Text style={styles.actionCardSubtitle}>Preview recent photos now</Text>
            </>
          )}
        </Pressable>

        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          <Pressable
            style={[styles.actionCard, styles.actionCardSecondary]}
            onPress={onStartScan}
            onPressIn={() => Animated.spring(pressScale, { toValue: 0.96, useNativeDriver: true }).start()}
            onPressOut={() => Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 4 }).start()}
          >
            <Text style={[styles.actionCardTitle, styles.actionCardTitleSecondary]}>Full scan</Text>
            <Text style={styles.actionCardSubtitleSecondary}>Duplicates, screenshots & more</Text>
          </Pressable>
        </Animated.View>
      </View>

      <Text style={styles.disclosure}>
        Everything happens on your device. Nothing is uploaded. Nothing is deleted
        without you reviewing it first.
      </Text>
      </ScrollView>
    </LinearGradient>
  );
}

function getStorageTone(usedFraction: number): { headline: string; color: string } {
  if (usedFraction >= 0.9) return { headline: "Whoa — your phone's almost full", color: colors.pink };
  if (usedFraction >= 0.7) return { headline: "Getting a little full — let's tidy up", color: colors.gold };
  return { headline: "Your phone has room to breathe", color: colors.green };
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, paddingTop: 70, alignItems: "center", gap: 12 },
  blobLayer: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  blob: { position: "absolute", borderRadius: 999 },
  blobBlue: { width: 260, height: 260, backgroundColor: colors.blue, opacity: 0.12, top: -80, left: -90 },
  blobPink: { width: 220, height: 220, backgroundColor: colors.pink, opacity: 0.1, bottom: -60, right: -70 },
  blobGold: { width: 140, height: 140, backgroundColor: colors.gold, opacity: 0.14, top: "38%", right: -50 },
  logo: { width: 170, height: 112 },
  gaugeCard: { width: "100%", backgroundColor: "white", borderRadius: 18, padding: 16, gap: 10, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  gaugeHeadline: { fontSize: 15, fontWeight: "700", color: "#1b2a4a", textAlign: "center" },
  gaugeTrack: { height: 10, borderRadius: 5, backgroundColor: "#eef1f8", overflow: "hidden" },
  gaugeFill: { height: "100%", borderRadius: 5 },
  gaugeStatsRow: { flexDirection: "row", justifyContent: "space-between" },
  gaugeStat: { fontSize: 12, color: "#6b7488", fontWeight: "600" },
  hero: { width: 140, height: 140 },
  freedStat: { fontSize: 13, color: "#2a8f4f", textAlign: "center" },
  capNote: { fontSize: 12, color: "#8a92a8" },
  actionsRow: { flexDirection: "row", width: "100%", gap: 12, marginTop: 4 },
  actionCard: { flex: 1, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 14, alignItems: "center", justifyContent: "center", minHeight: 78 },
  actionCardPrimary: { backgroundColor: "#3f7ce0", shadowColor: "#3f7ce0", shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  actionCardSecondary: { backgroundColor: "white", borderWidth: 1.5, borderColor: "#dbe4fb" },
  actionCardTitle: { color: "white", fontSize: 16, fontWeight: "800" },
  actionCardTitleSecondary: { color: "#1b2a4a" },
  actionCardSubtitle: { color: "#eaf1ff", fontSize: 11, marginTop: 3, textAlign: "center" },
  actionCardSubtitleSecondary: { color: "#8a92a8", fontSize: 11, marginTop: 3, textAlign: "center" },
  disclosure: { fontSize: 11, color: "#8a92a8", textAlign: "center", marginTop: 8, paddingHorizontal: 12, paddingBottom: 8 },
  settingsLink: { position: "absolute", top: 60, right: 24, zIndex: 10 },
  settingsLinkText: { color: "#3f7ce0", fontWeight: "600" },
});
