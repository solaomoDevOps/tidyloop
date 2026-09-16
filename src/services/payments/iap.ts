/**
 * iap.ts
 *
 * Real one-time Pro purchase via RevenueCat (react-native-purchases), which
 * wraps Apple/Google's own purchase systems — required for unlocking any
 * digital feature inside the app (Stripe cannot be used for this, per
 * App Store/Play Store policy).
 *
 * SETUP REQUIRED BEFORE THIS WORKS (not code — dashboard configuration):
 *   1. Create a free RevenueCat account at revenuecat.com, add your app.
 *   2. In App Store Connect / Play Console, create your one-time Pro
 *      unlock product (see earlier README notes), then link it inside
 *      RevenueCat under Products.
 *   3. In RevenueCat, create an Entitlement called "pro" and attach your
 *      product to it, then create an Offering with a Package containing
 *      that product.
 *   4. Paste your RevenueCat public API keys below (Project Settings >
 *      API Keys in the RevenueCat dashboard — separate keys for iOS/Android).
 *
 * Without a real API key, initIAPConnection() logs a warning and no-ops
 * instead of crashing — the rest of the app works fine either way.
 */

import Purchases, { CustomerInfo, PurchasesOffering, LOG_LEVEL } from "react-native-purchases";
import { Platform } from "react-native";
import { setProStatus } from "../storage/db";

const REVENUECAT_API_KEY = Platform.select({
  ios: "appl_REPLACE_WITH_YOUR_IOS_KEY",
  android: "goog_REPLACE_WITH_YOUR_ANDROID_KEY",
  default: "",
})!;

// Must exactly match the Entitlement identifier you create in the
// RevenueCat dashboard.
const PRO_ENTITLEMENT_ID = "pro";

let listenerAdded = false;

export async function initIAPConnection(onProUnlocked: () => void): Promise<void> {
  if (!REVENUECAT_API_KEY || REVENUECAT_API_KEY.includes("REPLACE_WITH")) {
    console.warn("RevenueCat API key not set yet — see src/services/payments/iap.ts. Pro purchases are disabled until configured.");
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.WARN);
  await Purchases.configure({ apiKey: REVENUECAT_API_KEY });

  if (!listenerAdded) {
    Purchases.addCustomerInfoUpdateListener((info) => handleCustomerInfo(info, onProUnlocked));
    listenerAdded = true;
  }

  const info = await Purchases.getCustomerInfo();
  handleCustomerInfo(info, onProUnlocked);
}

function handleCustomerInfo(info: CustomerInfo, onProUnlocked: () => void): void {
  const isPro = !!info.entitlements.active[PRO_ENTITLEMENT_ID];
  if (isPro) {
    setProStatus(true);
    onProUnlocked();
  }
}

export function teardownIAPConnection(): void {
  // react-native-purchases keeps its listener for the app's lifetime;
  // no explicit disconnect call is needed the way react-native-iap required.
}

export async function getProOffering(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function purchasePro(): Promise<void> {
  const offering = await getProOffering();
  const pkg = offering?.availablePackages[0];
  if (!pkg) {
    throw new Error("No Pro package configured in RevenueCat offerings yet — set up Products/Entitlements/Offerings in the RevenueCat dashboard.");
  }
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  handleCustomerInfo(customerInfo, () => {});
}

export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  const isPro = !!info.entitlements.active[PRO_ENTITLEMENT_ID];
  if (isPro) setProStatus(true);
  return isPro;
}
