/**
 * Tier 2 in-app support rate limits (LOCKED Day 21 walkthrough).
 *
 * Two checks before any Claude call:
 *   1. checkQuota(user, dso, tier) — soft caps per-user-daily + per-DSO-monthly
 *      based on tier. Hitting the cap = "fall back to email-direct."
 *   2. checkKillSwitch() — hard freeze when per-DSO $/day or global $/day
 *      exceeds the locked threshold. Prevents runaway cost.
 *
 * Both queries are aggregations over claude_usage_log filtered by time.
 * Service-role bypasses RLS so we get the true totals.
 *
 * Spec source of truth for caps:
 * /Users/cam/DSO Hire/Business Plan & Strategy/InApp_Support_Tier_2_Spec_2026-05-27.md
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/* ──────────────────────────────────────────────────────────────
 * LOCKED caps (Day 21 walkthrough — tighter than original spec)
 * ─────────────────────────────────────────────────────────── */

export type TierKey = "solo" | "growth" | "scale" | "enterprise" | "candidate";

interface CapPair {
  monthly: number;
  daily: number;
}

const QUOTAS: Record<TierKey, CapPair> = {
  solo: { monthly: 50, daily: 10 },
  growth: { monthly: 250, daily: 20 },
  scale: { monthly: 1500, daily: 30 },
  enterprise: { monthly: 10000, daily: 50 },
  // Candidate quotas are identical regardless of which DSO(s) they applied to.
  candidate: { monthly: 20, daily: 5 },
};

/** Kill switch thresholds in CENTS (matches cost_cents column). */
const KILL_PER_DSO_CENTS = 1500; // $15
const KILL_GLOBAL_CENTS = 10000; // $100

/* ──────────────────────────────────────────────────────────────
 * Quota check
 * ─────────────────────────────────────────────────────────── */

export interface QuotaResult {
  allowed: boolean;
  /** Human-readable reason when not allowed. */
  reason?: string;
  /** Remaining today across all surfaces for this user. */
  remainingToday: number;
  /** Remaining this month for the DSO (or candidate). */
  remainingMonth: number;
  /** The cap pair used so the UI can show "X / Y" progress. */
  cap: CapPair;
}

export async function checkQuota(args: {
  authUserId: string;
  dsoId: string | null;
  tier: TierKey;
}): Promise<QuotaResult> {
  const cap = QUOTAS[args.tier] ?? QUOTAS.candidate;
  const admin = createSupabaseServiceRoleClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  // Per-user today.
  const { count: todayCount } = await admin
    .from("claude_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("auth_user_id", args.authUserId)
    .gte("created_at", startOfDay.toISOString());

  const usedToday = todayCount ?? 0;

  // Per-DSO this month (or per-user when no DSO — candidate path).
  let usedMonth = 0;
  if (args.dsoId) {
    const { count } = await admin
      .from("claude_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("dso_id", args.dsoId)
      .gte("created_at", startOfMonth.toISOString());
    usedMonth = count ?? 0;
  } else {
    const { count } = await admin
      .from("claude_usage_log")
      .select("id", { count: "exact", head: true })
      .eq("auth_user_id", args.authUserId)
      .gte("created_at", startOfMonth.toISOString());
    usedMonth = count ?? 0;
  }

  const remainingToday = Math.max(0, cap.daily - usedToday);
  const remainingMonth = Math.max(0, cap.monthly - usedMonth);

  if (remainingToday === 0) {
    return {
      allowed: false,
      reason:
        "You've hit your daily Claude support limit. Email support@dsohire.com directly for now — you'll be back to AI support tomorrow.",
      remainingToday: 0,
      remainingMonth,
      cap,
    };
  }
  if (remainingMonth === 0) {
    return {
      allowed: false,
      reason:
        "You've hit your monthly Claude support quota. Email support@dsohire.com directly for now — quota resets at the start of next month.",
      remainingToday,
      remainingMonth: 0,
      cap,
    };
  }

  return { allowed: true, remainingToday, remainingMonth, cap };
}

/* ──────────────────────────────────────────────────────────────
 * Kill switch check — per-DSO + global dollar caps
 * ─────────────────────────────────────────────────────────── */

export interface KillSwitchResult {
  frozen: boolean;
  reason?: string;
  /** Cents spent today by the requesting DSO (or by the user when no DSO). */
  perDsoCentsToday: number;
  /** Cents spent today across ALL customers. */
  globalCentsToday: number;
}

export async function checkKillSwitch(args: {
  authUserId: string;
  dsoId: string | null;
}): Promise<KillSwitchResult> {
  const admin = createSupabaseServiceRoleClient();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  // Per-DSO sum.
  let perDsoCents = 0;
  if (args.dsoId) {
    const { data } = await admin
      .from("claude_usage_log")
      .select("cost_cents")
      .eq("dso_id", args.dsoId)
      .gte("created_at", startOfDay.toISOString());
    perDsoCents = sumCostCents(data);
  } else {
    const { data } = await admin
      .from("claude_usage_log")
      .select("cost_cents")
      .eq("auth_user_id", args.authUserId)
      .gte("created_at", startOfDay.toISOString());
    perDsoCents = sumCostCents(data);
  }

  // Global sum.
  const { data: globalRows } = await admin
    .from("claude_usage_log")
    .select("cost_cents")
    .gte("created_at", startOfDay.toISOString());
  const globalCents = sumCostCents(globalRows);

  if (perDsoCents >= KILL_PER_DSO_CENTS) {
    return {
      frozen: true,
      reason:
        "Daily Claude spend for your account hit the safety cap. AI support is paused for the rest of the day — email support@dsohire.com to keep moving.",
      perDsoCentsToday: perDsoCents,
      globalCentsToday: globalCents,
    };
  }
  if (globalCents >= KILL_GLOBAL_CENTS) {
    return {
      frozen: true,
      reason:
        "DSO Hire's platform-wide Claude support is temporarily paused for safety. Email support@dsohire.com — we'll see your message and get back to you fast.",
      perDsoCentsToday: perDsoCents,
      globalCentsToday: globalCents,
    };
  }

  return {
    frozen: false,
    perDsoCentsToday: perDsoCents,
    globalCentsToday: globalCents,
  };
}

function sumCostCents(
  rows: Array<{ cost_cents: number | string }> | null
): number {
  if (!rows || rows.length === 0) return 0;
  let total = 0;
  for (const r of rows) {
    const v = typeof r.cost_cents === "string" ? parseFloat(r.cost_cents) : r.cost_cents;
    if (Number.isFinite(v)) total += v;
  }
  return total;
}
