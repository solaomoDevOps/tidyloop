import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView } from "react-native";
import { getBackupSummary, getTotalFreedBytes } from "../services/storage/db";
import { clearAllBackups } from "../services/backup/localBackup";
import { formatBytes } from "../components/format";
import { FREE_TIER_CAP_BYTES } from "../services/plan/planLimits";

/**
 * The monetization model:
 *
 *  - Scanning and review are unlimited on every plan — you always see
 *    everything and decide on everything, no matter what you pay.
 *  - Free can actually FREE up to FREE_TIER_CAP_BYTES cumulatively
 *    (lifetime, via freed_space_log) before Pro is required to keep
 *    deleting. See src/services/plan/planLimits.ts.
 *  - Pro is a single one-time unlock (not a subscription): removes the
 *    free cap entirely, plus faster batch hashing, scheduled background
 *    scans (coming soon), and a local backup-before-delete safety copy.
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
  const [backupSummary, setBackupSummary] = useState(() => getBackupSummary());
  const freedSoFar = getTotalFreedBytes();

  function handleClearBackups() {
    Alert.alert(
      "Clear local backups?",
      `This permanently deletes the ${backupSummary.count} backed-up item${backupSummary.count === 1 ? "" : "s"} (${formatBytes(backupSummary.totalBytes)}) stored on this device. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            await clearAllBackups();
            setBackupSummary(getBackupSummary());
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <Text style={styles.header}>Settings</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Plan</Text>
        <Text style={styles.body}>
          {isPro
            ? "You're on Tidyloop Pro. Thank you."
            : `Free plan — unlimited scanning and review. Free up to ${formatBytes(FREE_TIER_CAP_BYTES)} total (${formatBytes(freedSoFar)} used).`}
        </Text>
        <Pressable style={styles.primaryButton} onPress={onViewPro}>
          <Text style={styles.primaryButtonText}>{isPro ? "Manage Pro" : "See what's in Pro"}</Text>
        </Pressable>
      </View>

      {isPro && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Local backups</Text>
          <Text style={styles.body}>
            {backupSummary.count > 0
              ? `${backupSummary.count} item${backupSummary.count === 1 ? "" : "s"} backed up on this device · ${formatBytes(backupSummary.totalBytes)}`
              : "Nothing backed up yet — deleted items get a local safety copy here first."}
          </Text>
          {backupSummary.count > 0 && (
            <Pressable style={styles.secondaryButton} onPress={handleClearBackups}>
              <Text style={styles.secondaryButtonText}>Clear local backups</Text>
            </Pressable>
          )}
        </View>
      )}

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.body}>Tidyloop is a product of SiliconChase.</Text>
        <Text style={styles.aboutMeta}>Founder & owner: Dr. Simeon Olaomo</Text>
        <Text style={styles.aboutMeta}>Version 1.0.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  container: { padding: 20, paddingBottom: 48, gap: 24 },
  header: { fontSize: 24, fontWeight: "700" },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 14, color: "#555" },
  aboutMeta: { fontSize: 12, color: "#8a92a8" },
  primaryButton: { backgroundColor: "#2a6df4", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButtonText: { color: "white", fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#2a6df4", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  secondaryButtonText: { color: "#2a6df4", fontWeight: "600" },
});
