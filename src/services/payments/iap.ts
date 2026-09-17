/**
 * iap.ts
 *
 * Pro purchases via RevenueCat (react-native-purchases), which wraps
 * Apple/Google's own purchase systems — required for unlocking any
 * digital feature inside the app (Stripe cannot be used for this, per
 * App Store/Play Store policy).
 *
 * Three tiers, side by side: a one-time lifetime unlock, and monthly/
 * annual subscriptions — all granting the same "pro" entitlement.
 *
 * SETUP REQUIRED BEFORE THIS WORKS (not code — dashboard configuration):
 *   1. Create a free RevenueCat account at revenuecat.com, add your app.
 *   2. In App Store Connect / Play Console, create THREE products: a
 *      non-consumable lifetime unlock, an auto-renewable monthly
 *      subscription, and an auto-renewable annual subscription. Link all
 *      three inside RevenueCat under Products.
 *   3. In RevenueCat, create an Entitlement called "pro" and attach all
 *      three products to it, then create an Offering with three
 *      Packages using the predefined "Lifetime", "Monthly", and "Annual"
 *      package types (getProOffering() below reads offering.lifetime /
 *      .monthly / .annual, which only populate for those exact types).
 *   4. Paste your RevenueCat public API keys below (Project Settings >
 *      API Keys in the RevenueCat dashboard — separate keys for iOS/Android).
 *
 * Without a real API key, initIAPConnection() logs a warning and no-ops
 * instead of crashing — the rest of the app works fine either way.
 */

import Purchases, { CustomerInfo, PurchasesOffering, PurchasesPackage, LOG_LEVEL } from "react-native-purchases";
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

// Lets the UI (the Pro paywall screen) tell a real purchase flow apart
// from an unconfigured dev build, e.g. to offer a dev-only unlock so Pro
// gated behavior stays testable before RevenueCat keys are set.
export const isIAPConfigured = !!REVENUECAT_API_KEY && !REVENUECAT_API_KEY.includes("REPLACE_WITH");

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

export interface ProPricingTiers {
  lifetime: PurchasesPackage | null;
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

/** Reads the three predefined package types straight off the offering —
 * these only populate if the RevenueCat dashboard Offering actually uses
 * the "Lifetime"/"Monthly"/"Annual" predefined package identifiers. */
export async function getProPricingTiers(): Promise<ProPricingTiers> {
  const offering = await getProOffering();
  return {
    lifetime: offering?.lifetime ?? null,
    monthly: offering?.monthly ?? null,
    annual: offering?.annual ?? null,
  };
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<void> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  handleCustomerInfo(customerInfo, () => {});
}

export async function restorePurchases(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  const isPro = !!info.entitlements.active[PRO_ENTITLEMENT_ID];
  if (isPro) setProStatus(true);
  return isPro;
}
