/**
 * Shared brand palette, sampled from the actual TidyLoop character art
 * (hoodie/sweater colors, logo gradient) rather than guessed — keeps the
 * in-app color use consistent with the illustrations instead of clashing
 * with them.
 */

export const colors = {
  // core brand (existing buttons/headlines, unchanged)
  navy: "#1b2a4a",
  blue: "#2a6df4",
  blueBright: "#3f7ce0",
  green: "#2a8f4f",
  mint: "#7fd88a",

  // accent hues pulled from the mascot artwork, for variety across
  // categories/badges/gradients without touching primary CTA color
  sky: "#4fc3fb", // blue hoodie
  pink: "#ff5f88", // pink hoodie
  gold: "#f4b942", // sparkles / yellow sweater

  bg: "#f7f8fc",
  bgSoft: "#eef3ff",
  textMuted: "#5a6482",
  textFaint: "#8a92a8",
} as const;

/** One gradient per onboarding slide — each pairs with that slide's character art. */
export const onboardingGradients: [string, string][] = [
  [colors.blue, colors.sky],
  [colors.green, colors.mint],
  [colors.navy, colors.blue],
  [colors.gold, colors.pink],
];

/** Per-category accent, used for the little icon badge on the results list. */
export const categoryColors: Record<string, string> = {
  duplicates: colors.blue,
  screenshots: colors.sky,
  livePhotos: colors.pink,
  staleFiles: colors.gold,
  largeVideos: colors.green,
};
