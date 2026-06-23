/**
 * Sourcing tier gates (Sourcing CRM — Phase 4).
 *
 * Confirmed model (Cam, Phase 4 gate):
 *   - Discovery (Discover / Smart Picks / Mutual Interest / pipeline board): FREE
 *   - Manual outbound (messaging a prospect): Growth+  ← dsoCanUseSourcingOutbound
 *   - Automated prospect sequences: Scale+ (reuses dsoCanUseSequences)
 *
 * Mirrors src/lib/sequences/tier.ts.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const SOURCING_OUTBOUND_TIERS = new Set(["growth", "scale", "enterprise"]);

export async function dsoCanUseSourcingOutbound(
  supabase: SupabaseClient,
  dsoId: string,
): Promise<boolean> {
  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub) return false;
  return SOURCING_OUTBOUND_TIERS.has(sub.tier);
}
