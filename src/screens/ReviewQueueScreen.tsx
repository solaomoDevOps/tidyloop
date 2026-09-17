import React, { useRef, useState, useEffect } from "react";
import { View, Text, Animated, PanResponder, Pressable, StyleSheet, Image, Easing } from "react-native";
import { ScannedAsset, UsefulnessScore, ReviewAction, ReviewDecision } from "../types";
import { recordReviewAction } from "../services/storage/db";
import { formatBytes } from "../components/format";

interface Props {
  queue: { asset: ScannedAsset; score: UsefulnessScore }[];
  onFinished: (decisions: ReviewAction[]) => void;
}

const SWIPE_THRESHOLD = 120;

export default function ReviewQueueScreen({ queue, onFinished }: Props) {
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<ReviewAction[]>([]);
  const [undoStack, setUndoStack] = useState<ReviewAction[]>([]);
  const [complete, setComplete] = useState(false);
  const position = useRef(new Animated.ValueXY()).current;

  const current = queue[index];

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          completeSwipe("keep");
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          completeSwipe("delete");
        } else {
          Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false, friction: 5 }).start();
        }
      },
    })
  ).current;

  function completeSwipe(decision: ReviewDecision) {
    if (!current) return;
    const toValue = decision === "keep" ? { x: 500, y: 0 } : decision === "delete" ? { x: -500, y: 0 } : { x: 0, y: -500 };
    Animated.timing(position, { toValue, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
      const action: ReviewAction = { assetId: current.asset.id, decision, decidedAt: Date.now() };
      recordReviewAction(action);
      const nextDecisions = [...decisions, action];
      setDecisions(nextDecisions);
      setUndoStack((s) => [...s, action]);
      position.setValue({ x: 0, y: 0 });

      if (index + 1 >= queue.length) {
        setComplete(true);
      } else {
        setIndex(index + 1);
      }
    });
  }

  function undo() {
    if (undoStack.length === 0 || index === 0) return;
    setIndex(index - 1);
    setDecisions((d) => d.slice(0, -1));
    setUndoStack((s) => s.slice(0, -1));
  }

  if (complete) {
    return <CompletionScreen decisions={decisions} queue={queue} onDone={() => onFinished(decisions)} />;
  }

  if (!current) {
    return (
      <View style={styles.container}>
        <Text style={styles.doneText}>Nothing left to review here.</Text>
      </View>
    );
  }

  const rotate = position.x.interpolate({
    inputRange: [-300, 0, 300],
    outputRange: ["-15deg", "0deg", "15deg"],
  });

  const keepOverlayOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 0.85],
    extrapolate: "clamp",
  });
  const deleteOverlayOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [0.85, 0],
    extrapolate: "clamp",
  });

  const canCompress = current.asset.kind === "photo" || current.asset.kind === "video";

  return (
    <View style={styles.container}>
      <Text style={styles.counter}>
        {index + 1} of {queue.length}
      </Text>

      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.card, { transform: [...position.getTranslateTransform(), { rotate }] }]}
      >
        {current.asset.previewUri ? (
          <Image source={{ uri: current.asset.previewUri }} style={styles.thumbnail} resizeMode="cover" />
        ) : (
          <View style={[styles.thumbnail, styles.noPreview]}>
            <Text style={styles.noPreviewIcon}>{current.asset.kind === "video" ? "🎬" : "🖼️"}</Text>
            <Text style={styles.noPreviewText}>No preview available</Text>
          </View>
        )}

        <Animated.View pointerEvents="none" style={[styles.overlay, styles.keepOverlay, { opacity: keepOverlayOpacity }]}>
          <Text style={styles.overlayText}>KEEP</Text>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.overlay, styles.deleteOverlay, { opacity: deleteOverlayOpacity }]}>
          <Text style={styles.overlayText}>DELETE</Text>
        </Animated.View>

        <View style={styles.reasonBox}>
          <Text style={styles.sizeText}>{formatBytes(current.asset.sizeBytes)}</Text>
          {current.score.reasons.map((r, i) => (
            <Text key={i} style={[styles.reasonLine, r.weight < 0 ? styles.reasonNeg : styles.reasonPos]}>
              {r.weight >= 0 ? "+" : ""}
              {r.weight} · {r.label}
            </Text>
          ))}
        </View>
      </Animated.View>

      <View style={styles.actionsRow}>
        <Pressable style={[styles.actionButton, styles.deleteButton]} onPress={() => completeSwipe("delete")}>
          <Text style={styles.actionText}>Delete</Text>
        </Pressable>
        {canCompress && (
          <Pressable style={[styles.actionButton, styles.compressButton]} onPress={() => completeSwipe("compress")}>
            <Text style={styles.actionText}>Compress</Text>
          </Pressable>
        )}
        <Pressable style={styles.undoButton} onPress={undo}>
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.keepButton]} onPress={() => completeSwipe("keep")}>
          <Text style={styles.actionText}>Keep</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        Swipe right to keep, left to delete, or compress to shrink instead. Nothing is final until you confirm at the end.
      </Text>
    </View>
  );
}

