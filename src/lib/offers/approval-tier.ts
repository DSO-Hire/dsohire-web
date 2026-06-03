/**
 * N12 Phase 2 — tier gate for the offer-approval mechanism (server-only).
 *
 * Split from approval-policy.ts so the pure gate logic there stays
 * client-importable. Mirrors dsoCanUseAutomationRules: approval chains are
 * a Scale+ control. Below Scale the mechanism is off and every permitted
 * sender sends directly.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { OFFER_APPROVAL_TIERS } from "./approval-policy";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** True iff the DSO has an active Scale or Enterprise subscription. */
export async function dsoCanUseOfferApprovals(
  supabase: SupabaseClient,
  dsoId: string
): Promise<boolean> {
  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub) return false;
  return OFFER_APPROVAL_TIERS.has(sub.tier);
}
