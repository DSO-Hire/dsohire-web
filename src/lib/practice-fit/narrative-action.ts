"use server";

/**
 * Phase 5D v1 — AI narrative layer on top of Practice Fit v0.
 *
 * Server action invoked by <WhyThisMatch /> on first expand. Returns
 * a 2-3 sentence Haiku-generated narrative in two audience framings:
 *
 *   • employer  — "Sarah's KS license + pediatric specialty match this
 *                  Topeka role; her preferred comp range overlaps yours."
 *   • candidate — "Your KS license + pediatric specialty line up with
 *                  this Topeka role; the comp range covers what you
 *                  said you needed."
 *
 * Both are returned in a single Haiku call (one input prompt → JSON
 * output object with two fields). The component renders the
 * audience-appropriate string based on its `audience` prop.
 *
 * Cache strategy
 * ─────────────────────────────────────────────────────────────────
 * Same row as the v0 score (practice_fit_scores), with four extra
 * columns added in 20260507000006:
 *   narrative_employer / narrative_candidate / narrative_input_hash
 *   / narrative_generated_at
 *
 * Hash drift OR missing narrative → recompute. We compute the
 * narrative-input hash separately from the score input hash because
 * the prompt includes name/company/city which the score math doesn't
 * touch.
 *
 * Skip rules
 * ─────────────────────────────────────────────────────────────────
 *   • bucket='low' → return null without calling Haiku. The dimension
 *     breakdown is more useful than a warm narrative on a 32% match.
 *   • Existing RLS row not visible → "not authorized" error. The
 *     user-scoped read happens first; if it returns null, we don't
 *     fall through to the service-role context fetch.
 *
 * Logging
 * ─────────────────────────────────────────────────────────────────
 * Every Haiku call writes one ai_usage_events row with
 * feature='practice_fit_narrative'. dso_id is set when an employer
 * triggered the call, null when the candidate did.
 */

import { z } from "zod";
import { createHash } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  getAnthropic,
  HAIKU_MODEL,
  estimateHaikuCostUsd,
} from "@/lib/ai/anthropic";
import { logAiUsage } from "@/lib/ai/usage";
import { extractJson } from "@/lib/ai/extract-json";
import { greetingFirstName } from "@/lib/candidate/name";
import type { FitBucket, FitDimensionKey, FitResult } from "./types";
import type {
  GeneratePracticeFitNarrativeInput,
  PracticeFitNarrativeResponse,
} from "./narrative-types";

// ─────────────────────────────────────────────────────────────────────
// Internal validation schema
// ─────────────────────────────────────────────────────────────────────

const NarrativeSchema = z.object({
  employer_narrative: z.string().min(20).max(600),
  candidate_narrative: z.string().min(20).max(600),
});

// ─────────────────────────────────────────────────────────────────────
// Public action
// ─────────────────────────────────────────────────────────────────────

