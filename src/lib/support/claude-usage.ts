/**
 * Claude usage logging — every Anthropic API call writes a row to
 * claude_usage_log. Drives rate limits + kill switches + per-customer
 * cost reporting in the admin dashboard.
 *
 * Always uses the service-role client because the chat endpoint runs
 * server-side and we want the log to land regardless of which RLS
 * scope the caller is in (employer admin / candidate / mid-invite).
 *
 * NEVER throws — if the log insert fails we console.error and return.
 * Losing a cost row is bad but losing the user's chat response because
 * the log table was down is worse.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { computeCostCents } from "./pricing";

export interface LogUsageInput {
  authUserId: string;
  dsoId: string | null;
  /** 'support_chat' for v1; future: 'proactive_nudge' / 'admin_summary'. */
  surface: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  /** Conversation root id (support_requests.id) when applicable. */
  requestId?: string | null;
}

export async function logUsage(input: LogUsageInput): Promise<void> {
  const costCents = computeCostCents({
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    cachedInputTokens: input.cachedInputTokens,
  });

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("claude_usage_log").insert({
    auth_user_id: input.authUserId,
    dso_id: input.dsoId,
    surface: input.surface,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    cached_input_tokens: input.cachedInputTokens ?? 0,
    cost_cents: costCents,
    request_id: input.requestId ?? null,
  });

  if (error) {
    console.error("[claude-usage] log insert failed", {
      authUserId: input.authUserId,
      dsoId: input.dsoId,
      surface: input.surface,
      model: input.model,
      error: error.message,
    });
  }
}
