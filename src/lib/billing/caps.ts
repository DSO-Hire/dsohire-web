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
import { getActiveSubscription } from "@/lib/billing/subscription";
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

/**
 * Seats currently consumed = active members + outstanding (unaccepted,
 * unrevoked, unexpired) invitations. We count live rather than reading the
 * `subscriptions.seats_used` column, which isn't maintained anywhere.
 */
export async function getSeatsUsed(
  supabase: SupabaseClient,
  dsoId: string
): Promise<number> {
  const [members, pending] = await Promise.all([
    supabase
      .from("dso_users")
      .select("id", { count: "exact", head: true })
      .eq("dso_id", dsoId),
    supabase
      .from("dso_invitations")
      .select("id", { count: "exact", head: true })
      .eq("dso_id", dsoId)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);
  return (members.count ?? 0) + (pending.count ?? 0);
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

export interface CapUsage {
  cap: number | null; // null = unlimited
  used: number;
  remaining: number | null;
  /** At/above the nudge threshold (80%) but not unlimited. */
  nearLimit: boolean;
  /** At/over the cap. */
  atLimit: boolean;
}

export interface CapStatus {
  tier: string | null;
  jobs: CapUsage;
  seats: CapUsage;
}

function usage(cap: number | null, used: number): CapUsage {
  if (cap === null) {
    return { cap, used, remaining: null, nearLimit: false, atLimit: false };
  }
  return {
    cap,
    used,
    remaining: Math.max(0, cap - used),
    nearLimit: used >= Math.ceil(cap * NUDGE_THRESHOLD),
    atLimit: used >= cap,
  };
}

/** Usage + cap for both jobs and seats — for the approach-nudge banners. */
export async function getCapStatus(
  supabase: SupabaseClient,
  dsoId: string
): Promise<CapStatus> {
  const sub = await getActiveSubscription(supabase, dsoId);
  const caps = resolveCaps(sub?.tier);
  const [jobsUsed, seatsUsed] = await Promise.all([
    getActiveOpeningsCount(supabase, dsoId),
    getSeatsUsed(supabase, dsoId),
  ]);
  return {
    tier: sub?.tier ?? null,
    jobs: usage(caps.maxActiveJobs, jobsUsed),
    seats: usage(caps.maxSeats, seatsUsed),
  };
}

/**
 * Gate for activating a job. Returns an error string to block, or null to
 * allow. `addingOpenings` = the openings on the job being activated. Pass
 * `excludeJobId` when re-activating an existing job so it isn't double-counted.
 * Unlimited tiers (Scale-and-up... Enterprise) always pass.
 */
export async function jobCapBlockError(
  supabase: SupabaseClient,
  dsoId: string,
  addingOpenings: number,
  opts?: { excludeJobId?: string }
): Promise<string | null> {
  const sub = await getActiveSubscription(supabase, dsoId);
  const caps = resolveCaps(sub?.tier);
  if (caps.maxActiveJobs === null) return null; // unlimited
  const used = await getActiveOpeningsCount(supabase, dsoId, opts);
  const check = evaluateCap(caps.maxActiveJobs, used, addingOpenings);
  if (check.ok) return null;
  const noun =
    addingOpenings === 1 ? "this opening" : `these ${addingOpenings} openings`;
  return `Activating ${noun} would put you at ${check.wouldBe} active openings — your plan allows ${caps.maxActiveJobs}. Pause an active listing to free a slot, or upgrade for more capacity and features.`;
}

/**
 * After a downgrade leaves a DSO over its active-openings cap, auto-pause the
 * overflow so they're back under cap. KEEPS the most recently posted openings
 * within cap and pauses the rest (a default the resolver banner lets them
 * re-choose). Flags paused rows with `auto_paused_reason='plan_downgrade'` so
 * the UI can surface "choose what to reactivate". Returns the number paused.
 *
 * Never deletes or fills — only pauses (recoverable). Safe to run on any
 * subscription event; a no-op when at/under cap or on unlimited tiers.
 */
export async function autoPauseOverflowForDowngrade(
  supabase: SupabaseClient,
  dsoId: string,
  tier: string | null | undefined
): Promise<number> {
  const caps = resolveCaps(tier);
  if (caps.maxActiveJobs === null) return 0;

  const { data } = await supabase
    .from("jobs")
    .select("id, openings, posted_at")
    .eq("dso_id", dsoId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false });

  const jobs = (data ?? []) as Array<{ id: string; openings: number | null }>;
  let kept = 0;
  const toPause: string[] = [];
  for (const j of jobs) {
    const o = j.openings ?? 1;
    if (kept + o <= caps.maxActiveJobs) kept += o;
    else toPause.push(j.id);
  }
  if (toPause.length === 0) return 0;

  await supabase
    .from("jobs")
    .update({ status: "paused", auto_paused_reason: "plan_downgrade" })
    .in("id", toPause);
  return toPause.length;
}

/**
 * Gate for adding a teammate (invite). Returns an error string to block, or
 * null to allow. Counts members + pending invites against the seat cap.
 */
export async function seatCapBlockError(
  supabase: SupabaseClient,
  dsoId: string
): Promise<string | null> {
  const sub = await getActiveSubscription(supabase, dsoId);
  const caps = resolveCaps(sub?.tier);
  if (caps.maxSeats === null) return null; // unlimited
  const used = await getSeatsUsed(supabase, dsoId);
  const check = evaluateCap(caps.maxSeats, used, 1);
  if (check.ok) return null;
  return `Your plan's ${caps.maxSeats} admin seats are all in use (members + pending invites). Remove a teammate or a pending invite, or upgrade for more seats and features.`;
}
