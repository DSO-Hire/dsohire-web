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
  | "profile_summary";

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
