"use server";

/**
 * AI Write — Headline + Summary suggestions (Phase 4.2.d).
 *
 * Two server actions:
 *   - generateHeadlineSuggestions(): 3 one-line headline candidates
 *   - generateSummarySuggestions():  3 short professional-summary candidates
 *
 * Both pull the candidate's existing profile context (name, roles,
 * specialty, years dental, top skills, current role) so suggestions
 * are grounded in what the candidate has already entered. The model
 * NEVER invents achievements or work history — it reflects the
 * candidate's voice, not a fabricated one.
 *
 * Reuses the established AI infrastructure: getAnthropic() client +
 * HAIKU_MODEL + logAiUsage() with `feature='profile_headline' | 'profile_summary'`.
 * Cap policy: free for all candidates per reach-over-upsell rule
 * (no per-candidate cap on these — unlike resume_parse, the cost is
 * tiny enough that abuse isn't a concern).
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAnthropic,
  HAIKU_MODEL,
  estimateHaikuCostUsd,
} from "@/lib/ai/anthropic";
import { logAiUsage, type AiFeature } from "@/lib/ai/usage";
import { extractJson } from "@/lib/ai/extract-json";
import {
  ROLE_CATEGORIES,
  SPECIALTIES,
} from "@/lib/candidate/canonical-lists";

// ─────────────────────────────────────────────────────────────────────
// Shared types
// ─────────────────────────────────────────────────────────────────────

const SuggestionsSchema = z.object({
  suggestions: z.array(z.string()).min(1).max(5),
});

export interface ProfileContext {
  full_name: string | null;
  current_headline: string | null;
  current_summary: string | null;
  pronouns: string | null;
  years_experience_dental: number | null;
  desired_roles: ReadonlyArray<string>;
  desired_specialty: ReadonlyArray<string>;
  top_skills: ReadonlyArray<string>;
  most_recent_role: {
    title: string | null;
    company: string | null;
    is_current: boolean;
  } | null;
}

export type AiWriteResult =
  | { ok: true; suggestions: string[] }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────────────
// Public actions
// ─────────────────────────────────────────────────────────────────────

export async function generateHeadlineSuggestions(
  context: ProfileContext
): Promise<AiWriteResult> {
  return runWriteAction({
    feature: "profile_headline",
    systemPrompt: HEADLINE_SYSTEM_PROMPT,
    userPrompt: buildHeadlineUserPrompt(context),
    maxTokens: 400,
    metadata: {
      has_existing: Boolean(context.current_headline),
      role_count: context.desired_roles.length,
    },
  });
}

export async function generateSummarySuggestions(
  context: ProfileContext
): Promise<AiWriteResult> {
  return runWriteAction({
    feature: "profile_summary",
    systemPrompt: SUMMARY_SYSTEM_PROMPT,
    userPrompt: buildSummaryUserPrompt(context),
    maxTokens: 1200,
    metadata: {
      has_existing: Boolean(context.current_summary),
      role_count: context.desired_roles.length,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────
// Shared runner
// ─────────────────────────────────────────────────────────────────────

interface RunWriteInput {
  feature: Extract<AiFeature, "profile_headline" | "profile_summary">;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  metadata: Record<string, unknown>;
}

async function runWriteAction(
  input: RunWriteInput
): Promise<AiWriteResult> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  let response: Anthropic.Messages.Message;
  try {
    response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: input.maxTokens,
      system: input.systemPrompt,
      messages: [{ role: "user", content: input.userPrompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await logAiUsage({
      dsoId: null,
      userId: user.id,
      feature: input.feature,
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsdEstimate: 0,
      requestMetadata: { ...input.metadata, error: message },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      error: "We couldn't reach the writing service. Try again in a moment.",
    };
  }

  const rawText = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let suggestions: string[];
  try {
    const json = extractJson(rawText);
    const parsed = SuggestionsSchema.parse(json);
    suggestions = parsed.suggestions
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not parse AI response";
    await logAiUsage({
      dsoId: null,
      userId: user.id,
      feature: input.feature,
      model: HAIKU_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsdEstimate: estimateHaikuCostUsd(
        response.usage.input_tokens,
        response.usage.output_tokens
      ),
      requestMetadata: {
        ...input.metadata,
        parse_error: message,
        raw_preview: rawText.slice(0, 300),
      },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      error: "The model returned an unexpected format. Try again.",
    };
  }

  if (suggestions.length === 0) {
    return { ok: false, error: "No suggestions came back. Try again." };
  }

  const cost = estimateHaikuCostUsd(
    response.usage.input_tokens,
    response.usage.output_tokens
  );
  await logAiUsage({
    dsoId: null,
    userId: user.id,
    feature: input.feature,
    model: HAIKU_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsdEstimate: cost,
    requestMetadata: { ...input.metadata, suggestion_count: suggestions.length },
  });

  return { ok: true, suggestions };
}

// ─────────────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────────────

const HEADLINE_SYSTEM_PROMPT = `You are helping a dental professional write a one-line professional headline for the DSO Hire job board. The headline appears on their profile, search results, and applications.

Voice: practical, declarative, professional. Reflects what's already in the candidate's profile — DO NOT invent achievements, certifications, or experience the candidate hasn't mentioned. No exclamation marks, no clichés like "passionate professional" or "team player," no emoji.

Length: 60-120 characters. One line. Title-style — first letter of each major word capitalized. Use dental industry vocabulary correctly (DDS/DMD/RDH/CDA/EFDA, GP, ortho, perio, endo, etc.).

Output ONLY a single JSON object — no surrounding prose, no code fences:
{ "suggestions": [string, string, string] }

Three meaningfully distinct headlines. The differences should be in angle, not just rephrasing — e.g.:
  - one focused on role + experience ("Hygienist · 8 years in pediatric practice")
  - one focused on specialty + location ("Pediatric-focused RDH · Kansas City metro")
  - one focused on a notable skill or differentiator ("RDH with laser-assisted therapy & multi-language patient care")

Skip any angle that the candidate's profile doesn't actually support. If only one or two strong angles are possible from the data, return fewer than three rather than padding.`;

const SUMMARY_SYSTEM_PROMPT = `You are helping a dental professional write a short professional summary ("About" section) for the DSO Hire job board. The summary appears on their profile.

Voice: practical, declarative, first-person. Reflects what's already in the candidate's profile — DO NOT invent achievements, certifications, work history, or career aspirations the candidate hasn't mentioned. No exclamation marks, no marketing language, no "passionate," "results-driven," "team player," etc.

Length: 2-4 short sentences, 280-600 characters. Plain English a busy DSO recruiter can scan in 10 seconds.

Output ONLY a single JSON object — no surrounding prose, no code fences:
{ "suggestions": [string, string, string] }

Three meaningfully distinct summaries. The differences should be in tone or emphasis, not just rephrasing — e.g.:
  - one focused on clinical experience + procedures
  - one focused on patient care philosophy + soft skills
  - one focused on growth trajectory or what the candidate is looking for next

Skip any angle the candidate's profile doesn't actually support. If only two strong summaries can come from the data, return two rather than padding to three.

Use dental vocabulary correctly. Refer to the candidate by their first name or "I" — never refer to them in the third person.`;

// ─────────────────────────────────────────────────────────────────────
// User prompt builders
// ─────────────────────────────────────────────────────────────────────

function buildHeadlineUserPrompt(context: ProfileContext): string {
  return [
    "Write a one-line professional headline for this dental candidate.",
    "",
    contextSection(context),
    "",
    context.current_headline
      ? `Their current headline (consider this their starting point — improve OR diverge meaningfully):\n"${context.current_headline}"`
      : "They don't have a headline yet — write a fresh one.",
    "",
    'Return only the JSON object: { "suggestions": [...] }',
  ].join("\n");
}

function buildSummaryUserPrompt(context: ProfileContext): string {
  return [
    "Write a short professional summary for this dental candidate's profile.",
    "",
    contextSection(context),
    "",
    context.current_summary
      ? `Their current summary (consider this their starting voice — refine OR diverge meaningfully):\n"${context.current_summary}"`
      : "They don't have a summary yet — write a fresh one.",
    "",
    'Return only the JSON object: { "suggestions": [...] }',
  ].join("\n");
}

function contextSection(context: ProfileContext): string {
  const lines: string[] = [];
  lines.push(`Name: ${context.full_name ?? "(not provided)"}`);
  if (context.pronouns) lines.push(`Pronouns: ${context.pronouns}`);
  if (context.years_experience_dental !== null) {
    lines.push(`Years of dental experience: ${context.years_experience_dental}`);
  }
  if (context.desired_roles.length > 0) {
    const labels = context.desired_roles.map(
      (v) => ROLE_CATEGORIES.find((o) => o.value === v)?.label ?? v
    );
    lines.push(`Roles they're open to: ${labels.join(", ")}`);
  }
  if (context.desired_specialty.length > 0) {
    const labels = context.desired_specialty.map(
      (v) => SPECIALTIES.find((o) => o.value === v)?.label ?? v
    );
    lines.push(`Specialty focus: ${labels.join(", ")}`);
  }
  if (context.top_skills.length > 0) {
    lines.push(`Top skills: ${context.top_skills.slice(0, 8).join(", ")}`);
  }
  if (context.most_recent_role) {
    const r = context.most_recent_role;
    if (r.title || r.company) {
      const tense = r.is_current ? "Currently" : "Most recently";
      lines.push(
        `${tense}: ${r.title ?? "(no title)"} at ${r.company ?? "(no company)"}`
      );
    }
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

// extractJson moved to src/lib/ai/extract-json.ts (shared with
// jd-generator-action, rejection-reason-action, and resume/parse).
