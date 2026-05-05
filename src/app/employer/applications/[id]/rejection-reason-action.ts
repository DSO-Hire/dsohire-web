"use server";

/**
 * Phase 5D — AI Rejection-Reason suggester (Growth+ tier).
 *
 * Reads a single application + its job context, screening answers, and any
 * submitted scorecards, and asks Haiku to draft 2-3 alternative rejection
 * reasons the recruiter can pick from. Output is structured JSON; we render
 * it inline with a "Use this" button per option.
 *
 * Tier gate: STRICT — Growth or Enterprise only. The JD generator gates on
 * "any active subscription" because it's a Founding+ feature; this is the
 * first Growth-only feature so we look at `subscriptions.tier` directly.
 *
 * Discrimination guardrails: the system prompt explicitly forbids reasoning
 * that cites protected attributes (race, gender, age, religion, disability,
 * national origin, marital status, sexual orientation, pregnancy, veteran
 * status, etc.). Reasons must tie to job-relevant criteria — skills,
 * experience mix, certifications, schedule fit, geographic fit, role-match.
 *
 * Logging: every invocation (success or failure) writes to ai_usage_events
 * via the service-role client. We don't store the suggestions themselves —
 * they're ephemeral; the recruiter's choice is captured implicitly when
 * they paste it into the reject reason and the existing reject flow logs it
 * to application_status_events.note.
 */

import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAnthropic,
  HAIKU_MODEL,
  estimateHaikuCostUsd,
} from "@/lib/ai/anthropic";
import { logAiUsage } from "@/lib/ai/usage";
import { getRubricForRole } from "@/lib/scorecards/rubric-library";
import type { PricingTier } from "@/lib/stripe/prices";

const InputSchema = z.object({
  applicationId: z.string().uuid(),
});

const SuggestionSchema = z.object({
  /** 2-4 word internal tag, e.g. "Experience mismatch". */
  label: z.string().min(2).max(60),
  /** Recruiter-facing draft body, 1-3 sentences, written to the candidate. */
  body: z.string().min(20).max(800),
});

const OutputSchema = z.object({
  reasons: z.array(SuggestionSchema).min(2).max(3),
});

export type RejectionSuggestion = z.infer<typeof SuggestionSchema>;
export type RejectionReasonOutput = z.infer<typeof OutputSchema>;

export type SuggestRejectionResult =
  | {
      ok: true;
      suggestions: RejectionSuggestion[];
      usage: { input_tokens: number; output_tokens: number; cost_usd: number };
    }
  | { ok: false; error: string };

/**
 * Tiers that get the rejection-reason suggester. Founding/Starter are
 * intentionally excluded — this is a Growth+ feature per the locked tier
 * matrix (R106).
 */
const ALLOWED_TIERS: ReadonlySet<PricingTier> = new Set<PricingTier>([
  "growth",
  "enterprise",
]);

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

const TIER_GATE_MESSAGE =
  "AI rejection-reason suggester is available on Growth tier and above.";

