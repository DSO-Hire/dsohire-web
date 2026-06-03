"use server";

/**
 * N14 — AI interview note-taker.
 *
 * Takes a pasted interview transcript (or rough notes) + the scorecard
 * rubric, and returns a DRAFT set of per-attribute scores + notes, an
 * overall recommendation, and a one-line summary. It NEVER writes a
 * scorecard — the suggestions prefill the reviewer's editor, and the human
 * reviews/edits/submits. We don't record interviews; this only structures
 * notes the team already has.
 *
 * Grounding: the model is told to score ONLY attributes the transcript gives
 * real evidence for and to omit the rest (no guessing to fill the form).
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAnthropic,
  HAIKU_MODEL,
  estimateHaikuCostUsd,
} from "@/lib/ai/anthropic";
import { logAiUsage, checkAiRateLimit } from "@/lib/ai/usage";
import { extractJson } from "@/lib/ai/extract-json";
import {
  getRubricById,
  RECOMMENDATION_ORDER,
  SCORE_LABELS,
  type AttributeScoresMap,
  type OverallRecommendation,
} from "@/lib/scorecards/rubric-library";

const MAX_TRANSCRIPT = 16000; // chars — cap token cost; trim the rest.

export interface ScorecardDraft {
  scores: AttributeScoresMap;
  recommendation: OverallRecommendation | null;
  overallNote: string;
  summary: string;
  /** How many attributes the transcript supported (for the review banner). */
  scoredCount: number;
}

export type DraftScorecardResult =
  | { ok: true; draft: ScorecardDraft }
  | { ok: false; error: string };

const DraftSchema = z.object({
  attributes: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().int().min(1).max(5),
        note: z.string().max(500).optional(),
      })
    )
    .default([]),
  overall_recommendation: z
    .enum(["strong_yes", "yes", "maybe", "no", "strong_no"])
    .nullable()
    .optional(),
  overall_note: z.string().max(2000).optional(),
  summary: z.string().max(1200).optional(),
});

