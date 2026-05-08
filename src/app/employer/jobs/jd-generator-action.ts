"use server";

/**
 * Phase 5D — AI Job Description generator (every paid tier).
 *
 * Single LLM round-trip that takes the role + a short operator brief and
 * returns a structured JD payload (title, summary, responsibilities,
 * qualifications, whatWeOffer). The wizard renders each field with a
 * "Use this" button so the operator stays in the driver's seat.
 *
 * Tier gate: Starter/Growth/Enterprise. Since there is no free tier,
 * "any DSO with an active subscription" is the gate.
 *
 * Logging: every invocation (success or failure) writes to ai_usage_events
 * via service role. v1 logs only — caps are not yet enforced. We need real
 * usage data before tuning the 2x-average policy.
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
import { ROLE_RECOMMENDATIONS } from "@/lib/screening/question-library";
import { getActiveSubscription } from "@/lib/billing/subscription";

const InputSchema = z.object({
  roleCategory: z.string(),
  // Operator-supplied notes, e.g. "5+ years GP, implant focus, weekend coverage".
  brief: z.string().max(800),
  tone: z.enum(["professional", "friendly", "concise"]).default("professional"),
  // The dso_locations.id values currently selected on the wizard. Used
  // to determine whether the resulting JD copy should mask the DSO name
  // (Phase 4.5.b launch-blocker affiliation toggle, locked 2026-05-08).
  // If any selected location has public_dso_affiliation = false, the
  // prompt instructs the model to use the practice name (or a generic
  // "the practice") rather than the corporate DSO name. Existing
  // generated JDs are NOT revisited — this only affects new generations.
  // Optional so /employer/jobs surfaces that don't yet pass it (or
  // can't, e.g. the role chooser before locations are picked) still
  // work — they fall through to the legacy behavior.
  locationIds: z.array(z.string()).optional(),
});

const OutputSchema = z.object({
  title: z.string(),                       // suggested job title
  summary: z.string(),                     // 2-3 paragraph intro
  responsibilities: z.array(z.string()),   // bullet list, ~5-8 items
  qualifications: z.array(z.string()),     // bullet list, ~4-6 items
  whatWeOffer: z.array(z.string()),        // bullet list, ~4-6 items
});

export type JdGeneratorOutput = z.infer<typeof OutputSchema>;

export type JdGeneratorResult =
  | {
      ok: true;
      jd: JdGeneratorOutput;
      usage: { input_tokens: number; output_tokens: number; cost_usd: number };
    }
  | { ok: false; error: string };

export async function generateJobDescription(
  input: z.input<typeof InputSchema>
): Promise<JdGeneratorResult> {
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

  // Pull DSO context for personalization.
  const { data: dso } = await supabase
    .from("dsos")
    .select("name, slug")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  // Look up the role label + recommended-screening hints to ground the prompt.
  const roleLabel =
    ROLE_RECOMMENDATIONS[parsed.data.roleCategory]?.label ??
    parsed.data.roleCategory;

  // Resolve the affiliation context for the selected locations (if
  // any). Mirrors the most-private-inherits rule (Q3): if any of the
  // selected locations has public_dso_affiliation = false, the whole
  // job's public surfaces hide the DSO name — so the AI-generated copy
  // must do the same. Single private location → use that practice's
  // name. Multiple private locations → "the practice" (we can't
  // safely pick one). All public OR no locations selected yet →
  // legacy behavior, use the DSO name.
  let useDsoName = true;
  let employerNameForPrompt = dso?.name ?? "the practice";
  if (parsed.data.locationIds && parsed.data.locationIds.length > 0) {
    const { data: selectedLocs } = await supabase
      .from("dso_locations")
      .select("id, name, public_dso_affiliation")
      .eq("dso_id", dsoUser.dso_id)
      .in("id", parsed.data.locationIds);
    const locs = (selectedLocs ?? []) as Array<{
      id: string;
      name: string;
      public_dso_affiliation: boolean;
    }>;
    const allPublic = locs.length > 0 && locs.every((l) => l.public_dso_affiliation);
    if (!allPublic && locs.length > 0) {
      useDsoName = false;
      const privateLocs = locs.filter((l) => !l.public_dso_affiliation);
      employerNameForPrompt =
        privateLocs.length === 1 ? privateLocs[0]!.name : "the practice";
    }
  }

  const systemPrompt = buildSystemPrompt({ useDsoName });
  const userPrompt = buildUserPrompt({
    roleLabel,
    roleCategory: parsed.data.roleCategory,
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
      requestMetadata: { error: message, role: parsed.data.roleCategory },
      succeeded: false,
      errorMessage: message,
    });
    return { ok: false, error: message };
  }

  // Anthropic responses are an array of content blocks. We expect one text
  // block with JSON. Streaming and tool-use are intentionally not handled
  // here — single-shot is enough for v1.
  const text = response.content
    .filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    )
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
      requestMetadata: { parse_error: message, raw: text.slice(0, 500) },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      error: "AI returned an unexpected format. Try again or simplify the brief.",
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
      role_category: parsed.data.roleCategory,
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
  // Affiliation-aware variant of the summary instruction. When the
  // caller's selected location set includes any private-affiliation
  // practice, we instruct the model NOT to mention the corporate DSO
  // name and to refer only to the practice / "our practice." Phase
  // 4.5.b launch-blocker, locked 2026-05-08.
  const summaryConstraint = useDsoName
    ? `- summary: 2-3 paragraphs, conversational but professional, mentions the employer name and role focus`
    : `- summary: 2-3 paragraphs, conversational but professional, refers ONLY to the practice (the employer name supplied below). Do NOT mention any parent DSO, corporate parent, or affiliated brand. Do NOT use phrases like "part of a larger DSO," "owned by," or anything that implies corporate ownership. The practice presents as a standalone brand.`;

  return `You are a dental hiring expert helping a DSO write a job description for the DSO Hire job board. Tone: practical, declarative, no marketing fluff, no exclamation marks, no emoji.

Output ONLY a single JSON object with this exact shape (no surrounding prose, no code fences):
{
  "title": string,
  "summary": string,
  "responsibilities": string[],
  "qualifications": string[],
  "whatWeOffer": string[]
}

Constraints:
- title: a clean, professional job title with seniority where appropriate (e.g., "Associate Dentist — Multi-Location DSO")
${summaryConstraint}
- responsibilities: 5-8 bullet items, each one short imperative phrase
- qualifications: 4-6 bullet items mixing required + preferred
- whatWeOffer: 4-6 bullet items covering compensation philosophy, benefits, growth, culture

Use dental-industry vocabulary correctly (DDS/DMD, RDH, EFDA, DEA, CE, SRP, perio, etc.) where appropriate. Write to the candidate, not about the candidate.`;
}

function buildUserPrompt(args: {
  roleLabel: string;
  roleCategory: string;
  brief: string;
  tone: "professional" | "friendly" | "concise";
  employerName: string;
  useDsoName: boolean;
}): string {
  // Label the employer field correctly for the model — when affiliation
  // is private, signal that this is the public-facing practice name,
  // not a DSO brand. Reinforces the system-prompt constraint.
  const employerFieldLabel = args.useDsoName ? "DSO" : "Practice (public brand)";
  const privacyReminder = args.useDsoName
    ? ""
    : `\n\nIMPORTANT: This practice presents publicly as a standalone brand. The corporate ownership is intentionally not disclosed in this job description. Refer to the employer only as "${args.employerName}" or generic terms like "our practice." Do not mention any DSO, corporate parent, or multi-location operator.`;

  return `Write a job posting for:

${employerFieldLabel}: ${args.employerName}
Role: ${args.roleLabel} (${args.roleCategory})
Tone: ${args.tone}

Operator-supplied brief (use as guidance, not verbatim):
${args.brief || "(no specific notes — write a strong default for this role)"}${privacyReminder}

Return only the JSON object specified in the system prompt.`;
}

// extractJson moved to src/lib/ai/extract-json.ts (shared parser).
