/**
 * AI usage logger — writes one row per LLM-driven feature invocation.
 *
 * Builds the data we need to enforce the locked AI cap policy: every Growth-
 * tier AI feature default-caps at 2x average expected use, with overage at
 * cost+30% OR $99/mo unlimited. v1 (Phase 5D JD generator) only LOGS — we
 * don't have data on average use yet, so we capture first and tune caps once
 * we see real usage curves.
 *
 * Service-role insert is intentional: server actions own the truth here, and
 * we want logging to succeed even on RLS-blocked surfaces. SELECT is RLS-
 * gated to DSO members so future usage dashboards Just Work.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Whitelisted set of AI features. Must match the
 * `ai_usage_events_feature_check` constraint in Postgres — extending this
 * union without the matching migration will fail at insert time.
 *
 * Employer-side features carry a `dsoId`; candidate-side features (parity
 * sprint Phase 4.1.c + 4.2.d) leave `dsoId` null and use the candidate's
 * `auth.users.id` as `user_id`. The Phase 4.1 migration relaxed the
 * `ai_usage_events.dso_id` NOT NULL constraint to support this split.
 */
export type AiFeature =
  // Employer-side
  | "jd_generator"
  | "rejection_reason"
  // Candidate-side (parity sprint)
  | "resume_parse"
  | "profile_headline"
  | "profile_summary"
  // Audience-agnostic (Phase 5D v1) — logged with whichever side
  // triggered the first-expand; dsoId optional.
  | "practice_fit_narrative"
  // Analytics hub "what changed and why" summary (Phase 4).
  | "analytics_narrative"
  // N14 — AI interview note-taker: transcript → drafted scorecard.
  | "scorecard_notetaker";

const CANDIDATE_SIDE_FEATURES: ReadonlySet<AiFeature> = new Set<AiFeature>([
  "resume_parse",
  "profile_headline",
  "profile_summary",
]);

export function isCandidateSideAiFeature(feature: AiFeature): boolean {
  return CANDIDATE_SIDE_FEATURES.has(feature);
}

export interface LogAiUsageInput {
  /** Required for employer-side features; null/undefined for candidate-side. */
  dsoId?: string | null;
  userId: string;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsdEstimate: number;
  requestMetadata?: Record<string, unknown>;
  succeeded?: boolean;
  errorMessage?: string;
}

export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("ai_usage_events").insert({
    dso_id: input.dsoId ?? null,
    user_id: input.userId,
    feature: input.feature,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cost_usd_estimate: input.costUsdEstimate,
    request_metadata: input.requestMetadata ?? {},
    succeeded: input.succeeded ?? true,
    error_message: input.errorMessage ?? null,
  });
  if (error) {
    // Logging failure should never break the user-facing feature.
    console.warn("[ai/usage] failed to log usage event", error);
  }
}

/**
 * Per-candidate, per-feature month-to-date usage. Used by candidate-side
 * AI features (resume parser, AI Write) to enforce per-user soft caps.
 *
 * Cap policy: 1 resume parse per candidate per 24h. Counts come from
 * this same table (filtered by user_id + feature + created_at >= now-24h).
 */
export async function getCandidateRecentAiUsage(
  userId: string,
  feature: AiFeature,
  withinHours = 24
): Promise<{ count: number; lastAt: Date | null }> {
  const admin = createSupabaseServiceRoleClient();
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("succeeded", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error || !data) return { count: 0, lastAt: null };
  return {
    count: data.length,
    lastAt: data[0]?.created_at ? new Date(data[0].created_at) : null,
  };
}

/* ───────────────────────────────────────────────────────────────
 * AI abuse guard (2026-05-22, per Dave's call).
 *
 * A lightweight per-user rate limit layered on the existing
 * ai_usage_events log: a short cooldown between calls + a rolling 24h
 * cap per feature. This is NOT the full overage-billing cap policy
 * (that waits for real usage curves) — it's a floor that stops a bot,
 * a stuck client, or a frustrated user from hammering an AI endpoint
 * and running up cost.
 *
 * Counts come from logged (completed) events, so a burst of truly
 * concurrent requests could slip past the cooldown — but the rolling
 * daily cap still bounds total spend/abuse per user per feature.
 * ───────────────────────────────────────────────────────────── */

export interface AiRateLimitConfig {
  perDayPerUser: number;
  cooldownSeconds: number;
}

export const AI_RATE_LIMITS: Record<AiFeature, AiRateLimitConfig> = {
  jd_generator: { perDayPerUser: 40, cooldownSeconds: 8 },
  rejection_reason: { perDayPerUser: 60, cooldownSeconds: 6 },
  resume_parse: { perDayPerUser: 5, cooldownSeconds: 30 },
  profile_headline: { perDayPerUser: 25, cooldownSeconds: 8 },
  profile_summary: { perDayPerUser: 25, cooldownSeconds: 8 },
  practice_fit_narrative: { perDayPerUser: 100, cooldownSeconds: 3 },
  analytics_narrative: { perDayPerUser: 30, cooldownSeconds: 6 },
  scorecard_notetaker: { perDayPerUser: 40, cooldownSeconds: 8 },
};

export interface AiRateLimitResult {
  allowed: boolean;
  reason?: "cooldown" | "daily_cap";
  retryAfterSeconds?: number;
  message?: string;
}

/**
 * Check whether `userId` may invoke `feature` right now. Call this at the
 * top of an AI server action, before the model call; if `allowed` is
 * false, return the `message` to the user instead of generating.
 *
 * Fails OPEN on any read error — we never block a legitimate user because
 * the usage table hiccuped.
 */
export async function checkAiRateLimit(
  userId: string,
  feature: AiFeature
): Promise<AiRateLimitResult> {
  const cfg = AI_RATE_LIMITS[feature];
  if (!cfg || !userId) return { allowed: true };

  const admin = createSupabaseServiceRoleClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("created_at")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("succeeded", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error || !data) return { allowed: true };

  if (data.length >= cfg.perDayPerUser) {
    return {
      allowed: false,
      reason: "daily_cap",
      message:
        "You've reached today's limit for this AI feature. It resets within 24 hours.",
    };
  }

  const lastAtMs = data[0]?.created_at
    ? new Date(data[0].created_at).getTime()
    : 0;
  if (lastAtMs) {
    const elapsedSeconds = (Date.now() - lastAtMs) / 1000;
    if (elapsedSeconds < cfg.cooldownSeconds) {
      const retry = Math.max(1, Math.ceil(cfg.cooldownSeconds - elapsedSeconds));
      return {
        allowed: false,
        reason: "cooldown",
        retryAfterSeconds: retry,
        message: `Please wait ${retry} second${retry === 1 ? "" : "s"} before generating again.`,
      };
    }
  }

  return { allowed: true };
}

export async function getDsoMonthToDateAiUsage(
  dsoId: string,
  feature: AiFeature
): Promise<{ count: number; costUsd: number }> {
  const admin = createSupabaseServiceRoleClient();
  const startOfMonth = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)
  ).toISOString();
  const { data, error } = await admin
    .from("ai_usage_events")
    .select("cost_usd_estimate")
    .eq("dso_id", dsoId)
    .eq("feature", feature)
    .gte("created_at", startOfMonth);
  if (error || !data) return { count: 0, costUsd: 0 };
  return {
    count: data.length,
    costUsd: data.reduce(
      (acc, r) => acc + Number(r.cost_usd_estimate ?? 0),
      0
    ),
  };
}
