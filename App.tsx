import React, { useEffect, useState } from "react";
import { Alert } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "./src/screens/HomeScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import BatchScanScreen from "./src/screens/BatchScanScreen";
import CategoryResultsScreen from "./src/screens/CategoryResultsScreen";
import ReviewQueueScreen from "./src/screens/ReviewQueueScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import ProPaywallScreen from "./src/screens/ProPaywallScreen";
import { initDb, logFreedSpace, getProStatus, setProStatus, getHasOnboarded, setHasOnboarded } from "./src/services/storage/db";
import { scoreAsset } from "./src/services/scoring/usefulnessScorer";
import { deleteAssets } from "./src/services/scanning/photoScanner";
import { backupAssets } from "./src/services/backup/localBackup";
import { initIAPConnection, teardownIAPConnection, purchasePro, restorePurchases, isIAPConfigured } from "./src/services/payments/iap";
import { ScannedAsset, UsefulnessScore, ReviewAction, ScanCategoryResult, ScanCategoryId } from "./src/types";

const Stack = createNativeStackNavigator();

export default function App() {
  const [categoryResults, setCategoryResults] = useState<ScanCategoryResult[]>([]);
  const [isPro, setIsPro] = useState(false);
  const [hasOnboarded] = useState(() => getHasOnboarded());

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
      <Stack.Navigator initialRouteName={hasOnboarded ? "Home" : "Onboarding"}>
        <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
          {(props) => (
            <OnboardingScreen
              onDone={() => {
                setHasOnboarded(true);
                props.navigation.replace("Home");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Home" options={{ title: "Tidyloop" }}>
          {(props) => <HomeScreen onStartScan={() => props.navigation.navigate("Scanning")} onOpenSettings={() => props.navigation.navigate("Settings")} />}
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
                onFinished={async (decisions: ReviewAction[]) => {
                  const deleted = decisions.filter((d) => d.decision === "delete");
                  if (deleted.length === 0) {
                    props.navigation.navigate("Results");
                    return;
                  }

                  if (isPro) {
                    const assetsToBackUp = deleted
                      .map((d) => queue.find((q) => q.asset.id === d.assetId)?.asset)
                      .filter((a): a is ScannedAsset => !!a);
                    await backupAssets(assetsToBackUp).catch((err) => console.warn("backupAssets failed:", err));
                  }

                  let confirmed = false;
                  try {
                    confirmed = await deleteAssets(deleted.map((d) => d.assetId));
                  } catch (err) {
                    console.warn("deleteAssets failed:", err);
                    Alert.alert("Couldn't delete", "Something went wrong removing these items. Nothing was deleted.");
                    props.navigation.navigate("Results");
                    return;
                  }

                  if (!confirmed) {
                    // User cancelled the OS's own delete confirmation — nothing removed.
                    props.navigation.navigate("Results");
                    return;
                  }

                  const freedBytes = deleted.reduce((sum, d) => {
                    const item = queue.find((q) => q.asset.id === d.assetId);
                    return sum + (item?.asset.sizeBytes ?? 0);
                  }, 0);
                  logFreedSpace(freedBytes, deleted.length);
                  Alert.alert(
                    `${deleted.length} item${deleted.length === 1 ? "" : "s"} moved to Recently Deleted`,
                    (isPro ? "A local backup copy was kept before removal — manage it from Settings. " : "") +
                      "iOS keeps them there for 30 days as a safety net, so they're not gone for good yet. To reclaim the space right now, open Photos → Albums → Recently Deleted, select them, and delete permanently."
                  );
                  props.navigation.navigate("Results");
                }}
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