function CompletionScreen({
  decisions,
  queue,
  onDone,
}: {
  decisions: ReviewAction[];
  queue: { asset: ScannedAsset; score: UsefulnessScore }[];
  onDone: () => void;
}) {
  const freedBytes = decisions
    .filter((d) => d.decision === "delete")
    .reduce((sum, d) => sum + (queue.find((q) => q.asset.id === d.assetId)?.asset.sizeBytes ?? 0), 0);
  const keptCount = decisions.filter((d) => d.decision === "keep").length;
  const deletedCount = decisions.filter((d) => d.decision === "delete").length;
  const compressedCount = decisions.filter((d) => d.decision === "compress").length;

  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeRotate = useRef(new Animated.Value(0)).current;
  const numberCount = useRef(new Animated.Value(0)).current;
  const [displayedBytes, setDisplayedBytes] = useState(0);
  const rays = useRef(Array.from({ length: 8 }, () => new Animated.Value(0))).current;

  useEffect(() => {
    const sub = numberCount.addListener(({ value }) => setDisplayedBytes(Math.round(value)));

    Animated.sequence([
      Animated.spring(badgeScale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }),
    ]).start();

    Animated.timing(badgeRotate, { toValue: 1, duration: 500, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }).start();

    Animated.timing(numberCount, { toValue: freedBytes, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();

    Animated.stagger(
      40,
      rays.map((r) => Animated.timing(r, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }))
    ).start();

    return () => numberCount.removeListener(sub);
  }, []);

  const rotateDeg = badgeRotate.interpolate({ inputRange: [0, 1], outputRange: ["-30deg", "0deg"] });

  return (
    <View style={completionStyles.container}>
      <View style={completionStyles.badgeWrap}>
        {rays.map((r, i) => {
          const angle = (360 / rays.length) * i;
          const distance = r.interpolate({ inputRange: [0, 1], outputRange: [0, 70] });
          return (
            <Animated.View
              key={i}
              style={[
                completionStyles.ray,
                {
                  opacity: r,
                  transform: [
                    { rotate: `${angle}deg` },
                    { translateY: Animated.multiply(distance, -1) },
                  ],
                },
              ]}
            />
          );
        })}
        <Animated.View style={[completionStyles.badge, { transform: [{ scale: badgeScale }, { rotate: rotateDeg }] }]}>
          <Text style={completionStyles.badgeCheck}>✓</Text>
        </Animated.View>
      </View>

      <Text style={completionStyles.headline}>{formatBytes(displayedBytes)} freed</Text>
      <Text style={completionStyles.subtext}>
        {deletedCount} removed · {keptCount} kept
        {compressedCount > 0 ? ` · ${compressedCount} to compress` : ""} — exactly what you chose.
      </Text>
      {compressedCount > 0 && (
        <Text style={completionStyles.compressNote}>
          Compression runs next — the exact space it saves depends on each file, so it isn't counted above yet.
        </Text>
      )}

      <Pressable style={completionStyles.doneButton} onPress={onDone}>
        <Text style={completionStyles.doneButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, alignItems: "center", gap: 16 },
  counter: { color: "#888" },
  card: { width: "100%", aspectRatio: 0.8, borderRadius: 26, backgroundColor: "#eee", overflow: "hidden" },
  thumbnail: { width: "100%", height: "70%" },
  noPreview: { alignItems: "center", justifyContent: "center", backgroundColor: "#e4e8f2", gap: 6 },
  noPreviewIcon: { fontSize: 36 },
  noPreviewText: { fontSize: 12, color: "#8a92a8", fontWeight: "600" },
  overlay: { position: "absolute", top: 28, paddingVertical: 8, paddingHorizontal: 18, borderRadius: 999, shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  keepOverlay: { left: 24, backgroundColor: "#2a8f4f", transform: [{ rotate: "-12deg" }] },
  deleteOverlay: { right: 24, backgroundColor: "#e05555", transform: [{ rotate: "12deg" }] },
  overlayText: { fontWeight: "800", fontSize: 20, letterSpacing: 1, color: "white" },
  reasonBox: { padding: 14, gap: 4 },
  sizeText: { fontWeight: "700", fontSize: 16, color: "#1b2a4a" },
  reasonLine: { fontSize: 12 },
  reasonPos: { color: "#2a7a45" },
  reasonNeg: { color: "#b23b3b" },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "center" },
  actionButton: { paddingVertical: 14, paddingHorizontal: 22, borderRadius: 16, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  deleteButton: { backgroundColor: "#e05555", shadowColor: "#e05555" },
  compressButton: { backgroundColor: "#4fc3fb", shadowColor: "#4fc3fb" },
  keepButton: { backgroundColor: "#2a8f4f", shadowColor: "#2a8f4f" },
  actionText: { color: "white", fontWeight: "700" },
  undoButton: { paddingVertical: 10, paddingHorizontal: 16 },
  undoText: { color: "#666", fontWeight: "600" },
  doneText: { fontSize: 18, color: "#555" },
  hint: { fontSize: 12, color: "#999", textAlign: "center" },
});

const completionStyles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#f7f8fc", padding: 24 },
  badgeWrap: { width: 120, height: 120, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  ray: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: "#7fd88a" },
  badge: { width: 96, height: 96, borderRadius: 48, backgroundColor: "#2a8f4f", alignItems: "center", justifyContent: "center" },
  badgeCheck: { color: "white", fontSize: 44, fontWeight: "800" },
  headline: { fontSize: 30, fontWeight: "800", color: "#1b2a4a" },
  subtext: { fontSize: 14, color: "#6b7488", textAlign: "center" },
  compressNote: { fontSize: 12, color: "#4fc3fb", textAlign: "center", paddingHorizontal: 12 },
  doneButton: { marginTop: 24, backgroundColor: "#3f7ce0", paddingVertical: 14, paddingHorizontal: 40, borderRadius: 14 },
  doneButtonText: { color: "white", fontWeight: "700", fontSize: 16 },
});
