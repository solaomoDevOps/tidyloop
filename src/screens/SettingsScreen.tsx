import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";

/**
 * The generosity model, made concrete (see README "Monetization &
 * generosity model" for the full reasoning):
 *
 *  - Free tier is genuinely complete: unlimited scans, unlimited review
 *    sessions, full duplicate detection. No artificial caps designed to
 *    frustrate you into paying — that's the exact pattern the market
 *    research flagged as the #1 complaint in this category.
 *  - Pro is a single one-time unlock (not a subscription): faster batch
 *    hashing, scheduled background scans, and iCloud/Drive backup-before-
 *    delete for extra safety.
 *  - "Pay it forward": every Pro purchase funds one free Pro unlock for
 *    someone on the waitlist who taps "I can't afford this." No ads sold
 *    against that list, no data collected beyond a device token to grant
 *    the unlock.
 */

interface Props {
  peopleHelpedThisMonth: number;
  isPro: boolean;
  onViewPro: () => void;
  onRequestFreeUnlock: () => void;
}

export default function SettingsScreen({ peopleHelpedThisMonth, isPro, onViewPro, onRequestFreeUnlock }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.header}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plan</Text>
        <Text style={styles.body}>
          {isPro ? "You're on Tidyloop Pro. Thank you." : "Free plan — full scanning and review, no caps."}
        </Text>
        <Pressable style={styles.primaryButton} onPress={onViewPro}>
          <Text style={styles.primaryButtonText}>{isPro ? "Manage Pro" : "See what's in Pro"}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pay it forward</Text>
        <Text style={styles.body}>
          Every Pro purchase funds a free unlock for someone who can't afford it. {peopleHelpedThisMonth}{" "}
          people have been helped this month.
        </Text>
        <Pressable style={styles.secondaryButton} onPress={onRequestFreeUnlock}>
          <Text style={styles.secondaryButtonText}>I can't afford Pro right now</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <Text style={styles.body}>
          All scanning, hashing, and scoring happens on your device. Nothing is uploaded to any
          server, including with Pro enabled.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, gap: 24 },
  header: { fontSize: 24, fontWeight: "700" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 14, color: "#555" },
  primaryButton: { backgroundColor: "#2a6df4", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButtonText: { color: "white", fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#2a6df4", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  secondaryButtonText: { color: "#2a6df4", fontWeight: "600" },
});
