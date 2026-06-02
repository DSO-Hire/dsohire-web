/**
 * Tier-gating for the N13 automation rules builder.
 *
 * Fork B (Cam, Day 25): CUSTOM rules are a Scale+ differentiator. The
 * seeded `is_system` default rule runs for EVERY tier (so no DSO loses
 * today's stage emails) — only the create/edit of CUSTOM rules is gated.
 * Single source of truth so the gate isn't sprinkled across the page +
 * server actions.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Tiers that unlock the custom automation-rule builder. */
export const AUTOMATION_TIERS = new Set(["scale", "enterprise"]);

/**
 * True iff the DSO has an active Scale or Enterprise subscription. Use to
 * gate: the builder's create/edit affordance (locked state when false) +
 * the create/update server actions (defense-in-depth). Does NOT affect the
 * seeded default rule, which runs regardless of tier.
 */
export async function dsoCanUseAutomationRules(
  supabase: SupabaseClient,
  dsoId: string
): Promise<boolean> {
  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub) return false;
  return AUTOMATION_TIERS.has(sub.tier);
}
