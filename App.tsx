import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "./src/screens/HomeScreen";
import BatchScanScreen from "./src/screens/BatchScanScreen";
import CategoryResultsScreen from "./src/screens/CategoryResultsScreen";
import ReviewQueueScreen from "./src/screens/ReviewQueueScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import { initDb, logFreedSpace, getProStatus } from "./src/services/storage/db";
import { scoreAsset } from "./src/services/scoring/usefulnessScorer";
import { initIAPConnection, teardownIAPConnection, purchasePro, restorePurchases } from "./src/services/payments/iap";
import { ScannedAsset, UsefulnessScore, ReviewAction, ScanCategoryResult, ScanCategoryId } from "./src/types";

const Stack = createNativeStackNavigator();

export default function App() {
  const [categoryResults, setCategoryResults] = useState<ScanCategoryResult[]>([]);
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    initDb();
    setIsPro(getProStatus());

    initIAPConnection(() => setIsPro(true)).catch((err) => {
      // Expected to fail in Expo Go / simulators without a signed-in
      // sandbox account — logged, not surfaced as a user-facing error,
      // since the rest of the app works fine without it.
      console.warn("IAP connection failed to initialize:", err);
    });

    return () => teardownIAPConnection();
  }, []);

  async function handleUpgrade() {
    try {
      await purchasePro();
    } catch (err) {
      console.warn("purchasePro failed:", err);
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
      <Stack.Navigator>
        <Stack.Screen name="Home" options={{ title: "Tidyloop" }}>
          {(props) => <HomeScreen onStartScan={() => props.navigation.navigate("Scanning")} onOpenSettings={() => props.navigation.navigate("Settings")} />}
        </Stack.Screen>

        <Stack.Screen name="Scanning" options={{ headerShown: false }}>
          {(props) => (
            <BatchScanScreen
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
              onReviewCategory={(categoryId: ScanCategoryId) => {
                const category = categoryResults.find((r) => r.categoryId === categoryId);
                if (!category) return;
                const queue = category.assets
                  .map((asset) => ({ asset, score: scoreAsset(asset) }))
                  .sort((a, b) => a.score.score - b.score.score);
                props.navigation.navigate("Review", { queue });
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Review" options={{ title: "Review" }}>
          {(props) => {
            const { queue } = props.route.params as { queue: { asset: ScannedAsset; score: UsefulnessScore }[] };
            return (
              <ReviewQueueScreen
                queue={queue}
                onFinished={(decisions: ReviewAction[]) => {
                  const deleted = decisions.filter((d) => d.decision === "delete");
                  const freedBytes = deleted.reduce((sum, d) => {
                    const item = queue.find((q) => q.asset.id === d.assetId);
                    return sum + (item?.asset.sizeBytes ?? 0);
                  }, 0);
                  if (deleted.length > 0) logFreedSpace(freedBytes, deleted.length);
                  props.navigation.navigate("Results");
                }}
              />
            );
          }}
        </Stack.Screen>

        <Stack.Screen name="Settings" options={{ title: "Settings" }}>
          {() => (
            <SettingsScreen
              peopleHelpedThisMonth={0}
              isPro={isPro}
              onUpgrade={handleUpgrade}
              onRestore={handleRestore}
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
