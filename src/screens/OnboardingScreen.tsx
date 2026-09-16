import React, { useRef, useState, useEffect } from "react";
import { View, Text, Image, Pressable, StyleSheet, ScrollView, Animated, Easing, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { onboardingGradients } from "../theme/colors";

interface Props {
  onDone: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface SlideDef {
  image: any;
  headline: string;
  body: string;
  darkText?: boolean;
}

const SLIDES: SlideDef[] = [
  {
    image: require("../../assets/illustrations/onboarding-welcome.png"),
    headline: "Your phone, decluttered",
    body: "Tidyloop finds the duplicates, screenshots, and junk quietly eating your storage.",
  },
  {
    image: require("../../assets/illustrations/onboarding-scan.png"),
    headline: "One scan, sorted for you",
    body: "Junk files, duplicate photos, unused apps — grouped into clear categories, not one big pile.",
  },
  {
    image: require("../../assets/illustrations/onboarding-review.png"),
    headline: "You decide what goes",
    body: "Nothing is ever deleted automatically. Swipe through and approve every single item first.",
  },
  {
    image: require("../../assets/illustrations/onboarding-done.png"),
    headline: "More space, brighter days",
    body: "Free up gigabytes in minutes — everything stays on your device, always.",
    darkText: true,
  },
];

export default function OnboardingScreen({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(newIndex);
  }

  function goNext() {
    if (index >= SLIDES.length - 1) {
      onDone();
      return;
    }
    scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * (index + 1), animated: true });
    setIndex(index + 1);
  }

  const isLast = index === SLIDES.length - 1;
  const [gradStart, gradEnd] = onboardingGradients[index];
  const textColor = SLIDES[index].darkText ? "#1b2a4a" : "#ffffff";

  return (
    <LinearGradient colors={[gradStart, gradEnd]} style={styles.container}>
      {!isLast && (
        <Pressable style={styles.skipLink} onPress={onDone}>
          <Text style={[styles.skipText, { color: textColor }]}>Skip</Text>
        </Pressable>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <Slide key={i} slide={slide} active={i === index} textColor={SLIDES[i].darkText ? "#1b2a4a" : "#ffffff"} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: textColor, opacity: i === index ? 1 : 0.35 }]} />
          ))}
        </View>

        <Pressable style={[styles.nextButton, { backgroundColor: textColor }]} onPress={goNext}>
          <Text style={[styles.nextButtonText, { color: SLIDES[index].darkText ? "#ffffff" : gradStart }]}>
            {isLast ? "Get started" : "Next"}
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
  );
}

function Slide({ slide, active, textColor }: { slide: SlideDef; active: boolean; textColor: string }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: 550,
        easing: Easing.out(Easing.back(1.1)),
        useNativeDriver: true,
      }).start();
    }
  }, [active]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  return (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <Animated.Image
        source={slide.image}
        style={[styles.slideImage, { opacity: anim, transform: [{ scale }] }]}
        resizeMode="contain"
      />
      <Text style={[styles.headline, { color: textColor }]}>{slide.headline}</Text>
      <Text style={[styles.body, { color: textColor }]}>{slide.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipLink: { position: "absolute", top: 60, right: 24, zIndex: 10 },
  skipText: { fontSize: 15, fontWeight: "600" },
  slide: { alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingTop: 60 },
  slideImage: { width: 260, height: 260, marginBottom: 12 },
  headline: { fontSize: 26, fontWeight: "800", textAlign: "center", marginBottom: 10 },
  body: { fontSize: 15, textAlign: "center", opacity: 0.92, lineHeight: 22 },
  footer: { paddingHorizontal: 32, paddingBottom: 48, gap: 24, alignItems: "center" },
  dots: { flexDirection: "row", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  nextButton: { width: "100%", paddingVertical: 16, borderRadius: 16, alignItems: "center" },
  nextButtonText: { fontSize: 16, fontWeight: "700" },
});
