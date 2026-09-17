import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ScrollView, Share, Linking } from "react-native";
import * as StoreReview from "expo-store-review";
import { getBackupSummary, getTotalFreedBytes } from "../services/storage/db";
import { clearAllBackups } from "../services/backup/localBackup";
import { formatBytes } from "../components/format";
import { FREE_TIER_CAP_BYTES } from "../services/plan/planLimits";

// tidyloop.app pages referenced below don't exist yet at time of writing —
// wired up ahead of the site so the app is ready the moment they go live.
const SITE_URL = "https://tidyloop.app";
const CONTACT_URL = "https://tidyloop.app/contact";
const PRIVACY_URL = "https://tidyloop.app/privacy";
const ABOUT_URL = "https://tidyloop.app/about";

/**
 * The monetization model:
 *
 *  - Scanning and review are unlimited on every plan — you always see
 *    everything and decide on everything, no matter what you pay.
 *  - Free can actually FREE up to FREE_TIER_CAP_BYTES cumulatively
 *    (lifetime, via freed_space_log) before Pro is required to keep
 *    deleting. See src/services/plan/planLimits.ts.
 *  - Pro comes in three tiers — monthly, yearly, or a one-time lifetime
 *    unlock, all granting the same entitlement: removes the free cap
 *    entirely, plus faster batch hashing, scheduled background scans
 *    (coming soon), and a local backup-before-delete safety copy.
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

  async function handleRate() {
    try {
      const available = await StoreReview.isAvailableAsync();
      if (available) {
        await StoreReview.requestReview();
      } else {
        await Linking.openURL(SITE_URL);
      }
    } catch (err) {
      console.warn("Rate action failed:", err);
    }
  }

  function handleShare() {
    Share.share({
      message: `I've been using Tidyloop to clean up my phone's storage — check it out: ${SITE_URL}`,
      url: SITE_URL, // iOS only; folded into `message` on Android
    }).catch((err) => console.warn("Share failed:", err));
  }

  function openLink(url: string) {
    Linking.openURL(url).catch((err) => console.warn("Couldn't open link:", url, err));
  }

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
        <Text style={styles.sectionTitle}>More</Text>
        <View style={styles.linkList}>
          <LinkRow label="Rate Tidyloop" onPress={handleRate} />
          <LinkRow label="Share Tidyloop" onPress={handleShare} />
          <LinkRow label="Contact us" onPress={() => openLink(CONTACT_URL)} />
          <LinkRow label="Privacy Policy" onPress={() => openLink(PRIVACY_URL)} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.body}>Tidyloop is a product of SiliconChase.</Text>
        <Text style={styles.aboutMeta}>Founder & owner: Dr. Simeon Olaomo</Text>
        <Text style={styles.aboutMeta}>Version 1.0.0</Text>
        <Pressable onPress={() => openLink(ABOUT_URL)}>
          <Text style={styles.aboutLink}>Learn more at tidyloop.app/about</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.linkRow} onPress={onPress}>
      <Text style={styles.linkRowText}>{label}</Text>
      <Text style={styles.linkRowChevron}>›</Text>
    </Pressable>
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
  aboutLink: { fontSize: 13, color: "#2a6df4", fontWeight: "600", marginTop: 4 },
  linkList: { backgroundColor: "white", borderRadius: 14, overflow: "hidden" },
  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: "#f0f2f8" },
  linkRowText: { fontSize: 14, color: "#1b2a4a", fontWeight: "600" },
  linkRowChevron: { fontSize: 18, color: "#c3c9d6" },
  primaryButton: { backgroundColor: "#2a6df4", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryButtonText: { color: "white", fontWeight: "600" },
  secondaryButton: { borderWidth: 1, borderColor: "#2a6df4", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  secondaryButtonText: { color: "#2a6df4", fontWeight: "600" },
});
