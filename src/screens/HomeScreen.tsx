import React, { useEffect, useRef } from "react";
import { View, Text, Image, Pressable, StyleSheet, Animated, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getTotalFreedBytes } from "../services/storage/db";
import { formatBytes } from "../components/format";

interface Props {
  onStartScan: () => void;
  onOpenSettings: () => void;
}

export default function HomeScreen({ onStartScan, onOpenSettings }: Props) {
  const totalFreed = getTotalFreedBytes();

  const titleAnim = useRef(new Animated.Value(0)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(titleAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const breatheLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.04, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    breatheLoop.start();
    return () => breatheLoop.stop();
  }, []);

  const titleOpacity = titleAnim;
  const titleTranslate = titleAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  function handlePressIn() {
    Animated.spring(pressScale, { toValue: 0.94, useNativeDriver: true }).start();
  }
  function handlePressOut() {
    Animated.spring(pressScale, { toValue: 1, useNativeDriver: true, friction: 4 }).start();
  }

  return (
    <LinearGradient colors={["#eef3ff", "#ffffff"]} style={styles.container}>
      <Pressable style={styles.settingsLink} onPress={onOpenSettings}>
        <Text style={styles.settingsLinkText}>Settings</Text>
      </Pressable>

      <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleTranslate }], alignItems: "center" }}>
        <Image source={require("../../assets/illustrations/hero-holding-phone.png")} style={styles.hero} resizeMode="contain" />
        <Text style={styles.title}>Tidyloop</Text>
        <Text style={styles.subtitle}>Free up space. Never lose what matters.</Text>
      </Animated.View>

      {totalFreed > 0 && (
        <Animated.Text style={[styles.freedStat, { opacity: titleOpacity }]}>
          You've reclaimed {formatBytes(totalFreed)} so far — nothing you wanted was touched.
        </Animated.Text>
      )}

      <Animated.View style={{ transform: [{ scale: Animated.multiply(breathe, pressScale) }] }}>
        <Pressable
          style={styles.scanButton}
          onPress={onStartScan}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <Text style={styles.scanButtonText}>Scan my storage</Text>
        </Pressable>
      </Animated.View>

      <Text style={styles.disclosure}>
        Everything happens on your device. Nothing is uploaded. Nothing is deleted
        without you reviewing it first.
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", alignItems: "center", gap: 16 },
  hero: { width: 160, height: 160, marginBottom: 4 },
  title: { fontSize: 34, fontWeight: "800", color: "#1b2a4a" },
  subtitle: { fontSize: 16, color: "#5a6482", marginBottom: 12, textAlign: "center" },
  freedStat: { fontSize: 14, color: "#2a8f4f", textAlign: "center", marginBottom: 8 },
  scanButton: { backgroundColor: "#3f7ce0", paddingVertical: 18, paddingHorizontal: 36, borderRadius: 16, shadowColor: "#3f7ce0", shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  scanButtonText: { color: "white", fontSize: 18, fontWeight: "700" },
  disclosure: { fontSize: 12, color: "#8a92a8", textAlign: "center", marginTop: 24, paddingHorizontal: 16 },
  settingsLink: { position: "absolute", top: 60, right: 24 },
  settingsLinkText: { color: "#3f7ce0", fontWeight: "600" },
});
