/**
 * payItForward.ts — "every Pro purchase funds a free unlock for someone
 * who can't afford it," made real.
 *
 * The random-pick-and-6-month-cooldown logic runs entirely INSIDE
 * Postgres (as two functions you paste into the Supabase SQL editor,
 * same as the leads table setup), not in this file — a client can never
 * be trusted to correctly enforce "don't grant the same phone number
 * twice within 6 months" on its own; it has to be atomic and server-side.
 * This file only calls those functions over Supabase's REST RPC endpoint.
 *
 * KNOWN LIMITATION (be aware of this, not a bug): the trigger for
 * "someone paid, run the drawing" is a client-side call right after a
 * purchase succeeds (see App.tsx's handleUpgrade). A sufficiently
 * determined person could fake that network call without ever actually
 * purchasing. The blast radius of that abuse is low — worst case, a
 * random *other* waitlisted person gets an unearned free unlock; no
 * money moves, no one's real purchase is affected — but if this ever
 * needs to be airtight, the fix is a RevenueCat webhook (dashboard
 * config) into a Supabase Edge Function that verifies the purchase
 * event server-side before running the drawing, instead of trusting the
 * app to say "a purchase just happened."
 *
 * SETUP REQUIRED BEFORE THIS WORKS (paste into the same Supabase project
 * as leadCapture.ts's `leads` table — Project Settings > API URL/anon key
 * live in src/services/supabase/config.ts, shared by both files):
 *
 *   create table pay_it_forward_requests (
 *     id uuid primary key default gen_random_uuid(),
 *     phone text not null,
 *     requested_at timestamptz not null default now(),
 *     fulfilled boolean not null default false
 *   );
 *   create table pay_it_forward_grants (
 *     phone text primary key,
 *     granted_at timestamptz not null default now(),
 *     consumed boolean not null default false
 *   );
 *   alter table pay_it_forward_requests enable row level security;
 *   alter table pay_it_forward_grants enable row level security;
 *   -- anon can only ever INSERT a request for themselves — no SELECT,
 *   -- so no one can read the waitlist. Grants table has NO anon policies
 *   -- at all (default deny) — it's only ever touched through the two
 *   -- functions below, both marked `security definer`.
 *   create policy "anon can request a free unlock"
 *     on pay_it_forward_requests for insert to anon with check (true);
 *
 *   create or replace function grant_random_pay_it_forward()
 *   returns text
 *   language plpgsql
 *   security definer
 *   as $$
 *   declare
 *     winner_phone text;
 *   begin
 *     select r.phone into winner_phone
 *     from pay_it_forward_requests r
 *     where r.fulfilled = false
 *       and not exists (
 *         select 1 from pay_it_forward_grants g
 *         where g.phone = r.phone and g.granted_at > now() - interval '6 months'
 *       )
 *     order by random()
 *     limit 1;
 *
 *     if winner_phone is null then
 *       return null;
 *     end if;
 *
 *     insert into pay_it_forward_grants (phone, granted_at, consumed)
 *     values (winner_phone, now(), false)
 *     on conflict (phone) do update set granted_at = now(), consumed = false;
 *
 *     update pay_it_forward_requests
 *     set fulfilled = true
 *     where phone = winner_phone and fulfilled = false;
 *
 *     return winner_phone;
 *   end;
 *   $$;
 *   grant execute on function grant_random_pay_it_forward() to anon;
 *
 *   create or replace function check_and_consume_pay_it_forward_grant(p_phone text)
 *   returns boolean
 *   language plpgsql
 *   security definer
 *   as $$
 *   declare
 *     found boolean;
 *   begin
 *     select exists(
 *       select 1 from pay_it_forward_grants
 *       where phone = p_phone and consumed = false
 *     ) into found;
 *
 *     if found then
 *       update pay_it_forward_grants set consumed = true where phone = p_phone;
 *     end if;
 *
 *     return found;
 *   end;
 *   $$;
 *   grant execute on function check_and_consume_pay_it_forward_grant(text) to anon;
 *
 * Without real Supabase credentials, every function here logs a warning
 * and no-ops/returns false — nothing blocks or breaks.
 */

import { SUPABASE_URL, isSupabaseConfigured, supabaseHeaders } from "../supabase/config";

/** Called from Settings' "I can't afford Pro right now" — joins the waitlist. */
export async function requestFreeUnlock(phone: string): Promise<void> {
  if (!isSupabaseConfigured) {
    console.warn("Pay-it-forward backend not configured yet — see src/services/payItForward/payItForward.ts.");
    return;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pay_it_forward_requests`, {
    method: "POST",
    headers: { ...supabaseHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`requestFreeUnlock failed (${res.status}): ${body}`);
  }
}

/** Called right after a real purchase succeeds — runs the drawing server-side. */
export async function triggerRandomGrant(): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/grant_random_pay_it_forward`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({}),
    });
  } catch (err) {
    // Best-effort — a failure here should never surface to the person
    // who just paid; the drawing simply doesn't run this time.
    console.warn("triggerRandomGrant failed:", err);
  }
}

/** Called on every app launch: "did I win a free unlock?" */
export async function checkAndConsumeGrant(phone: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_and_consume_pay_it_forward_grant`, {
      method: "POST",
      headers: supabaseHeaders(),
      body: JSON.stringify({ p_phone: phone }),
    });
    if (!res.ok) return false;
    const won = await res.json();
    return won === true;
  } catch (err) {
    console.warn("checkAndConsumeGrant failed:", err);
    return false;
  }
}