export async function suggestRejectionReason(
  applicationId: string
): Promise<SuggestRejectionResult> {
  const parsed = InputSchema.safeParse({ applicationId });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid application id",
    };
  }

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO membership" };

  const dsoId = dsoUser.dso_id as string;

  // ── Tier gate (Growth+ only). Read tier + status from subscriptions
  // directly so we can distinguish Growth from Founding/Starter; the
  // billing helper returns the row for any active tier and would let
  // Founding through.
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("dso_id", dsoId)
    .maybeSingle();

  if (!subRow) return { ok: false, error: TIER_GATE_MESSAGE };
  const subStatus = (subRow.status as string) ?? "";
  const subTier = (subRow.tier as PricingTier | null) ?? null;
  if (!ACTIVE_STATUSES.has(subStatus)) {
    return { ok: false, error: TIER_GATE_MESSAGE };
  }
  if (!subTier || !ALLOWED_TIERS.has(subTier)) {
    return { ok: false, error: TIER_GATE_MESSAGE };
  }

  // ── Application + job (DSO membership check is RLS-enforced; we also do
  // an explicit dso_id comparison so a confusion bug returns a clean error
  // instead of leaking an unrelated DSO's row).
  const { data: appRow } = await supabase
    .from("applications")
    .select("id, job_id, candidate_id, status, cover_letter")
    .eq("id", parsed.data.applicationId)
    .maybeSingle();
  if (!appRow) return { ok: false, error: "Application not found" };

  const { data: jobRow } = await supabase
    .from("jobs")
    .select("id, dso_id, title, role_category, employment_type, description")
    .eq("id", appRow.job_id as string)
    .maybeSingle();
  if (!jobRow || (jobRow.dso_id as string) !== dsoId) {
    return { ok: false, error: "Application not found" };
  }

  // ── Candidate (display name only — never feed PII the model couldn't
  // generate from the JD context).
  const { data: candRow } = await supabase
    .from("candidates")
    .select("full_name, headline, years_experience")
    .eq("id", appRow.candidate_id as string)
    .maybeSingle();

  // ── Screening Q+A pairs.
  const { data: rawQuestions } = await supabase
    .from("job_screening_questions")
    .select("id, prompt, kind, options, sort_order")
    .eq("job_id", jobRow.id as string)
    .order("sort_order", { ascending: true });

  const { data: rawAnswers } = await supabase
    .from("application_question_answers")
    .select(
      "question_id, answer_text, answer_choice, answer_choices, answer_number"
    )
    .eq("application_id", parsed.data.applicationId);

  type QuestionRow = {
    id: string;
    prompt: string;
    kind: string;
    options: Array<{ id: string; label: string }> | null;
    sort_order: number;
  };
  type AnswerRow = {
    question_id: string;
    answer_text: string | null;
    answer_choice: string | null;
    answer_choices: string[] | null;
    answer_number: number | null;
  };
  const questions = (rawQuestions ?? []) as QuestionRow[];
  const answers = (rawAnswers ?? []) as AnswerRow[];
  const answerByQ = new Map<string, AnswerRow>(
    answers.map((a) => [a.question_id, a])
  );

  const formattedAnswers = questions
    .map((q) => {
      const a = answerByQ.get(q.id);
      const display = formatAnswer(q, a);
      if (!display) return null;
      return `Q: ${q.prompt}\nA: ${display}`;
    })
    .filter((s): s is string => s !== null);

  // ── Submitted scorecards only.
  const { data: rawScorecards } = await supabase
    .from("application_scorecards")
    .select(
      "rubric_id, attribute_scores, overall_recommendation, overall_note, status, submitted_at"
    )
    .eq("application_id", parsed.data.applicationId)
    .eq("status", "submitted");

  type ScorecardRow = {
    rubric_id: string;
    attribute_scores: unknown;
    overall_recommendation: string | null;
    overall_note: string | null;
    status: string;
    submitted_at: string | null;
  };
  const scorecards = (rawScorecards ?? []) as ScorecardRow[];

  const rubric = getRubricForRole(jobRow.role_category as string | null);
  const scorecardSummary = summarizeScorecards(scorecards, rubric.attributes);

  // Quality flag for later analysis: if we have neither screening answers
  // nor any submitted scorecard, the model is reasoning purely from the JD
  // and the cover letter — recruiters should weight the suggestions less.
  const hasScreeningContext = formattedAnswers.length > 0;
  const hasScorecardContext = scorecards.length > 0;
  const lowSignal = !hasScreeningContext && !hasScorecardContext;

  const candidateName = (candRow?.full_name as string | null) ?? "the candidate";
  const candidateDescriptor = buildCandidateDescriptor(candRow);

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({
    jobTitle: (jobRow.title as string) ?? "this role",
    roleCategory: (jobRow.role_category as string) ?? "unspecified",
    employmentType: (jobRow.employment_type as string) ?? "unspecified",
    jobDescriptionExcerpt: excerpt(
      (jobRow.description as string | null) ?? "",
      1200
    ),
    candidateName,
    candidateDescriptor,
    coverLetterExcerpt: excerpt(
      (appRow.cover_letter as string | null) ?? "",
      800
    ),
    screeningQa: formattedAnswers,
    scorecardSummary,
  });

  let response: Anthropic.Messages.Message;
  try {
    response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await logAiUsage({
      dsoId,
      userId: user.id,
      feature: "rejection_reason",
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsdEstimate: 0,
      requestMetadata: {
        error: message,
        application_id: parsed.data.applicationId,
        role_category: jobRow.role_category as string,
        screening_answer_count: formattedAnswers.length,
        scorecard_count: scorecards.length,
        low_signal: lowSignal,
      },
      succeeded: false,
      errorMessage: message,
    });
    return { ok: false, error: message };
  }

  const text = response.content
    .filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    )
    .map((b) => b.text)
    .join("\n");

  let parsedOutput: RejectionReasonOutput;
  try {
    const json = extractJson(text);
    parsedOutput = OutputSchema.parse(json);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not parse AI response";
    await logAiUsage({
      dsoId,
      userId: user.id,
      feature: "rejection_reason",
      model: HAIKU_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsdEstimate: estimateHaikuCostUsd(
        response.usage.input_tokens,
        response.usage.output_tokens
      ),
      requestMetadata: {
        parse_error: message,
        raw: text.slice(0, 500),
        application_id: parsed.data.applicationId,
        role_category: jobRow.role_category as string,
      },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      error: "AI returned an unexpected format. Try again.",
    };
  }

  const cost = estimateHaikuCostUsd(
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  await logAiUsage({
    dsoId,
    userId: user.id,
    feature: "rejection_reason",
    model: HAIKU_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsdEstimate: cost,
    requestMetadata: {
      application_id: parsed.data.applicationId,
      role_category: jobRow.role_category as string,
      screening_answer_count: formattedAnswers.length,
      scorecard_count: scorecards.length,
      low_signal: lowSignal,
      suggestion_count: parsedOutput.reasons.length,
      tier: subTier,
    },
  });

  return {
    ok: true,
    suggestions: parsedOutput.reasons,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd: cost,
    },
  };
}