export async function draftScorecardFromTranscript(input: {
  applicationId: string;
  rubricId: string;
  transcript: string;
}): Promise<DraftScorecardResult> {
  const transcript = (input.transcript ?? "").trim();
  if (!input.applicationId) return { ok: false, error: "Missing application." };
  if (transcript.length < 40) {
    return { ok: false, error: "Paste a bit more of the interview — there isn't enough to work from yet." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Access check via RLS + grab the DSO for usage logging. The embedded
  // jobs!inner means a no-access application returns null.
  const { data: appRow } = await supabase
    .from("applications")
    .select("id, jobs:jobs!inner(id, dso_id, role_category)")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!appRow) {
    return { ok: false, error: "Application not found or access denied." };
  }
  const jobsRel = (appRow as Record<string, unknown>).jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const job = Array.isArray(jobsRel) ? jobsRel[0] ?? null : jobsRel;
  const dsoId = (job?.dso_id as string | null) ?? null;

  // Rate limit (per-user/day + cooldown).
  const gate = await checkAiRateLimit(user.id, "scorecard_notetaker");
  if (!gate.allowed) {
    return { ok: false, error: gate.message ?? "Please wait a moment before drafting again." };
  }

  const rubric = getRubricById(input.rubricId);
  if (!rubric.attributes.length) {
    return { ok: false, error: "No rubric is configured for this role." };
  }
  const validIds = new Set(rubric.attributes.map((a) => a.id));

  const system = buildSystemPrompt();
  const userPrompt = buildUserPrompt(rubric.label, rubric.attributes, transcript.slice(0, MAX_TRANSCRIPT));

  let response: Anthropic.Messages.Message;
  try {
    response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1600,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await logAiUsage({
      dsoId,
      userId: user.id,
      feature: "scorecard_notetaker",
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsdEstimate: 0,
      requestMetadata: { application_id: input.applicationId, error: message },
      succeeded: false,
      errorMessage: message,
    });
    return { ok: false, error: "We couldn't draft from the transcript right now. Try again in a moment." };
  }

  const rawText = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let parsed: z.infer<typeof DraftSchema>;
  try {
    parsed = DraftSchema.parse(extractJson(rawText));
  } catch {
    await logAiUsage({
      dsoId,
      userId: user.id,
      feature: "scorecard_notetaker",
      model: HAIKU_MODEL,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      costUsdEstimate: estimateHaikuCostUsd(
        response.usage?.input_tokens ?? 0,
        response.usage?.output_tokens ?? 0
      ),
      requestMetadata: { application_id: input.applicationId, parse_error: true },
      succeeded: false,
      errorMessage: "draft_parse_failed",
    });
    return { ok: false, error: "The draft came back malformed. Try again." };
  }

  // Map → AttributeScoresMap, keeping only real rubric attributes.
  const scores: AttributeScoresMap = {};
  for (const a of parsed.attributes) {
    if (!validIds.has(a.id)) continue;
    const note = a.note?.trim();
    scores[a.id] = note ? { score: a.score, note } : { score: a.score };
  }
  const recommendation =
    parsed.overall_recommendation &&
    RECOMMENDATION_ORDER.includes(parsed.overall_recommendation as OverallRecommendation)
      ? (parsed.overall_recommendation as OverallRecommendation)
      : null;

  await logAiUsage({
    dsoId,
    userId: user.id,
    feature: "scorecard_notetaker",
    model: HAIKU_MODEL,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    costUsdEstimate: estimateHaikuCostUsd(
      response.usage?.input_tokens ?? 0,
      response.usage?.output_tokens ?? 0
    ),
    requestMetadata: {
      application_id: input.applicationId,
      rubric_id: rubric.id,
      scored: Object.keys(scores).length,
      transcript_chars: transcript.length,
    },
    succeeded: true,
  });

  return {
    ok: true,
    draft: {
      scores,
      recommendation,
      overallNote: (parsed.overall_note ?? "").trim().slice(0, 4000),
      summary: (parsed.summary ?? "").trim(),
      scoredCount: Object.keys(scores).length,
    },
  };
}

function buildSystemPrompt(): string {
  return [
    "You are an experienced dental-hiring interviewer helping a team turn raw interview notes or a transcript into a structured scorecard draft.",
    "You will be given a scoring rubric (a list of attributes, each with an id and what it measures) and an interview transcript.",
    "Score each attribute from 1 to 5 ONLY when the transcript gives real evidence for it. If there is no evidence for an attribute, OMIT it entirely — never invent or guess to fill the form.",
    "For every attribute you score, write a one- to two-sentence note that cites the specific thing in the transcript that justifies the score. Keep notes factual and quote or paraphrase the candidate where useful.",
    "Be calibrated and conservative: 3 = meets expectations, 4 = above, 5 = exceptional (reserve for clear standouts), 2 = below, 1 = significant concern.",
    "Then give an overall recommendation (strong_yes, yes, maybe, no, strong_no) ONLY if the interview supports one; otherwise use null. Add a short overall note explaining it, and a one-line summary of the interview.",
    "These are SUGGESTIONS a human will review and edit — accuracy and honesty about uncertainty matter more than completeness.",
    "Respond with a single JSON object and nothing else.",
  ].join(" ");
}

function buildUserPrompt(
  rubricLabel: string,
  attributes: ReadonlyArray<{ id: string; label: string; description: string }>,
  transcript: string
): string {
  const scale = Object.entries(SCORE_LABELS)
    .map(([n, label]) => `${n} = ${label}`)
    .join("; ");
  const attrLines = attributes
    .map((a) => `- id: "${a.id}" — ${a.label}: ${a.description}`)
    .join("\n");
  return [
    `RUBRIC: ${rubricLabel}`,
    `SCORE SCALE: ${scale}`,
    "",
    "ATTRIBUTES (use these exact ids):",
    attrLines,
    "",
    "INTERVIEW TRANSCRIPT / NOTES:",
    transcript,
    "",
    "Return JSON shaped exactly like:",
    `{"attributes":[{"id":"<attribute id>","score":1-5,"note":"evidence-based note"}],"overall_recommendation":"strong_yes|yes|maybe|no|strong_no or null","overall_note":"short rationale","summary":"one-line summary"}`,
    "Only include attributes with genuine evidence. Use the exact attribute ids from the list above.",
  ].join("\n");
}
