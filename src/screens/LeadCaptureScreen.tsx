import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { setUserName, setUserPhone, setHasSubmittedLead, setPendingLead } from "../services/storage/db";
import { submitLead } from "../services/leads/leadCapture";

interface Props {
  onDone: () => void;
}

function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 7;
}

/**
 * Required before Home — collects name + phone for marketing follow-up.
 * Marketing consent itself stays a real opt-in (the checkbox), separate
 * from providing contact info: conditioning app access on agreeing to
 * receive marketing calls/texts is the kind of bundling that creates
 * real TCPA exposure, so it's kept as its own affirmative choice.
 *
 * Never hard-blocks on a network failure — see leadCapture.ts's
 * retryPendingLead(), which flushes this on the next app launch.
 */
export default function LeadCaptureScreen({ onDone }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canContinue = name.trim().length > 0 && isValidPhone(phone);

  async function handleContinue() {
    if (!canContinue || submitting) return;
    setSubmitting(true);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    setUserName(trimmedName);
    setUserPhone(trimmedPhone);

    try {
      await submitLead({ name: trimmedName, phone: trimmedPhone, consentedMarketing: consented });
    } catch (err) {
      console.warn("submitLead failed, will retry next launch:", err);
      setPendingLead({ name: trimmedName, phone: trimmedPhone, consentedMarketing: consented });
    }

    setHasSubmittedLead(true);
    setSubmitting(false);
    onDone();
  }

  return (
    <LinearGradient colors={[colors.blue, colors.sky]} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.card}>
          <Text style={styles.headline}>Let's get you set up</Text>
          <Text style={styles.subheadline}>
            Tell us who you are so we can keep you posted on new features and offers.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor="#a4abbd"
              autoCapitalize="words"
              autoComplete="name"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="(555) 123-4567"
              placeholderTextColor="#a4abbd"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
          </View>

          <Pressable style={styles.consentRow} onPress={() => setConsented((v) => !v)}>
            <View style={[styles.checkbox, consented && styles.checkboxChecked]}>
              {consented && <Text style={styles.checkboxMark}>✓</Text>}
            </View>
            <Text style={styles.consentText}>
              I agree to receive marketing calls and texts from Tidyloop about new features and
              offers. Message & data rates may apply. Reply STOP at any time to opt out.
            </Text>
          </Pressable>

          <Pressable
            style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue || submitting}
          >
            {submitting ? <ActivityIndicator color="white" /> : <Text style={styles.continueButtonText}>Continue</Text>}
          </Pressable>

          <Text style={styles.disclosure}>
            Your name and phone number are sent to Tidyloop for this purpose — everything else
            in the app (your photos, scans, and reviews) stays on your device.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1, justifyContent: "center" },
  card: { backgroundColor: "white", borderRadius: 24, margin: 24, padding: 24, gap: 16 },
  headline: { fontSize: 22, fontWeight: "800", color: "#1b2a4a", textAlign: "center" },
  subheadline: { fontSize: 13, color: "#6b7488", textAlign: "center", lineHeight: 18 },
  field: { gap: 6 },
  label: { fontSize: 12, fontWeight: "700", color: "#8a92a8", letterSpacing: 0.4 },
  input: { borderWidth: 1.5, borderColor: "#e4e8f2", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: "#1b2a4a" },
  consentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: "#c3c9d6", alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkboxChecked: { backgroundColor: colors.blue, borderColor: colors.blue },
  checkboxMark: { color: "white", fontSize: 13, fontWeight: "800" },
  consentText: { flex: 1, fontSize: 12, color: "#6b7488", lineHeight: 17 },
  continueButton: { backgroundColor: colors.blue, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 4 },
  continueButtonDisabled: { backgroundColor: "#c3c9d6" },
  continueButtonText: { color: "white", fontSize: 16, fontWeight: "700" },
  disclosure: { fontSize: 11, color: "#a4abbd", textAlign: "center", lineHeight: 15 },
});
