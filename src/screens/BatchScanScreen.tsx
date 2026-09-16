import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet, Easing, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SCAN_CATEGORIES } from "../services/scanning/categoryScanner";
import { runCategorizedScan } from "../services/scanning/categoryScanner";
import { ScanCategoryId, ScanCategoryResult } from "../types";
import { formatBytes } from "../components/format";

interface Props {
  onDone: (results: ScanCategoryResult[]) => void;
  isPro?: boolean;
}

interface CategoryUiState {
  status: "pending" | "active" | "done";
  progress: number;
  scannedCount: number;
  totalCount: number;
  reclaimableBytes: number;
  itemCount: number;
}

const EMPTY_STATE: CategoryUiState = { status: "pending", progress: 0, scannedCount: 0, totalCount: 0, reclaimableBytes: 0, itemCount: 0 };

export default function BatchScanScreen({ onDone, isPro }: Props) {
  const [categoryStates, setCategoryStates] = useState<Record<ScanCategoryId, CategoryUiState>>(
    Object.fromEntries(SCAN_CATEGORIES.map((c) => [c.id, { ...EMPTY_STATE } as CategoryUiState])) as Record<ScanCategoryId, CategoryUiState>
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const totalReclaimed = useRef(new Animated.Value(0)).current;
  const [displayedTotal, setDisplayedTotal] = useState(0);
  const statesRef = useRef(categoryStates);
  statesRef.current = categoryStates;

  useEffect(() => {
    const sub = totalReclaimed.addListener(({ value }) => setDisplayedTotal(value));

    runCategorizedScan({
      onCategoryStart: (id) => {
        setCategoryStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "active" } }));
      },
      onCategoryProgress: (id, scanned, total) => {
        const progress = total > 0 ? scanned / total : 0;
        setCategoryStates((prev) => ({ ...prev, [id]: { ...prev[id], progress, scannedCount: scanned, totalCount: total } }));
      },
      onCategoryComplete: (result) => {
        setCategoryStates((prev) => {
          const next = {
            ...prev,
            [result.categoryId]: {
              ...prev[result.categoryId],
              status: "done" as const,
              progress: 1,
              reclaimableBytes: result.reclaimableBytes,
              itemCount: result.assets.length,
            },
          };
          const total = SCAN_CATEGORIES.reduce((sum, cat) => sum + next[cat.id].reclaimableBytes, 0);
          Animated.timing(totalReclaimed, { toValue: total, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
          return next;
        });
      },
    })
      .then(onDone)
      .catch((err) => {
        console.error("Scan failed:", err);
        setErrorMessage(err?.message ?? "Something went wrong during the scan.");
      });

    return () => sub && totalReclaimed.removeListener(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorMessage) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Scan didn't finish</Text>
        <Text style={styles.errorMessage}>{errorMessage}</Text>
        <Text style={styles.errorHint}>
          This can happen with very large libraries. Try again — completed categories are cached, so a retry is faster.
        </Text>
        <Pressable style={styles.retryButton} onPress={() => onDone([])}>
          <Text style={styles.retryButtonText}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <LinearGradient colors={["#1b2a4a", "#2a4d8f", "#3f7ce0"]} style={styles.container}>
      <Text style={styles.title}>Scanning your storage</Text>
      {isPro && (
        <View style={styles.proBadge}>
          <Text style={styles.proBadgeText}>⚡ Pro speed — 2x concurrency</Text>
        </View>
      )}
      <Text style={styles.reclaimedSoFar}>{formatBytes(displayedTotal)} found so far</Text>

      <View style={styles.list}>
        {SCAN_CATEGORIES.map((cat) => (
          <CategoryRow key={cat.id} label={cat.label} icon={cat.icon} state={categoryStates[cat.id]} />
        ))}
      </View>

      <Text style={styles.footnote}>Every result gets reviewed by you before anything is removed.</Text>
    </LinearGradient>
  );
}

function CategoryRow({ label, icon, state }: { label: string; icon: string; state: CategoryUiState }) {
  const barWidth = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(barWidth, { toValue: state.progress, duration: 250, useNativeDriver: false }).start();
  }, [state.progress]);

  useEffect(() => {
    if (state.status === "done") {
      Animated.spring(checkScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
    }
  }, [state.status]);

  useEffect(() => {
    if (state.status === "active") {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [state.status]);

  const isPending = state.status === "pending";

  return (
    <View style={[rowStyles.row, isPending && rowStyles.rowPending]}>
      <Animated.Text style={[rowStyles.icon, { transform: [{ scale: state.status === "active" ? pulse : 1 }] }]}>
        {icon}
      </Animated.Text>

      <View style={rowStyles.textCol}>
        <Text style={[rowStyles.label, isPending && rowStyles.labelPending]}>{label}</Text>
        <View style={rowStyles.progressTrack}>
          <Animated.View
            style={[rowStyles.progressFill, { width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]}
          />
        </View>
        {state.status === "active" && state.totalCount > 0 && (
          <Text style={rowStyles.liveCount}>{state.scannedCount} of {state.totalCount} checked</Text>
        )}
        {state.status === "done" && (
          <Text style={rowStyles.resultText}>
            {state.itemCount} item{state.itemCount === 1 ? "" : "s"} · {formatBytes(state.reclaimableBytes)}
          </Text>
        )}
      </View>

      {state.status === "done" && (
        <Animated.View style={{ transform: [{ scale: checkScale }] }}>
          <Text style={rowStyles.check}>✓</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 80, gap: 24 },
  title: { fontSize: 24, fontWeight: "700", color: "white", textAlign: "center" },
  proBadge: { alignSelf: "center", backgroundColor: "rgba(244,185,66,0.22)", borderRadius: 10, paddingVertical: 5, paddingHorizontal: 12, marginTop: 8 },
  proBadgeText: { color: "#f4b942", fontSize: 12, fontWeight: "700" },
  reclaimedSoFar: { fontSize: 16, color: "#d7e6ff", textAlign: "center" },
  list: { gap: 14, marginTop: 12 },
  footnote: { fontSize: 12, color: "#cfe0ff", textAlign: "center", marginTop: "auto" },
  errorContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12, backgroundColor: "#f7f8fc" },
  errorTitle: { fontSize: 22, fontWeight: "800", color: "#1b2a4a" },
  errorMessage: { fontSize: 14, color: "#555", textAlign: "center" },
  errorHint: { fontSize: 13, color: "#8189a0", textAlign: "center", marginBottom: 12 },
  retryButton: { backgroundColor: "#3f7ce0", paddingVertical: 14, paddingHorizontal: 32, borderRadius: 14 },
  retryButtonText: { color: "white", fontWeight: "700" },
});

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 16, padding: 14 },
  rowPending: { backgroundColor: "rgba(255,255,255,0.05)" },
  icon: { fontSize: 24 },
  textCol: { flex: 1, gap: 4 },
  label: { color: "white", fontWeight: "600", fontSize: 14 },
  labelPending: { color: "rgba(255,255,255,0.5)" },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#7fd88a", borderRadius: 3 },
  liveCount: { fontSize: 11, color: "#cfe0ff" },
  resultText: { fontSize: 11, color: "#cfe0ff" },
  check: { fontSize: 20, color: "#7fd88a", fontWeight: "800" },
});
