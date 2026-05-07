/**
 * Tier-gating helper for the email templates feature (Phase 4.5.f).
 *
 * Custom email templates are a Growth + Enterprise feature. Starter
 * subscribers see the editor as a Pro+ feature with a padlock state, and
 * the dispatch-path lookup short-circuits for them — the system falls
 * back to the default React Email component as if nothing changed.
 *
 * Single source of truth here so we don't sprinkle tier checks across
 * the editor + dispatcher.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Tiers that unlock custom email templates. */
const CUSTOM_TEMPLATE_TIERS = new Set(["growth", "enterprise"]);

/**
 * Returns true iff the DSO has an active subscription on Growth or Enterprise.
 * Use this to gate:
 *   - The editor's edit affordance (locked padlock when false)
 *   - The dispatch path's custom-template lookup
 */
export async function dsoCanUseCustomTemplates(
  supabase: SupabaseClient,
  dsoId: string
): Promise<boolean> {
  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub) return false;
  return CUSTOM_TEMPLATE_TIERS.has(sub.tier);
}
