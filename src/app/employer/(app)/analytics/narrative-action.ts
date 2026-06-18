"use server";

/**
 * Analytics "what changed and why" narrative (Phase 4).
 *
 * Recomputes the overview bundle server-side (never trusts client-passed
 * numbers), feeds a compact metrics snapshot to Haiku, and returns a short
 * plain-English summary for a busy owner / VP of Talent. Rate-limited + usage-
 * logged like the other AI features. The model is instructed to ground every
 * claim in the provided numbers and invent nothing.
 */

import type Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAnthropic,
  HAIKU_MODEL,
  estimateHaikuCostUsd,
} from "@/lib/ai/anthropic";
import { logAiUsage, checkAiRateLimit } from "@/lib/ai/usage";
import { getAnalyticsOverview } from "@/lib/analytics/hub-metrics";

export type AnalyticsNarrativeResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

const pct = (n: number | null) => (n == null ? "n/a" : `${Math.round(n * 100)}%`);
const dys = (n: number | null) => (n == null ? "n/a" : `${Math.round(n)}d`);

export async function summarizeAnalytics(
  windowDays: number,
  loc: string | null
): Promise<AnalyticsNarrativeResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };
  const dsoId = dsoUser.dso_id as string;

  const rate = await checkAiRateLimit(user.id, "analytics_narrative");
  if (!rate.allowed) {
    return { ok: false, error: rate.message ?? "Rate limit reached." };
  }

  const days = [30, 90, 365].includes(windowDays) ? windowDays : 90;
  const ov = await getAnalyticsOverview(supabase, dsoId, {
    windowDays: days,
    locationIds: loc ? [loc] : undefined,
  });

  const snapshot = [
    `Window: last ${days} days${loc ? " (single practice)" : " (all practices)"}`,
    `Applications: ${ov.applications}; Hires: ${ov.hires}`,
    `Open requisitions: ${ov.req_aging.open_reqs} (${ov.req_aging.buckets.d90_plus} aging past 90 days; oldest ${dys(ov.req_aging.oldest_days)})`,
    `Pipeline coverage: ${ov.pipeline_coverage.ratio == null ? "n/a" : ov.pipeline_coverage.ratio.toFixed(1) + "x"} (active candidates per open req)`,
    `Time-to-fill median ${dys(ov.time_to_hire_fill.time_to_fill_median_days)}; time-to-hire median ${dys(ov.time_to_hire_fill.time_to_hire_median_days)}`,
    `Offer acceptance: ${pct(ov.offers.acceptance_rate)} (${ov.offers.accepted}/${ov.offers.sent})`,
    `Interview booking rate: ${pct(ov.interviews.booking_rate)} (${ov.interviews.booked}/${ov.interviews.proposals})`,
    `Application completion: ${pct(ov.top_of_funnel.completion_rate)} (${ov.top_of_funnel.submitted} submitted / ${ov.top_of_funnel.starts} started)`,
    `Time to first response median: ${dys(ov.time_to_first_response.median_days)}`,
    `Top sources: ${ov.sources.slice(0, 3).map((s) => `${s.source} (${s.applications} apps, ${s.hires} hires)`).join("; ") || "none"}`,
    `Funnel: ${ov.funnel.map((r) => `${r.label} ${r.count}`).join(" -> ")}`,
  ].join("\n");

  const system =
    "You are a concise hiring-analytics assistant for a dental support organization (DSO). " +
    "Given a metrics snapshot, write a brief plain-English summary for a busy practice owner or VP of Talent. " +
    "Exactly 3-4 short sentences. Lead with what stands out, then 1-2 specific, actionable recommendations grounded ONLY in the numbers provided. " +
    "Never invent numbers, benchmarks, or trends not present in the data. If a metric is 'n/a', don't mention it. " +
    "No preamble, no headers, no bullet points — just the prose.";

  let response: Anthropic.Messages.Message;
  try {
    response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      system,
      messages: [
        { role: "user", content: `Metrics snapshot:\n${snapshot}\n\nWrite the summary.` },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await logAiUsage({
      dsoId,
      userId: user.id,
      feature: "analytics_narrative",
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsdEstimate: 0,
      succeeded: false,
      errorMessage: message,
      requestMetadata: { window: days },
    });
    return { ok: false, error: "Couldn't generate the summary. Try again." };
  }

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const cost = estimateHaikuCostUsd(
    response.usage.input_tokens,
    response.usage.output_tokens
  );
  await logAiUsage({
    dsoId,
    userId: user.id,
    feature: "analytics_narrative",
    model: HAIKU_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsdEstimate: cost,
    requestMetadata: { window: days, scoped: !!loc },
  });

  if (!text) return { ok: false, error: "Empty summary. Try again." };
  return { ok: true, text };
}