/* ───────── Helpers ───────── */

function buildSystemPrompt(): string {
  return `You are a dental hiring expert helping a recruiter draft a fair, professional rejection reason for a candidate. The recruiter will pick one of your suggestions and may send it (verbatim or edited) to the candidate.

Output ONLY a single JSON object with this exact shape (no surrounding prose, no code fences, no commentary):
{
  "reasons": [
    { "label": string, "body": string },
    { "label": string, "body": string }
  ]
}

Return 2 or 3 alternative reasons. Each must be:
- Tied to JOB-RELEVANT criteria only: skills, hands-on experience mix, certifications/licensure, schedule or availability fit, geographic/commute fit, role-level match, scorecard signals from interviewers, or a stronger competing candidate.
- Polite, professional, and respectful. Written to the candidate, in second person.
- 1-3 sentences total in the body. Concise; no filler.
- Distinct from the other reasons in the same response so the recruiter has a real choice (e.g. one experience-based, one schedule-based, one "closer match" if the context supports it).
- The label is a 2-4 word internal tag (e.g. "Experience mismatch", "Schedule fit", "Closer match available", "Certification gap").

CRITICAL DISCRIMINATION GUARDRAILS — you must NEVER cite, allude to, or reason from any protected attribute. This includes (but is not limited to):
- Race, color, ethnicity, national origin, ancestry, immigration status
- Sex, gender, gender identity, gender expression, sexual orientation
- Age, marital status, family/parental status, pregnancy, childcare responsibilities
- Religion, creed, political affiliation
- Disability (physical or mental), medical condition, genetic information
- Veteran or military status
- Accent, name, or appearance

If the only differentiating signal in the context appears to be a protected attribute, fall back to a generic "stronger fit elsewhere" reason rather than fabricating a job-relevant criticism. Never invent facts the context doesn't support; if information is thin, keep the body more general.

Tone examples (the kind of body text we want):
- "Thanks for your interest in this role. After review, we've decided to move forward with candidates whose hands-on implant experience more closely matches what we need on day one."
- "We appreciated learning about your background. For this position we needed someone available for the Saturday rotation, and we've moved forward with candidates who could meet that schedule."
- "Thank you for applying. We've identified other candidates whose certification mix and recent role experience are a closer match to what this position requires today."

Use dental-industry vocabulary correctly (DDS/DMD, RDH, EFDA, DEA, CE, SRP, perio, implant, hygiene production, etc.) only when the context supports it. No emoji, no exclamation marks, no over-apologetic filler.`;
}

interface UserPromptArgs {
  jobTitle: string;
  roleCategory: string;
  employmentType: string;
  jobDescriptionExcerpt: string;
  candidateName: string;
  candidateDescriptor: string;
  coverLetterExcerpt: string;
  screeningQa: string[];
  scorecardSummary: string | null;
}

function buildUserPrompt(args: UserPromptArgs): string {
  const sections: string[] = [];

  sections.push(`ROLE
Title: ${args.jobTitle}
Role category: ${args.roleCategory}
Employment type: ${args.employmentType}`);

  if (args.jobDescriptionExcerpt) {
    sections.push(`JOB DESCRIPTION (excerpt)
${args.jobDescriptionExcerpt}`);
  }

  sections.push(`CANDIDATE
Name: ${args.candidateName}${args.candidateDescriptor ? `\n${args.candidateDescriptor}` : ""}`);

  if (args.coverLetterExcerpt) {
    sections.push(`COVER LETTER (excerpt)
${args.coverLetterExcerpt}`);
  }

  if (args.screeningQa.length > 0) {
    sections.push(`SCREENING ANSWERS
${args.screeningQa.join("\n\n")}`);
  } else {
    sections.push(`SCREENING ANSWERS
(none — candidate did not answer screening questions on this job)`);
  }

  if (args.scorecardSummary) {
    sections.push(`INTERVIEWER SCORECARDS (submitted only)
${args.scorecardSummary}`);
  } else {
    sections.push(`INTERVIEWER SCORECARDS
(no submitted scorecards yet)`);
  }

  sections.push(
    `Draft 2-3 rejection reasons. Return ONLY the JSON object specified in the system prompt.`
  );

  return sections.join("\n\n");
}