export async function generatePracticeFitNarrative(
  input: GeneratePracticeFitNarrativeInput
): Promise<PracticeFitNarrativeResponse> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  // RLS-scoped read of the existing fit row. If RLS blocks us, we
  // never proceed to the prompt — protects against fishing for
  // narratives on candidates the user can't see.
  const { data: rowRaw, error: rowErr } = await supabase
    .from("practice_fit_scores")
    .select(
      `score, bucket, dimensions, top_factors, input_hash,
       narrative_employer, narrative_candidate,
       narrative_input_hash, narrative_generated_at`
    )
    .eq("candidate_id", input.candidateId)
    .eq("job_id", input.jobId)
    .maybeSingle();

  if (rowErr) {
    console.error("[practice-fit/narrative] row read failed:", rowErr);
    return { ok: false, error: "Couldn't load match details." };
  }
  if (!rowRaw) {
    return {
      ok: false,
      error: "Match details aren't available yet — try again in a moment.",
    };
  }

  const row = rowRaw as Record<string, unknown>;
  const bucket = row.bucket as FitBucket;

  // Skip rule: low bucket gets the dimension breakdown only.
  if (bucket === "low") {
    return {
      ok: true,
      bucket,
      narrative_employer: null,
      narrative_candidate: null,
      fresh: false,
    };
  }

  // Service-role fetch of the surrounding context (names, locations,
  // comp). This runs ONLY after the RLS-scoped row read succeeded, so
  // we know the caller has legitimate access to this pair.
  const ctx = await loadContext(input.candidateId, input.jobId);
  if (!ctx) {
    return { ok: false, error: "Couldn't assemble match context." };
  }

  // v1.1 — derive coverage from the stored dimensions JSON. Same
  // approach the cache reader uses; saves a column.
  const dims = row.dimensions as FitResult["dimensions"];
  let scored_weight = 0;
  let total_weight = 0;
  let scored_count = 0;
  let total_count = 0;
  for (const d of Object.values(dims)) {
    total_weight += d.weight;
    total_count += 1;
    if (d.scored) {
      scored_weight += d.weight;
      scored_count += 1;
    }
  }

  const fit: FitResult = {
    score: row.score as number,
    bucket,
    dimensions: dims,
    top_factors: row.top_factors as FitDimensionKey[],
    coverage: { scored_weight, total_weight, scored_count, total_count },
    input_hash: row.input_hash as string,
  };

  const newHash = computeNarrativeHash(fit, ctx);

  // Cache hit: hash matches AND we have BOTH narratives stored.
  const storedHash = (row.narrative_input_hash as string | null) ?? null;
  const storedEmp = (row.narrative_employer as string | null) ?? null;
  const storedCan = (row.narrative_candidate as string | null) ?? null;
  if (storedHash === newHash && storedEmp && storedCan) {
    return {
      ok: true,
      bucket,
      narrative_employer: storedEmp,
      narrative_candidate: storedCan,
      fresh: false,
    };
  }

  // Cache miss / hash drift — call Haiku.
  const dsoIdForLogging =
    input.audience === "employer" ? ctx.dsoId : null;

  let response: Anthropic.Messages.Message;
  try {
    response = await getAnthropic().messages.create({
      model: HAIKU_MODEL,
      max_tokens: 600,
      system: NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildNarrativeUserPrompt(fit, ctx) }],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI request failed";
    await logAiUsage({
      dsoId: dsoIdForLogging,
      userId: user.id,
      feature: "practice_fit_narrative",
      model: HAIKU_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      costUsdEstimate: 0,
      requestMetadata: {
        candidate_id: input.candidateId,
        job_id: input.jobId,
        audience: input.audience,
        bucket,
        score: fit.score,
        error: message,
      },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      error: "We couldn't generate match notes right now. Try again in a moment.",
    };
  }

  const rawText = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let parsed: { employer_narrative: string; candidate_narrative: string };
  try {
    const json = extractJson(rawText);
    parsed = NarrativeSchema.parse(json);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not parse AI response";
    const zodIssues =
      err instanceof z.ZodError
        ? err.issues.slice(0, 5).map((i) => ({
            path: i.path.join("."),
            code: i.code,
            message: i.message,
          }))
        : null;
    await logAiUsage({
      dsoId: dsoIdForLogging,
      userId: user.id,
      feature: "practice_fit_narrative",
      model: HAIKU_MODEL,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      costUsdEstimate: estimateHaikuCostUsd(
        response.usage.input_tokens,
        response.usage.output_tokens
      ),
      requestMetadata: {
        candidate_id: input.candidateId,
        job_id: input.jobId,
        audience: input.audience,
        bucket,
        score: fit.score,
        parse_error: message,
        zod_issues: zodIssues,
        raw_preview: rawText.slice(0, 400),
      },
      succeeded: false,
      errorMessage: message,
    });
    return {
      ok: false,
      error:
        "The match-notes generator returned an unexpected shape. Try again.",
    };
  }

  // Write through to cache. Service-role because RLS blocks user
  // INSERT on practice_fit_scores.
  const admin = createSupabaseServiceRoleClient();
  const { error: writeErr } = await admin
    .from("practice_fit_scores")
    .update({
      narrative_employer: parsed.employer_narrative.trim(),
      narrative_candidate: parsed.candidate_narrative.trim(),
      narrative_input_hash: newHash,
      narrative_generated_at: new Date().toISOString(),
    })
    .eq("candidate_id", input.candidateId)
    .eq("job_id", input.jobId);
  if (writeErr) {
    console.error("[practice-fit/narrative] cache write failed:", writeErr);
    // Non-fatal: the user still gets the narrative for this view; the
    // next view will re-call Haiku. Better than failing the request.
  }

  await logAiUsage({
    dsoId: dsoIdForLogging,
    userId: user.id,
    feature: "practice_fit_narrative",
    model: HAIKU_MODEL,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    costUsdEstimate: estimateHaikuCostUsd(
      response.usage.input_tokens,
      response.usage.output_tokens
    ),
    requestMetadata: {
      candidate_id: input.candidateId,
      job_id: input.jobId,
      audience: input.audience,
      bucket,
      score: fit.score,
    },
  });

  return {
    ok: true,
    bucket,
    narrative_employer: parsed.employer_narrative.trim(),
    narrative_candidate: parsed.candidate_narrative.trim(),
    fresh: true,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Context loading
// ─────────────────────────────────────────────────────────────────────

interface NarrativeContext {
  candidateFirstName: string | null;
  candidateState: string | null;
  candidateLicenseStates: string[];
  candidateRoles: string[];
  candidateSpecialties: string[];
  candidateTopSkills: string[];
  jobTitle: string;
  jobRoleCategory: string;
  jobEmploymentType: string;
  jobCompMin: number | null;
  jobCompMax: number | null;
  jobCompPeriod: string | null;
  jobLocations: Array<{ city: string | null; state: string | null }>;
  jobSkills: string[];
  dsoId: string;
  dsoName: string;
  dsoLocationCount: number;
}

async function loadContext(
  candidateId: string,
  jobId: string
): Promise<NarrativeContext | null> {
  // Service-role: this only runs after the RLS-scoped read on
  // practice_fit_scores succeeded, which proves the caller has
  // legitimate access to the pair.
  const admin = createSupabaseServiceRoleClient();

  const [{ data: cand }, { data: job }] = await Promise.all([
    admin
      .from("candidates")
      .select(
        `first_name, full_name, current_location_state, license_states,
         desired_roles, desired_specialty, skills`
      )
      .eq("id", candidateId)
      .maybeSingle(),
    admin
      .from("jobs")
      .select(
        `dso_id, title, role_category, employment_type,
         compensation_min, compensation_max, compensation_period,
         job_locations(location:dso_locations(city, state)),
         job_skills(skill)`
      )
      .eq("id", jobId)
      .maybeSingle(),
  ]);
  if (!cand || !job) return null;

  const candR = cand as Record<string, unknown>;
  const jobR = job as Record<string, unknown>;
  const dsoId = jobR.dso_id as string;

  const { data: dso } = await admin
    .from("dsos")
    .select("name")
    .eq("id", dsoId)
    .maybeSingle();
  const dsoR = (dso ?? {}) as Record<string, unknown>;

  const { count: locationCount } = await admin
    .from("dso_locations")
    .select("id", { count: "exact", head: true })
    .eq("dso_id", dsoId);

  const candidateFirstName =
    greetingFirstName(
      {
        first_name: (candR.first_name as string | null) ?? null,
        full_name: (candR.full_name as string | null) ?? null,
      },
      "",
    ) || null;

  const locationsJoin = (jobR.job_locations ?? []) as Array<{
    location: { city: string | null; state: string | null } | null;
  }>;
  const locations = locationsJoin
    .map((row) => row.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const skillsJoin = (jobR.job_skills ?? []) as Array<{ skill: string | null }>;
  const jobSkills = skillsJoin
    .map((s) => s.skill)
    .filter((s): s is string => Boolean(s));

  return {
    candidateFirstName,
    candidateState: (candR.current_location_state as string | null) ?? null,
    candidateLicenseStates:
      ((candR.license_states as string[] | null) ?? []) as string[],
    candidateRoles:
      ((candR.desired_roles as string[] | null) ?? []) as string[],
    candidateSpecialties:
      ((candR.desired_specialty as string[] | null) ?? []) as string[],
    candidateTopSkills: (
      ((candR.skills as string[] | null) ?? []) as string[]
    ).slice(0, 8),
    jobTitle: (jobR.title as string) ?? "(untitled)",
    jobRoleCategory: (jobR.role_category as string) ?? "",
    jobEmploymentType: (jobR.employment_type as string) ?? "",
    jobCompMin: (jobR.compensation_min as number | null) ?? null,
    jobCompMax: (jobR.compensation_max as number | null) ?? null,
    jobCompPeriod: (jobR.compensation_period as string | null) ?? null,
    jobLocations: locations,
    jobSkills,
    dsoId,
    dsoName: (dsoR.name as string | null) ?? "the DSO",
    dsoLocationCount: locationCount ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Hashing
// ─────────────────────────────────────────────────────────────────────

/**
 * SHA-256 over the *narrative* inputs. Different from the v0 score
 * input hash because the narrative prompt also depends on names,
 * cities, dimension labels — none of which the score math touches.
 *
 * Stable JSON.stringify with sorted keys so equivalent inputs produce
 * the same hex even across deploys.
 */
function computeNarrativeHash(
  fit: FitResult,
  ctx: NarrativeContext
): string {
  const canonical = JSON.stringify({
    score: fit.score,
    bucket: fit.bucket,
    top_factors: fit.top_factors,
    dimensions: Object.fromEntries(
      (Object.keys(fit.dimensions) as FitDimensionKey[])
        .sort()
        .map((k) => [
          k,
          {
            label: fit.dimensions[k].label,
            detail: fit.dimensions[k].detail,
            contribution: Math.round(fit.dimensions[k].contribution),
            weight: fit.dimensions[k].weight,
          },
        ])
    ),
    candidate: {
      first_name: ctx.candidateFirstName,
      state: ctx.candidateState,
      license_states: [...ctx.candidateLicenseStates].sort(),
      roles: [...ctx.candidateRoles].sort(),
      specialties: [...ctx.candidateSpecialties].sort(),
      top_skills: [...ctx.candidateTopSkills].sort(),
    },
    job: {
      title: ctx.jobTitle,
      role: ctx.jobRoleCategory,
      employment_type: ctx.jobEmploymentType,
      comp_min: ctx.jobCompMin,
      comp_max: ctx.jobCompMax,
      comp_period: ctx.jobCompPeriod,
      locations: ctx.jobLocations
        .map((l) => `${l.city ?? ""}|${l.state ?? ""}`)
        .sort(),
      skills: [...ctx.jobSkills].sort(),
    },
    dso: {
      name: ctx.dsoName,
      location_count: ctx.dsoLocationCount,
    },
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// ─────────────────────────────────────────────────────────────────────
// Prompt
// ─────────────────────────────────────────────────────────────────────

const NARRATIVE_SYSTEM_PROMPT = `You write 2-3 sentence "match notes" for a dental-industry job board called DSO Hire. Each candidate-job pair has a structured Practice Fit score (0-100) plus a multi-dimension breakdown — compensation, location, specialty, skills, years_experience, employment_type, dso_size, and schedule_overlap. Role is a pre-filter, not a dimension. Some dims may be "not scored" when one side lacks data — they're excluded from the denominator. The structured math is already done — your job is to translate the top contributors into a warm, scannable narrative that helps a busy reader understand the *shape* of the match in plain English.

You produce TWO narratives, both grounded in the same factual inputs but framed for different audiences:
  • employer_narrative — second-person addressed to a DSO recruiter looking at this candidate. Refer to the candidate by first name. Example: "Sarah's KS license and pediatric specialty match your Topeka pediatric role; the comp range she's looking for fits comfortably inside yours."
  • candidate_narrative — second-person addressed to the candidate looking at this job. Refer to "you" / "your". Example: "Your KS license and pediatric specialty line up cleanly with this Topeka pediatric role, and the posted comp range covers what you said you needed."

VOICE
  • Practical, declarative, lightly confident. Like a colleague pointing at a hiring board.
  • DO NOT use marketing language. No "passionate," "results-driven," "dynamic," "synergy," "perfect fit," "amazing match."
  • DO NOT make up specifics that aren't in the input. If the candidate's salary preference isn't given, don't invent one.
  • DO NOT congratulate either side ("great choice," "you should definitely apply"). Stick to *what fits and why*.
  • No emoji. No exclamation marks. No bullet points.

LENGTH
  • 2 sentences ideal. 3 is fine if a third dimension is genuinely worth calling out.
  • 30-90 words per narrative. The reader is scanning.

CONTENT GUIDANCE
  • Lead with the strongest contributing dimension(s) — the input includes top_factors ordered by contribution.
  • If a dimension has notably low contribution (e.g. "skills overlap is light"), it's fine to mention as nuance — but never lead with weakness.
  • For mid-bucket scores (solid/light), be honest: "fits on role and location, lighter overlap on the specific skills." Don't oversell.
  • Use dental vocabulary correctly (DDS/DMD/RDH/CDA/EFDA, GP, ortho, perio, endo, pedo, etc.).
  • If the candidate's first name is null/missing, refer to them as "this candidate" in the employer narrative.

OUTPUT FORMAT
Return ONLY a single JSON object — no surrounding prose, no code fences:
{ "employer_narrative": string, "candidate_narrative": string }`;

function buildNarrativeUserPrompt(
  fit: FitResult,
  ctx: NarrativeContext
): string {
  const lines: string[] = [];
  lines.push(`Practice Fit score: ${fit.score} / 100 (bucket: ${fit.bucket})`);
  lines.push("");
  lines.push("Top contributing dimensions (ordered by contribution desc):");
  for (const key of fit.top_factors) {
    const dim = fit.dimensions[key as FitDimensionKey];
    if (!dim) continue;
    lines.push(
      `  • ${dim.label} (+${Math.round(dim.contribution)} of ${dim.weight}): ${dim.detail}`
    );
  }

  // Also include ALL dimensions so the model can reference weak spots
  // when honesty is appropriate (mid-bucket).
  lines.push("");
  lines.push("All dimensions (for context — only mention weak ones when honesty calls for it):");
  for (const key of Object.keys(fit.dimensions) as FitDimensionKey[]) {
    if (fit.top_factors.includes(key)) continue;
    const dim = fit.dimensions[key];
    lines.push(
      `  • ${dim.label} (+${Math.round(dim.contribution)} of ${dim.weight}): ${dim.detail}`
    );
  }

  lines.push("");
  lines.push("Candidate context:");
  lines.push(`  First name: ${ctx.candidateFirstName ?? "(not provided)"}`);
  if (ctx.candidateState) lines.push(`  Current state: ${ctx.candidateState}`);
  if (ctx.candidateLicenseStates.length > 0) {
    lines.push(`  Licensed in: ${ctx.candidateLicenseStates.join(", ")}`);
  }
  if (ctx.candidateRoles.length > 0) {
    lines.push(`  Open to roles: ${ctx.candidateRoles.join(", ")}`);
  }
  if (ctx.candidateSpecialties.length > 0) {
    lines.push(`  Specialties: ${ctx.candidateSpecialties.join(", ")}`);
  }
  if (ctx.candidateTopSkills.length > 0) {
    lines.push(`  Top skills: ${ctx.candidateTopSkills.join(", ")}`);
  }

  lines.push("");
  lines.push("Job context:");
  lines.push(`  Title: ${ctx.jobTitle}`);
  if (ctx.jobRoleCategory) lines.push(`  Role: ${ctx.jobRoleCategory}`);
  if (ctx.jobEmploymentType) {
    lines.push(`  Employment type: ${ctx.jobEmploymentType}`);
  }
  if (ctx.jobCompMin !== null && ctx.jobCompMax !== null) {
    lines.push(
      `  Comp range: $${ctx.jobCompMin}–$${ctx.jobCompMax}${ctx.jobCompPeriod ? " " + ctx.jobCompPeriod : ""}`
    );
  }
  if (ctx.jobLocations.length > 0) {
    const formatted = ctx.jobLocations
      .map((l) => [l.city, l.state].filter(Boolean).join(", "))
      .filter(Boolean)
      .join(" / ");
    if (formatted) lines.push(`  Locations: ${formatted}`);
  }
  if (ctx.jobSkills.length > 0) {
    lines.push(`  Listed skills: ${ctx.jobSkills.slice(0, 10).join(", ")}`);
  }

  lines.push("");
  lines.push("DSO context:");
  lines.push(`  Name: ${ctx.dsoName}`);
  lines.push(`  Practice count: ${ctx.dsoLocationCount}`);

  lines.push("");
  lines.push(
    "Return ONLY the JSON: { \"employer_narrative\": ..., \"candidate_narrative\": ... }"
  );

  return lines.join("\n");
}
