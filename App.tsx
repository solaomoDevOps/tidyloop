import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "./src/screens/HomeScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import LeadCaptureScreen from "./src/screens/LeadCaptureScreen";
import BatchScanScreen from "./src/screens/BatchScanScreen";
import CategoryResultsScreen from "./src/screens/CategoryResultsScreen";
import ReviewFlowScreen from "./src/screens/ReviewFlowScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ProPaywallScreen from "./src/screens/ProPaywallScreen";
import {
  initDb,
  getProStatus,
  setProStatus,
  getHasOnboarded,
  setHasOnboarded,
  getHasSubmittedLead,
  setHasSubmittedLead,
} from "./src/services/storage/db";
import { scoreAsset } from "./src/services/scoring/usefulnessScorer";
import { getQuickPreviewAssets } from "./src/services/scanning/photoScanner";
import { initIAPConnection, teardownIAPConnection, purchasePackage, restorePurchases, isIAPConfigured } from "./src/services/payments/iap";
import { retryPendingLead } from "./src/services/leads/leadCapture";
import { ScannedAsset, UsefulnessScore, ScanCategoryResult, ScanCategoryId, DuplicateGroup } from "./src/types";
import type { PurchasesPackage } from "react-native-purchases";

const Stack = createNativeStackNavigator();

export default function App() {
  const [categoryResults, setCategoryResults] = useState<ScanCategoryResult[]>([]);
  const [isPro, setIsPro] = useState(false);
  const [hasOnboarded] = useState(() => getHasOnboarded());
  const [hasSubmittedLead, setHasSubmittedLeadState] = useState(() => getHasSubmittedLead());

  useEffect(() => {
    initDb();
    setIsPro(getProStatus());
    retryPendingLead().catch((err) => console.warn("retryPendingLead failed:", err));

    initIAPConnection(() => setIsPro(true)).catch((err) => {
      // Expected to fail in Expo Go / simulators without a signed-in
      // sandbox account — logged, not surfaced as a user-facing error,
      // since the rest of the app works fine without it.
      console.warn("IAP connection failed to initialize:", err);
    });

    return () => teardownIAPConnection();
  }, []);

  async function handleUpgrade(pkg: PurchasesPackage) {
    try {
      await purchasePackage(pkg);
    } catch (err) {
      console.warn("purchasePackage failed:", err);
      Alert.alert("Purchase couldn't start", "Please try again in a moment.");
    }
  }

  async function handleRestore() {
    const restored = await restorePurchases().catch(() => false);
    setIsPro(getProStatus());
    Alert.alert(restored ? "Restored" : "Nothing to restore", restored ? "Pro is unlocked." : "No previous purchase found on this account.");
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={!hasOnboarded ? "Onboarding" : !hasSubmittedLead ? "LeadCapture" : "Home"}
        screenOptions={{
          headerStyle: { backgroundColor: "#f7f8fc" },
          headerShadowVisible: false,
          headerTitleStyle: { fontWeight: "800", color: "#1b2a4a", fontSize: 17 },
          headerTintColor: "#2a6df4",
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
          {(props) => (
            <OnboardingScreen
              onDone={() => {
                setHasOnboarded(true);
                props.navigation.replace("LeadCapture");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="LeadCapture" options={{ headerShown: false }}>
          {(props) => (
            <LeadCaptureScreen
              onDone={() => {
                setHasSubmittedLeadState(true);
                props.navigation.replace("Home");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Home" options={{ title: "Tidyloop" }}>
          {(props) => (
            <HomeScreen
              isPro={isPro}
              onStartScan={() => props.navigation.navigate("Scanning")}
              onOpenSettings={() => props.navigation.navigate("Settings")}
              onQuickSwipe={async () => {
                try {
                  const assets = await getQuickPreviewAssets(30);
                  if (assets.length === 0) {
                    Alert.alert("Nothing to preview", "We couldn't find any recent photos right now.");
                    return;
                  }
                  const queue = assets.map((asset) => ({ asset, score: scoreAsset(asset) }));
                  props.navigation.navigate("Review", { queue, returnTo: "Home" });
                } catch (err) {
                  console.warn("Quick preview failed:", err);
                  Alert.alert("Couldn't load preview", err instanceof Error ? err.message : "Something went wrong loading your photos.");
                }
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Scanning" options={{ headerShown: false }}>
          {(props) => (
            <BatchScanScreen
              isPro={isPro}
              onDone={(results) => {
                if (results.length === 0) {
                  props.navigation.navigate("Home");
                  return;
                }
                setCategoryResults(results);
                props.navigation.replace("Results");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Results" options={{ title: "What we found" }}>
          {(props) => (
            <CategoryResultsScreen
              results={categoryResults}
              isPro={isPro}
              onUpgrade={() => props.navigation.navigate("Pro")}
              onReviewCategory={(categoryId: ScanCategoryId) => {
                const category = categoryResults.find((r) => r.categoryId === categoryId);
                if (!category) return;
                if (categoryId === "duplicates" && category.duplicateGroups && category.duplicateGroups.length > 0) {
                  props.navigation.navigate("Review", { duplicateGroups: category.duplicateGroups, returnTo: "Results" });
                  return;
                }
                const queue = category.assets
                  .map((asset) => ({ asset, score: scoreAsset(asset) }))
                  .sort((a, b) => a.score.score - b.score.score);
                props.navigation.navigate("Review", { queue, returnTo: "Results" });
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Review" options={{ title: "Review" }}>
          {(props) => {
            const { queue, duplicateGroups, returnTo } = props.route.params as {
              queue?: { asset: ScannedAsset; score: UsefulnessScore }[];
              duplicateGroups?: DuplicateGroup[];
              returnTo: "Home" | "Results";
            };
            return (
              <ReviewFlowScreen
                queue={queue}
                duplicateGroups={duplicateGroups}
                isPro={isPro}
                onComplete={() => props.navigation.navigate(returnTo)}
                onUpgradeNeeded={() => props.navigation.navigate("Pro")}
              />
            );
          }}
        </Stack.Screen>

        <Stack.Screen name="Settings" options={{ title: "Settings" }}>
          {(props) => (
            <SettingsScreen
              peopleHelpedThisMonth={0}
              isPro={isPro}
              onViewPro={() => props.navigation.navigate("Pro")}
              onRequestFreeUnlock={() => {
                Alert.alert(
                  "Request received",
                  "You've been added to the pay-it-forward waitlist. We'll notify you when a free unlock is available."
                );
                /* TODO: replace with a real backend queue once one exists;
                   for now this is a local acknowledgment only. */
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Pro" options={{ title: "Tidyloop Pro" }}>
          {() => (
            <ProPaywallScreen
              isPro={isPro}
              onUpgrade={handleUpgrade}
              onRestore={handleRestore}
              devSimulateUnlock={
                __DEV__ && !isIAPConfigured
                  ? () => {
                      setProStatus(true);
                      setIsPro(true);
                    }
                  : undefined
              }
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
