/**
 * leadCapture.ts — sends name/phone collected at onboarding to a Supabase
 * table for marketing follow-up. Uses Supabase's plain REST endpoint
 * (PostgREST) via the built-in `fetch`, not the @supabase/supabase-js SDK —
 * deliberately zero new dependencies, given how much native-build pain
 * the last two additions caused. No native module, no config plugin, no
 * prebuild required for this file.
 *
 * SETUP REQUIRED BEFORE THIS WORKS (not code — dashboard configuration):
 *   1. Create a free project at supabase.com (I can't do this step for
 *      you — account creation always needs to be done by you directly).
 *   2. In the SQL editor, run:
 *
 *        create table leads (
 *          id uuid primary key default gen_random_uuid(),
 *          name text not null,
 *          phone text not null,
 *          consented_marketing boolean not null default false,
 *          created_at timestamptz not null default now()
 *        );
 *        alter table leads enable row level security;
 *        create policy "anon can insert leads"
 *          on leads for insert
 *          to anon
 *          with check (true);
 *
 *      (Row Level Security is on and the policy only allows INSERT, not
 *      SELECT/UPDATE/DELETE — the anon key below can add rows but can't
 *      read, change, or delete anyone's data, including its own.)
 *   3. In Project Settings > API, copy the "Project URL" and the
 *      "anon public" key (NOT the service_role key — that one must never
 *      ship inside an app) into the two constants below.
 *
 * Without real values, submitLead() logs a warning and no-ops instead of
 * throwing — the required onboarding step still completes locally so
 * development isn't blocked while the backend isn't set up yet.
 */

import { getPendingLead, setPendingLead } from "../storage/db";

const SUPABASE_URL = "https://REPLACE_WITH_YOUR_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "REPLACE_WITH_YOUR_ANON_KEY";

export const isLeadCaptureConfigured =
  !SUPABASE_URL.includes("REPLACE_WITH") && !SUPABASE_ANON_KEY.includes("REPLACE_WITH");

export interface LeadInput {
  name: string;
  phone: string;
  consentedMarketing: boolean;
}

export async function submitLead(lead: LeadInput): Promise<void> {
  if (!isLeadCaptureConfigured) {
    console.warn("Lead capture backend not configured yet — see src/services/leads/leadCapture.ts. Continuing without submitting.");
    return;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      name: lead.name,
      phone: lead.phone,
      consented_marketing: lead.consentedMarketing,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Lead capture failed (${res.status}): ${body}`);
  }
}

/**
 * The onboarding screen never blocks on network failure — it saves the
 * lead locally as "pending" and moves on, so a bad connection never
 * locks someone out of a free app. Call this on every app launch to
 * flush anything that didn't make it through last time.
 */
export async function retryPendingLead(): Promise<void> {
  const pending = getPendingLead();
  if (!pending) return;
  try {
    await submitLead(pending);
    setPendingLead(null);
  } catch (err) {
    console.warn("retryPendingLead: still failing, will retry again next launch:", err);
  }
}
