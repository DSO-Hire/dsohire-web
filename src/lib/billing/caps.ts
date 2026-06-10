/**
 * #88 — plan cap resolution + enforcement helpers.
 *
 * The governing principle (memo §4.6): the advertised number === the enforced
 * number. Caps live in prices.ts (maxActiveJobs / maxSeats per tier); this
 * module resolves them for a DSO and evaluates the job/seat gates.
 *
 * Job cap counts CONCURRENT ACTIVE OPENINGS: the sum of `jobs.openings` across
 * the DSO's `status='active'`, non-deleted jobs. draft / paused / expired /
 * filled / archived do NOT count — pausing a stale req frees a slot.
 */

import {
  PRICING_TIERS,
  isPricingTier,
} from "@/lib/stripe/prices";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface Caps {
  /** null = unlimited. */
  maxActiveJobs: number | null;
  maxSeats: number | null;
}

/**
 * Caps for a tier string. Unknown/missing tier falls back to the most
 * restrictive (Solo) so an unsubscribed/edge account can't bypass the gate;
 * callers still gate on an active subscription separately.
 */
export function resolveCaps(tier: string | null | undefined): Caps {
  if (tier && isPricingTier(tier)) {
    const c = PRICING_TIERS[tier];
    return { maxActiveJobs: c.maxActiveJobs, maxSeats: c.maxSeats };
  }
  return {
    maxActiveJobs: PRICING_TIERS.solo.maxActiveJobs,
    maxSeats: PRICING_TIERS.solo.maxSeats,
  };
}

/** Sum of openings across the DSO's currently-active, non-deleted jobs. */
export async function getActiveOpeningsCount(
  supabase: SupabaseClient,
  dsoId: string,
  opts?: { excludeJobId?: string }
): Promise<number> {
  let query = supabase
    .from("jobs")
    .select("id, openings")
    .eq("dso_id", dsoId)
    .eq("status", "active")
    .is("deleted_at", null);
  if (opts?.excludeJobId) query = query.neq("id", opts.excludeJobId);
  const { data } = await query;
  return ((data ?? []) as Array<{ openings: number | null }>).reduce(
    (sum, r) => sum + (r.openings ?? 1),
    0
  );
}

/** Seats currently consumed (counter maintained on the subscription row). */
export async function getSeatsUsed(
  supabase: SupabaseClient,
  dsoId: string
): Promise<number> {
  const { data } = await supabase
    .from("subscriptions")
    .select("seats_used")
    .eq("dso_id", dsoId)
    .maybeSingle();
  return ((data as { seats_used?: number | null } | null)?.seats_used) ?? 0;
}

/** Fraction (0..1) at/above which we surface an approach nudge. */
export const NUDGE_THRESHOLD = 0.8;

export interface CapCheck {
  /** Whether the action is allowed. */
  ok: boolean;
  /** The cap (null = unlimited). */
  cap: number | null;
  /** Currently consumed (active openings / seats used). */
  used: number;
  /** Slots left before the cap (null = unlimited). */
  remaining: number | null;
  /** What `used` would become if the action proceeds. */
  wouldBe: number;
  /** True once at/over the nudge threshold (post-action), and not unlimited. */
  nearLimit: boolean;
}

/**
 * Evaluate adding `adding` units against a cap. cap === null → unlimited.
 * Used for both job-openings (adding = the job's openings) and seats (adding=1).
 */
export function evaluateCap(
  cap: number | null,
  used: number,
  adding: number
): CapCheck {
  const wouldBe = used + adding;
  if (cap === null) {
    return { ok: true, cap, used, remaining: null, wouldBe, nearLimit: false };
  }
  return {
    ok: wouldBe <= cap,
    cap,
    used,
    remaining: Math.max(0, cap - used),
    wouldBe,
    nearLimit: wouldBe >= Math.ceil(cap * NUDGE_THRESHOLD),
  };
}
