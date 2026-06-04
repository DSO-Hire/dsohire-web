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
import { logAiUsage, checkAiRateLimit } from "@/lib/ai/usage";
import { extractJson } from "@/lib/ai/extract-json";
import { ROLE_RECOMMENDATIONS } from "@/lib/screening/question-library";
import { getActiveSubscription } from "@/lib/billing/subscription";

// 2026-05-26 — Details-step context, threaded in after the wizard re-sequence
// (Details now runs before Description). All optional so the action stays
// back-compat with callers that don't supply it (corporate wizard + edit
// pages, until they're updated). When present, the generator grounds the
// draft in the recruiter's actual choices instead of inventing them.
const DetailsContextSchema = z
  .object({
    compType: z.string().optional(),
    compMin: z.string().optional(),
    compMax: z.string().optional(),
    compPeriod: z.string().optional(),
    variableCompEnabled: z.boolean().optional(),
    variableCompTarget: z.string().optional(),
    variableCompStructure: z.string().optional(),
    bonusEnabled: z.boolean().optional(),
    bonusTarget: z.string().optional(),
    bonusStructure: z.string().optional(),
    equityOffered: z.boolean().optional(),
    skills: z.array(z.string()).optional(),
    benefits: z.array(z.string()).optional(),
    requirements: z.string().optional(),
    scheduleDays: z.array(z.string()).optional(),
    scheduleEvenings: z.boolean().optional(),
    scheduleWeekends: z.boolean().optional(),
    minYearsExperience: z.string().optional(),
    specialty: z.string().optional(),
    employmentType: z.string().optional(),
  })
  .optional();

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
  details: DetailsContextSchema,
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

  // AI abuse guard — cooldown + rolling daily cap before we spend on a model
  // call. Logs already exist; this stops rapid-fire / bot hammering.
  const rate = await checkAiRateLimit(user.id, "jd_generator");
  if (!rate.allowed) {
    return { ok: false, error: rate.message ?? "Please try again shortly." };
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

  // Look up the role label + recommended-screening hints to ground the prompt.
  const roleLabel =
    ROLE_RECOMMENDATIONS[parsed.data.roleCategory]?.label ??
    parsed.data.roleCategory;

  // Resolve the affiliation context. Mirrors the most-private-inherits
  // rule (Q3): if any selected location is private (public_dso_affiliation
  // = false), the whole job's public surfaces hide the DSO name — so the
  // AI-generated copy must do the same.
  //
  // 5G.a follow-up (2026-05-13): corporate-scope jobs may have 0 selected
  // locations (anchor-optional). When that happens, fall back to the DSO's
  // AGGREGATE location set instead of leaking the raw DSO name. Rule:
  //   - 0 locations selected → check all DSO locations: if every one is
  //     private, the DSO is effectively private → use a generic employer
  //     phrase ("the company"). If any location is public, the DSO has
  //     opted into corporate-name exposure, so use the DSO name.
  //   - 1+ locations selected → original logic (any private → mask).
  let useDsoName = true;
  // Anonymity tier 2 — when the masked location also hides its practice name,
  // the JD must not emit the practice name either (it'd leak straight past the
  // "Dental Office in {city}" mask, which is exactly the bug Cam caught).
  let anonymizePractice = false;
  let employerNameForPrompt = dso?.name ?? "the practice";

  const selectedIds = parsed.data.locationIds ?? [];

  if (selectedIds.length > 0) {
    const { data: selectedLocs } = await supabase
      .from("dso_locations")
      .select("id, name, city, public_dso_affiliation, anonymize_name")
      .eq("dso_id", dsoUser.dso_id)
      .in("id", selectedIds);
    const locs = (selectedLocs ?? []) as Array<{
      id: string;
      name: string;
      city: string | null;
      public_dso_affiliation: boolean;
      anonymize_name: boolean;
    }>;
    const allPublic = locs.length > 0 && locs.every((l) => l.public_dso_affiliation);
    if (!allPublic && locs.length > 0) {
      useDsoName = false;
      const privateLocs = locs.filter((l) => !l.public_dso_affiliation);
      // Mirror the display resolver: it masks to the FIRST private location, so
      // if that one is anonymized the public sees "Dental Office in {city}".
      const primaryPrivate = privateLocs[0] ?? null;
      if (primaryPrivate?.anonymize_name) {
        anonymizePractice = true;
        employerNameForPrompt = primaryPrivate.city
          ? `our office in ${primaryPrivate.city}`
          : "our practice";
      } else {
        employerNameForPrompt =
          privateLocs.length === 1 ? privateLocs[0]!.name : "the practice";
      }
    }
  } else {
    // 0 locations selected — typical for corporate-scope jobs. Check the
    // DSO's full location set so a corporate posting doesn't leak the
    // corporate parent name when the DSO's posture says it shouldn't.
    //
    // The policy split (Cam direction 2026-05-13):
    //   strict     — mask when ANY location is private. Default per
    //                legal-shield posture. Most-private-inherits at the
    //                DSO level.
    //   permissive — expose when ANY location is public. Recruiter has
    //                explicitly opted into using the corporate name on
    //                corporate-scope postings.
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
      // Permissive: only mask when NO location is public. (If every
      // location is private under permissive policy, still mask — the
      // DSO has no public affiliation to fall back on.)
      useDsoName = false;
      employerNameForPrompt = "the company";
    }
    // Otherwise (strict + all public, OR permissive + any public) keep
    // the default DSO name.
  }

  const systemPrompt = buildSystemPrompt({ useDsoName, anonymizePractice });
  const userPrompt = buildUserPrompt({
    roleLabel,
    roleCategory: parsed.data.roleCategory,
    brief: parsed.data.brief,
    tone: parsed.data.tone,
    employerName: employerNameForPrompt,
    useDsoName,
    anonymizePractice,
    details: parsed.data.details,
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

function buildSystemPrompt({
  useDsoName,
  anonymizePractice,
}: {
  useDsoName: boolean;
  anonymizePractice: boolean;
}): string {
  // Affiliation-aware variant of the summary instruction. When the
  // caller's selected location set includes any private-affiliation
  // practice, we instruct the model NOT to mention the corporate DSO
  // name and to refer only to the practice / "our practice." Phase
  // 4.5.b launch-blocker, locked 2026-05-08. Anonymity tier 2 (2026-06-04)
  // tightens this further: the practice NAME itself is withheld too.
  const summaryConstraint = anonymizePractice
    ? `- summary: 2-3 paragraphs, conversational but professional. Refer to the employer ONLY as "our practice" or "our office." Do NOT use ANY specific practice, office, company, brand, or DSO name anywhere — the employer's identity is intentionally withheld on this listing.`
    : useDsoName
      ? `- summary: 2-3 paragraphs, conversational but professional, mentions the employer name and role focus`
      : `- summary: 2-3 paragraphs, conversational but professional, refers ONLY to the practice (the employer name supplied below). Do NOT mention any parent DSO, corporate parent, or affiliated brand. Do NOT use phrases like "part of a larger DSO," "owned by," or anything that implies corporate ownership. The practice presents as a standalone brand.`;

  const titleConstraint = anonymizePractice
    ? `- title: a clean, professional job title for the ROLE only (e.g., "Dental Office Manager"). Do NOT put any employer, practice, office, or company name in the title.`
    : `- title: a clean, professional job title with seniority where appropriate (e.g., "Associate Dentist — Multi-Location DSO")`;

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
${titleConstraint}
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
  anonymizePractice: boolean;
  details?: z.infer<typeof DetailsContextSchema>;
}): string {
  // Label the employer field correctly for the model — when affiliation
  // is private, signal that this is the public-facing practice name,
  // not a DSO brand. Reinforces the system-prompt constraint.
  const employerFieldLabel = args.anonymizePractice
    ? "Employer (name withheld — use only generic phrasing)"
    : args.useDsoName
      ? "DSO"
      : "Practice (public brand)";
  const privacyReminder = args.anonymizePractice
    ? `\n\nIMPORTANT: This employer's identity is intentionally withheld on this listing. Do NOT use any specific practice, office, company, brand, or DSO name ANYWHERE in the output — not in the title, summary, or any bullet. Refer to the employer only as "${args.employerName}" or generic terms like "our practice" / "our team."`
    : args.useDsoName
      ? ""
      : `\n\nIMPORTANT: This practice presents publicly as a standalone brand. The corporate ownership is intentionally not disclosed in this job description. Refer to the employer only as "${args.employerName}" or generic terms like "our practice." Do not mention any DSO, corporate parent, or multi-location operator.`;

  // 2026-05-26 — Job-specific context block. Built from the Details step
  // (now Step 2 of the wizard). When the recruiter has already locked in
  // pay, skills, benefits, schedule, etc., the AI grounds the draft in
  // those facts instead of inventing them. When absent (legacy / edit
  // surfaces / corporate wizard), the section is omitted entirely and the
  // generator falls back to brief-only.
  const contextBlock = buildJobContextBlock(args.details);

  return `Write a job posting for:

${employerFieldLabel}: ${args.employerName}
Role: ${args.roleLabel} (${args.roleCategory})
Tone: ${args.tone}

Operator-supplied brief (use as guidance, not verbatim):
${args.brief || "(no specific notes — write a strong default for this role)"}${contextBlock}${privacyReminder}

Return only the JSON object specified in the system prompt.`;
}

/**
 * Render the Details-step context into a structured prompt block so the
 * model treats it as ground truth instead of inferring. Returns an empty
 * string when no context was supplied (back-compat with edit surfaces +
 * the corporate wizard, which run their own generator).
 *
 * Hard rule baked into the block: the model uses what's here verbatim —
 * it doesn't invent comp figures, swap units, or contradict the schedule.
 * When a field is blank, the model is told to skip it rather than
 * hallucinate a placeholder.
 */
function buildJobContextBlock(
  details: z.infer<typeof DetailsContextSchema>
): string {
  if (!details) return "";
  const lines: string[] = [];

  // Compensation — text-format so the model sees the recruiter's intent
  // (range vs. hourly vs. salary, with optional variable / bonus / equity
  // overlays). Skip the block entirely if no comp data was filled.
  const compType = details.compType || "range";
  const compMin = (details.compMin || "").trim();
  const compMax = (details.compMax || "").trim();
  const compPeriod = (details.compPeriod || "").trim();
  if (compMin || compMax) {
    const periodLabel = compPeriod === "hour" ? "/hr" : compPeriod === "year" ? "/yr" : compPeriod ? `/${compPeriod}` : "";
    let compLine: string;
    if (compType === "exact" && compMin) {
      compLine = `${formatDollars(compMin)}${periodLabel}`;
    } else if (compMin && compMax) {
      compLine = `${formatDollars(compMin)}–${formatDollars(compMax)}${periodLabel}`;
    } else {
      compLine = `${formatDollars(compMin || compMax)}${periodLabel}`;
    }
    lines.push(`- Base compensation: ${compLine}`);
  }
  if (details.variableCompEnabled) {
    const target = (details.variableCompTarget || "").trim();
    const structure = (details.variableCompStructure || "").trim();
    const parts = [
      target ? `target ${formatDollars(target)}` : null,
      structure || null,
    ].filter(Boolean);
    if (parts.length) {
      lines.push(`- Variable compensation: ${parts.join(" — ")}`);
    } else {
      lines.push(`- Variable compensation: offered (terms negotiable)`);
    }
  }
  if (details.bonusEnabled) {
    const target = (details.bonusTarget || "").trim();
    const structure = (details.bonusStructure || "").trim();
    const parts = [
      target ? `target ${formatDollars(target)}` : null,
      structure || null,
    ].filter(Boolean);
    if (parts.length) {
      lines.push(`- Bonus: ${parts.join(" — ")}`);
    } else {
      lines.push(`- Bonus: offered (terms negotiable)`);
    }
  }
  if (details.equityOffered) {
    lines.push(`- Equity / ownership: offered`);
  }

  if (details.employmentType) {
    const map: Record<string, string> = {
      full_time: "Full-time",
      part_time: "Part-time",
      contract: "Contract / 1099",
      per_diem: "Per diem",
      locum: "Locum tenens",
      temporary: "Temporary",
    };
    lines.push(`- Employment type: ${map[details.employmentType] ?? details.employmentType}`);
  }

  const schedDays = (details.scheduleDays ?? []).filter(Boolean);
  if (schedDays.length || details.scheduleEvenings || details.scheduleWeekends) {
    const parts: string[] = [];
    if (schedDays.length) parts.push(schedDays.join(" / "));
    if (details.scheduleEvenings) parts.push("evening shifts");
    if (details.scheduleWeekends) parts.push("weekend shifts (Sat/Sun)");
    lines.push(`- Schedule: ${parts.join(", ")}`);
  }

  if ((details.minYearsExperience || "").trim()) {
    lines.push(`- Minimum experience: ${details.minYearsExperience!.trim()}+ years`);
  }

  if ((details.specialty || "").trim()) {
    lines.push(`- Specialty / focus area: ${details.specialty!.trim()}`);
  }

  const skills = (details.skills ?? []).filter(Boolean);
  if (skills.length) {
    lines.push(`- Preferred skills (use these verbatim where they fit): ${skills.join(", ")}`);
  }

  const benefits = (details.benefits ?? []).filter(Boolean);
  if (benefits.length) {
    lines.push(`- Benefits offered (work into whatWeOffer): ${benefits.join(", ")}`);
  }

  const requirements = (details.requirements || "").trim();
  if (requirements) {
    lines.push(
      `- Hard requirements (must appear in qualifications, one per line):\n${requirements
        .split("\n")
        .map((r) => `    • ${r.trim()}`)
        .filter((r) => r.trim() !== "•")
        .join("\n")}`
    );
  }

  if (lines.length === 0) return "";

  return `\n\nJob-specific context (TREAT AS GROUND TRUTH — do not invent comp figures, swap units, or contradict the schedule. Reflect these facts in the draft):
${lines.join("\n")}`;
}

/** Format a numeric-string dollar amount with thousands separators. */
function formatDollars(raw: string): string {
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  if (!Number.isFinite(n)) return `$${raw}`;
  return `$${n.toLocaleString()}`;
}

// extractJson moved to src/lib/ai/extract-json.ts (shared parser).