function buildCandidateDescriptor(
  cand: {
    full_name: string | null;
    headline: string | null;
    years_experience: number | null;
  } | null
): string {
  if (!cand) return "";
  const parts: string[] = [];
  if (cand.headline) parts.push(`Headline: ${cand.headline}`);
  if (
    cand.years_experience !== null &&
    cand.years_experience !== undefined
  ) {
    parts.push(`Years of experience: ${cand.years_experience}`);
  }
  return parts.join("\n");
}

function formatAnswer(
  q: {
    kind: string;
    options: Array<{ id: string; label: string }> | null;
  },
  a:
    | {
        answer_text: string | null;
        answer_choice: string | null;
        answer_choices: string[] | null;
        answer_number: number | null;
      }
    | undefined
): string | null {
  if (!a) return null;
  switch (q.kind) {
    case "short_text":
    case "long_text": {
      const v = (a.answer_text ?? "").trim();
      return v ? v : null;
    }
    case "yes_no": {
      const v = (a.answer_choice ?? "").trim();
      if (v === "yes") return "Yes";
      if (v === "no") return "No";
      return null;
    }
    case "number": {
      if (a.answer_number === null || a.answer_number === undefined) {
        return null;
      }
      return String(a.answer_number);
    }
    case "single_select": {
      const id = a.answer_choice;
      if (!id) return null;
      const opt = q.options?.find((o) => o.id === id);
      return opt?.label ?? id;
    }
    case "multi_select": {
      const ids = a.answer_choices ?? [];
      if (ids.length === 0) return null;
      const labels = ids.map(
        (id) => q.options?.find((o) => o.id === id)?.label ?? id
      );
      return labels.join(", ");
    }
    default:
      return null;
  }
}

function summarizeScorecards(
  rows: Array<{
    rubric_id: string;
    attribute_scores: unknown;
    overall_recommendation: string | null;
    overall_note: string | null;
  }>,
  rubricAttributes: Array<{ id: string; label: string }>
): string | null {
  if (rows.length === 0) return null;

  // Aggregate per-attribute averages across submitted scorecards.
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const row of rows) {
    const map = row.attribute_scores;
    if (!map || typeof map !== "object") continue;
    for (const [key, raw] of Object.entries(
      map as Record<string, unknown>
    )) {
      if (!raw || typeof raw !== "object") continue;
      const score = (raw as { score?: unknown }).score;
      const num =
        typeof score === "number"
          ? score
          : typeof score === "string"
            ? Number(score)
            : NaN;
      if (!Number.isFinite(num) || num < 1 || num > 5) continue;
      const cur = buckets.get(key) ?? { sum: 0, n: 0 };
      cur.sum += num;
      cur.n += 1;
      buckets.set(key, cur);
    }
  }

  const labelById = new Map(
    rubricAttributes.map((a) => [a.id, a.label])
  );

  const attributeLines: string[] = [];
  for (const [key, { sum, n }] of buckets) {
    if (n === 0) continue;
    const avg = sum / n;
    const label = labelById.get(key) ?? key;
    attributeLines.push(`${label}: ${avg.toFixed(1)} / 5 (${n} reviewer${n === 1 ? "" : "s"})`);
  }

  // Recommendation tally + a short concatenation of overall_note text so the
  // model can incorporate qualitative reviewer signal.
  const recCounts: Record<string, number> = {};
  const overallNotes: string[] = [];
  for (const row of rows) {
    const rec = row.overall_recommendation;
    if (rec) recCounts[rec] = (recCounts[rec] ?? 0) + 1;
    const note = (row.overall_note ?? "").trim();
    if (note) overallNotes.push(note);
  }

  const recLine =
    Object.keys(recCounts).length > 0
      ? `Recommendations: ` +
        Object.entries(recCounts)
          .map(([k, v]) => `${k} (${v})`)
          .join(", ")
      : null;

  const noteLine =
    overallNotes.length > 0
      ? `Reviewer notes: ${overallNotes
          .map((n) => excerpt(n, 200))
          .join(" | ")}`
      : null;

  const lines = [
    `Submitted by ${rows.length} reviewer${rows.length === 1 ? "" : "s"}.`,
    ...(attributeLines.length > 0
      ? ["Attribute averages:", ...attributeLines.map((l) => `  - ${l}`)]
      : []),
    ...(recLine ? [recLine] : []),
    ...(noteLine ? [noteLine] : []),
  ];

  return lines.join("\n");
}

function excerpt(text: string, max: number): string {
  // Strip HTML tags first (jobs.description is Tiptap-authored HTML), then
  // collapse whitespace. We don't need to render — the model just needs the
  // raw text content.
  const stripped = (text ?? "").replace(/<[^>]+>/g, " ");
  const trimmed = stripped.replace(/\s+/g, " ").trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}
