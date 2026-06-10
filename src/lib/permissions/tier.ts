/**
 * #83 Phase 3 — tier gate for the per-teammate permission EDITOR.
 *
 * Enforcement (can()/effectivePermissions) runs on every tier — presets
 * always apply. Only the ability to CREATE overrides is Growth+; Solo
 * sees role presets read-only with an upgrade nudge (Cam's locked call,
 * mirrors Greenhouse putting custom access levels behind paid tiers).
 *
 * Modeled on lib/email/templates/tier.ts — single source of truth.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Tiers that unlock per-teammate permission overrides. */
const PERMISSION_EDITOR_TIERS = new Set(["growth", "scale", "enterprise"]);

export async function dsoCanEditPermissions(
  supabase: SupabaseClient,
  dsoId: string
): Promise<boolean> {
  const sub = await getActiveSubscription(supabase, dsoId);
  if (!sub) return false;
  return PERMISSION_EDITOR_TIERS.has(sub.tier);
}
