/**
 * Shared Supabase project credentials, used by both leadCapture.ts and
 * payItForward.ts — one project, two feature areas. Same placeholder
 * pattern as RevenueCat in iap.ts: without real values, callers degrade
 * gracefully (warn + no-op) instead of throwing, so development isn't
 * blocked before the project exists.
 */

export const SUPABASE_URL = "https://REPLACE_WITH_YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "REPLACE_WITH_YOUR_ANON_KEY";

export const isSupabaseConfigured =
  !SUPABASE_URL.includes("REPLACE_WITH") && !SUPABASE_ANON_KEY.includes("REPLACE_WITH");

export function supabaseHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}
