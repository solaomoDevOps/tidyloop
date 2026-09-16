import React, { useEffect, useRef, useState } from "react";
import { View, Text, Animated, StyleSheet, Easing } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SCAN_CATEGORIES } from "../services/scanning/categoryScanner";
import { runCategorizedScan } from "../services/scanning/categoryScanner";
import { ScanCategoryId, ScanCategoryResult } from "../types";
import { formatBytes } from "../components/format";

interface Props {
  onDone: (results: ScanCategoryResult[]) => void;
}

interface CategoryUiState {
  status: "pending" | "active" | "done";
  progress: number; // 0-1
  reclaimableBytes: number;
  itemCount: number;
}

export default function BatchScanScreen({ onDone }: Props) {
  const [categoryStates, setCategoryStates] = useState<Record<ScanCategoryId, CategoryUiState>>(
    Object.fromEntries(
      SCAN_CATEGORIES.map((c) => [c.id, { status: "pending", progress: 0, reclaimableBytes: 0, itemCount: 0 }])
    ) as Record<ScanCategoryId, CategoryUiState>
  );

  const totalReclaimed = useRef(new Animated.Value(0)).current;
  const [displayedTotal, setDisplayedTotal] = useState(0);

  useEffect(() => {
    const sub = totalReclaimed.addListener(({ value }) => setDisplayedTotal(value));

    runCategorizedScan({
      onCategoryStart: (id) => {
        setCategoryStates((prev) => ({ ...prev, [id]: { ...prev[id], status: "active" } }));
      },
      onCategoryProgress: (id, scanned, total) => {
        const progress = total > 0 ? scanned / total : 0;
        setCategoryStates((prev) => ({ ...prev, [id]: { ...prev[id], progress } }));
      },
      onCategoryComplete: (result) => {
        setCategoryStates((prev) => ({
          ...prev,
          [result.categoryId]: {
            status: "done",
            progress: 1,
            reclaimableBytes: result.reclaimableBytes,
            itemCount: result.assets.length,
          },
        }));

        Animated.timing(totalReclaimed, {
          toValue: sumReclaimed({ ...categoryStates }, result),
          duration: 500,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }).start();
      },
    }).then(onDone);

    return () => sub && totalReclaimed.removeListener(sub);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LinearGradient colors={["#1b2a4a", "#2a4d8f", "#3f7ce0"]} style={styles.container}>
      <Text style={styles.title}>Scanning your storage</Text>
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

function sumReclaimed(prevStates: Record<ScanCategoryId, CategoryUiState>, latest: ScanCategoryResult): number {
  let total = 0;
  for (const cat of SCAN_CATEGORIES) {
    total += cat.id === latest.categoryId ? latest.reclaimableBytes : prevStates[cat.id]?.reclaimableBytes ?? 0;
  }
  return total;
}

function CategoryRow({ label, icon, state }: { label: string; icon: string; state: CategoryUiState }) {
  const barWidth = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: state.progress,
      duration: 250,
      useNativeDriver: false,
    }).start();
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
            style={[
              rowStyles.progressFill,
              {
                width: barWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
              },
            ]}
          />
        </View>
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
  reclaimedSoFar: { fontSize: 16, color: "#d7e6ff", textAlign: "center" },
  list: { gap: 14, marginTop: 12 },
  footnote: { fontSize: 12, color: "#cfe0ff", textAlign: "center", marginTop: "auto" },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    padding: 14,
  },
  rowPending: { backgroundColor: "rgba(255,255,255,0.05)" },
  icon: { fontSize: 24 },
  textCol: { flex: 1, gap: 6 },
  label: { color: "white", fontWeight: "600", fontSize: 14 },
  labelPending: { color: "rgba(255,255,255,0.5)" },
  progressTrack: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.15)", overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#7fd88a", borderRadius: 3 },
  resultText: { fontSize: 11, color: "#cfe0ff" },
  check: { fontSize: 20, color: "#7fd88a", fontWeight: "800" },
});
