"use server";

/**
 * Phase 5G.d — Corporate AI Job Description generator (every paid tier).
 *
 * Parallel to jd-generator-action.ts (the dental/clinical generator), but
 * corporate-tuned: it drafts DSO-wide / corporate role postings (CFO, VP
 * Marketing, Regional Director, etc.), NOT chairside clinical hires.
 * Wiring the dental generator into the corporate wizard would carry
 * clinical framing into corporate copy — the exact bug 5G.d exists to fix.
 *
 * Structure mirrors generateJobDescription exactly: same auth/tier gate,
 * the same affiliation-masking block (which already handles the
 * 0-selected-locations corporate case via corporate_affiliation_policy),
 * the same ai_usage_events logging under the shared "jd_generator" feature
 * key, the same error handling, and the same OutputSchema.
 *
 * Differences from the dental action:
 *   • Input takes corporateFunction / authorityLevel / workMode instead
 *     of roleCategory.
 *   • The system + user prompts are corporate-tuned — strategic scope,
 *     business outcomes, cross-practice reach; no chairside vocabulary.
 *
 * The JdGeneratorOutput type + OutputSchema shape are intentionally
 * identical — the output type is imported from the dental action, not
 * redefined, so the panel + wizard share one payload contract.
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
import { extractJson } from "@/lib/ai/extract-json";
import { getActiveSubscription } from "@/lib/billing/subscription";
import {
  getCorporateFunction,
  CORPORATE_FUNCTION_SLUGS,
} from "@/lib/corporate/functions";
import {
  AUTHORITY_LEVELS,
  AUTHORITY_LEVEL_LABELS,
  WORK_MODES,
  WORK_MODE_LABELS,
  type AuthorityLevel,
  type WorkMode,
} from "@/lib/corporate/job-fields";
// JdGeneratorOutput is owned by the dental action. Imported here for the
// internal type annotations only — NOT re-exported. Re-exporting a type
// from a "use server" module makes Next's action compiler emit a runtime
// reference to the (erased) name → ReferenceError at request time. The
// corporate panel imports JdGeneratorOutput straight from ./jd-generator-action.
import type { JdGeneratorOutput } from "./jd-generator-action";

const AUTHORITY_VALUES = AUTHORITY_LEVELS.map((a) => a.value) as [
  AuthorityLevel,
  ...AuthorityLevel[],
];
const WORK_MODE_VALUES = WORK_MODES.map((w) => w.value) as [
  WorkMode,
  ...WorkMode[],
];
const FUNCTION_VALUES = CORPORATE_FUNCTION_SLUGS as readonly string[];

const InputSchema = z.object({
  // Must be a valid CorporateFunction slug (see src/lib/corporate/functions.ts).
  corporateFunction: z
    .string()
    .refine((s) => FUNCTION_VALUES.includes(s), "Unknown corporate function"),
  // Closed enums from src/lib/corporate/job-fields.ts.
  authorityLevel: z.enum(AUTHORITY_VALUES),
  workMode: z.enum(WORK_MODE_VALUES),
  // Operator-supplied notes, e.g. "owns FP&A, 10+ yrs, equity, PE-backed".
  brief: z.string().max(800),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
  // Selected dso_locations.id values. Corporate-scope jobs frequently
  // have 0 selected locations (anchor-optional) — the affiliation-masking
  // block below handles that via corporate_affiliation_policy. Optional
  // so surfaces that can't pass it still work.
  locationIds: z.array(z.string()).optional(),
});

const OutputSchema = z.object({
  title: z.string(),                       // suggested job title
  summary: z.string(),                     // 2-3 paragraph intro
  responsibilities: z.array(z.string()),   // bullet list, ~5-8 items
  qualifications: z.array(z.string()),     // bullet list, ~4-6 items
  whatWeOffer: z.array(z.string()),        // bullet list, ~4-6 items
});

export type JdGeneratorCorporateResult =
  | {
      ok: true;
      jd: JdGeneratorOutput;
      usage: { input_tokens: number; output_tokens: number; cost_usd: number };
    }
  | { ok: false; error: string };

export async function generateCorporateJobDescription(
  input: z.input<typeof InputSchema>
): Promise<JdGeneratorCorporateResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
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

  // Tier gate — available on every paid tier. Gating on active subscription
  // is the right proxy since there is no free tier.
  const subscription = await getActiveSubscription(supabase, dsoUser.dso_id);
  if (!subscription) {
    return {
      ok: false,
      error:
        "An active subscription is required to use the AI Job Description generator.",
    };
  }

  // Pull DSO context for personalization. corporate_affiliation_policy
  // (5G.a addendum, 2026-05-13) decides how to resolve the 0-location
  // corporate case: strict masks when any location is private, permissive
  // exposes when any location is public.
  const { data: dso } = await supabase
    .from("dsos")
    .select("name, slug, corporate_affiliation_policy")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  // Ground the prompt with human labels for the three corporate inputs.
  const functionLabel =
    getCorporateFunction(parsed.data.corporateFunction)?.label ??
    parsed.data.corporateFunction;
  const authorityLabel =
    AUTHORITY_LEVEL_LABELS[parsed.data.authorityLevel] ??
    parsed.data.authorityLevel;
  const workModeLabel =
    WORK_MODE_LABELS[parsed.data.workMode] ?? parsed.data.workMode;

  // Resolve the affiliation context. Reuses the dental generator's logic
  // verbatim: the most-private-inherits rule for 1+ selected locations,
  // and the corporate_affiliation_policy fallback for the 0-location
  // corporate case (which is the common path here).
  let useDsoName = true;
  let employerNameForPrompt = dso?.name ?? "the practice";

  const selectedIds = parsed.data.locationIds ?? [];

  if (selectedIds.length > 0) {
    const { data: selectedLocs } = await supabase
      .from("dso_locations")
      .select("id, name, public_dso_affiliation")
      .eq("dso_id", dsoUser.dso_id)
      .in("id", selectedIds);
    const locs = (selectedLocs ?? []) as Array<{
      id: string;
      name: string;
      public_dso_affiliation: boolean;
    }>;
    const allPublic =
      locs.length > 0 && locs.every((l) => l.public_dso_affiliation);
    if (!allPublic && locs.length > 0) {
      useDsoName = false;
      const privateLocs = locs.filter((l) => !l.public_dso_affiliation);
      employerNameForPrompt =
        privateLocs.length === 1 ? privateLocs[0]!.name : "the practice";
    }
  } else {
    // 0 locations selected — typical for corporate-scope jobs. Check the
    // DSO's full location set so a corporate posting doesn't leak the
    // corporate parent name when the DSO's posture says it shouldn't.
    const policy =
      (dso?.corporate_affiliation_policy as "strict" | "permissive" | null) ??
      "strict";
    const { data: allDsoLocs } = await supabase
      .from("dso_locations")
      .select("id, public_dso_affiliation")
      .eq("dso_id", dsoUser.dso_id);
    const dsoLocs = (allDsoLocs ?? []) as Array<{
      id: string;
      public_dso_affiliation: boolean;
    }>;
    const anyPrivate = dsoLocs.some((l) => !l.public_dso_affiliation);
    const anyPublic = dsoLocs.some((l) => l.public_dso_affiliation);

    if (dsoLocs.length === 0) {
      // Edge case during onboarding — no locations yet. Keep default
      // (DSO name) regardless of policy; there's nothing to enforce yet.
    } else if (policy === "strict" && anyPrivate) {
      // Strict: any private location → mask.
      useDsoName = false;
      employerNameForPrompt = "the company";
    } else if (policy === "permissive" && !anyPublic) {
      // Permissive: only mask when NO location is public.
      useDsoName = false;
      employerNameForPrompt = "the company";
    }
    // Otherwise (strict + all public, OR permissive + any public) keep
    // the default DSO name.
  }

  const systemPrompt = buildSystemPrompt({ useDsoName });
  const userPrompt = buildUserPrompt({
    functionLabel,
    functionSlug: parsed.data.corporateFunction,
    authorityLabel,
    workModeLabel,
    brief: parsed.data.brief,
    tone: parsed.data.tone,
    employerName: employerNameForPrompt,
    useDsoName,
  });

  let response: Anthropic.Messages.Message;
  try {
    response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await logAiUsage({
      dsoId: dsoUser.dso_id,
      userId: user.id,
      feature: "jd_generator",
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsdEstimate: 0,
      requestMetadata: {
        error: message,
        scope: "corporate",
        corporate_function: parsed.data.corporateFunction,
      },
      succeeded: false,
      errorMessage: message,
    });
    return { ok: false, error: message };
  }

  // Single text block with JSON expected. Streaming + tool-use are not
  // handled here — single-shot is enough for v1.
  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let jd: JdGeneratorOutput;
  try {
    const json = extractJson(text);
    jd = OutputSchema.parse(json);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not parse AI response";
    await logAiUsage({
      dsoId: dsoUser.dso_id,
      userId: user.id,
      feature: "jd_generator",
      model: HAIKU_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsdEstimate: estimateHaikuCostUsd(
        response.usage.input_tokens,
        response.usage.output_tokens
      ),
      requestMetadata: {
        parse_error: message,
        scope: "corporate",
        raw: text.slice(0, 500),
      },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      error:
        "AI returned an unexpected format. Try again or simplify the brief.",
    };
  }

  const cost = estimateHaikuCostUsd(
    response.usage.input_tokens,
    response.usage.output_tokens
  );

  await logAiUsage({
    dsoId: dsoUser.dso_id,
    userId: user.id,
    feature: "jd_generator",
    model: HAIKU_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsdEstimate: cost,
    requestMetadata: {
      scope: "corporate",
      corporate_function: parsed.data.corporateFunction,
      authority_level: parsed.data.authorityLevel,
      work_mode: parsed.data.workMode,
      tone: parsed.data.tone,
      brief_length: parsed.data.brief.length,
    },
  });

  return {
    ok: true,
    jd,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cost_usd: cost,
    },
  };
}

function buildSystemPrompt({ useDsoName }: { useDsoName: boolean }): string {
  // Affiliation-aware variant of the summary instruction — identical
  // intent to the dental generator's masking, just phrased for corporate
  // postings where the employer is the DSO itself.
  const summaryConstraint = useDsoName
    ? `- summary: 2-3 paragraphs, conversational but professional, names the employer and frames the role's strategic scope and the DSO's growth context`
    : `- summary: 2-3 paragraphs, conversational but professional, refers ONLY to "the company" or "the organization" (the employer name supplied below). Do NOT name any DSO brand, parent company, or affiliated practice brand. Describe it generically as a growing multi-practice dental support organization.`;

  return `You are an executive + corporate hiring expert helping a Dental Support Organization (DSO) write a job description for the DSO Hire job board.

CRITICAL CONTEXT: This is a CORPORATE / DSO-WIDE role posting, not a chairside clinical hire. The role operates at the organization level — across many practices — not in an operatory treating patients. Focus on strategic responsibilities, business outcomes, cross-practice scope, P&L or functional ownership, leadership, and the DSO's growth context. Do NOT use chairside clinical vocabulary (no "patients in the chair," "operatory," "prophy," "SRP," "perio," "production per visit," etc. unless the operator's brief explicitly calls for clinical-leadership framing). Write to a corporate professional, not a clinician.

Tone: practical, declarative, no marketing fluff, no exclamation marks, no emoji.

Output ONLY a single JSON object with this exact shape (no surrounding prose, no code fences):
{
  "title": string,
  "summary": string,
  "responsibilities": string[],
  "qualifications": string[],
  "whatWeOffer": string[]
}

Constraints:
- title: a clean, professional corporate job title with seniority where appropriate (e.g., "VP of Operations — Multi-Practice DSO", "Corporate Controller")
${summaryConstraint}
- responsibilities: 5-8 bullet items, each one short imperative phrase — strategic and cross-practice in scope
- qualifications: 4-6 bullet items mixing required + preferred; emphasize years of leadership, functional expertise, and multi-site / DSO / healthcare background where relevant
- whatWeOffer: 4-6 bullet items covering compensation philosophy, bonus/equity where appropriate, benefits, growth, and the chance to shape a scaling organization

Use corporate / business vocabulary correctly (P&L, FP&A, EBITDA, integration, de novo, GPO, KPIs, etc.) where appropriate. Write to the candidate, not about the candidate.`;
}

function buildUserPrompt(args: {
  functionLabel: string;
  functionSlug: string;
  authorityLabel: string;
  workModeLabel: string;
  brief: string;
  tone: "professional" | "friendly" | "concise";
  employerName: string;
  useDsoName: boolean;
}): string {
  const employerFieldLabel = args.useDsoName
    ? "DSO (employer)"
    : "Employer (name withheld — describe generically)";
  const privacyReminder = args.useDsoName
    ? ""
    : `\n\nIMPORTANT: This organization's brand is intentionally not disclosed in this job description. Refer to the employer only as "${args.employerName}" or generic terms like "the organization" / "a growing multi-practice DSO." Do not name any DSO, parent company, or practice brand.`;

  return `Write a corporate job posting for a Dental Support Organization:

${employerFieldLabel}: ${args.employerName}
Corporate function: ${args.functionLabel} (${args.functionSlug})
Authority level: ${args.authorityLabel}
Work mode: ${args.workModeLabel}
Tone: ${args.tone}

Operator-supplied brief (use as guidance, not verbatim):
${args.brief || "(no specific notes — write a strong default for a corporate role at this function and authority level)"}${privacyReminder}

This is a corporate / DSO-wide role, not a chairside clinical hire. Frame responsibilities and scope at the organization level across many practices.

Return only the JSON object specified in the system prompt.`;
}
