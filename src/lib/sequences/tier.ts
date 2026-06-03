/**
 * N16 v2 — tier gate for drip sequences (Scale+). Mirrors the automation +
 * offer-approval tier helpers. Below Scale, the sequence builder + manual
 * enroll are locked; existing enrollments are still processed so a tier
 * change never strands a candidate mid-sequence.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const SEQUENCE_TIERS = new Set(["scale", "enterprise"]);

export async function dsoCanUseSequences(
  supabase: SupabaseClient,
  dsoId: string
): Promise<boolean> {
  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub) return false;
  return SEQUENCE_TIERS.has(sub.tier);
}
