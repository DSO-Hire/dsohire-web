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
 */
export type AiFeature = "jd_generator" | "rejection_reason";

export interface LogAiUsageInput {
  dsoId: string;
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
    dso_id: input.dsoId,
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
