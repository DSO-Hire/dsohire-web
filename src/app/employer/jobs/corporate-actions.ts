"use server";

/**
 * /employer/jobs/new/corporate/* server actions (Phase 5G.d, 2026-05-14).
 *
 * The corporate analogue of ./actions.ts. Corporate jobs are a deliberately
 * separate posting flow — the field set diverges hard from the dental-
 * clinical wizard (no specialty / Practice-Fit schedule fields; instead a
 * 16-column corporate sandbox: work mode, travel, reporting structure,
 * authority level, education, industry experience, comp extras, equity).
 *
 * Every row written here carries:
 *   • scope          = 'corporate'
 *   • role_category  = 'other'   (corporate jobs are categorized by
 *                                 corporate_function, not role_category)
 *
 * Anchor location(s) are OPTIONAL for corporate jobs — 0, 1, or N are all
 * valid (a DSO-wide role may have no single HQ). This is the key divergence
 * from the practice wizard, which requires ≥1 location.
 *
 * Shared logic (slug gen, audit helper, screening-question validation,
 * external-links parsing, the closed-enum Sets) is imported from
 * ./job-shared.ts — NOT copy-pasted. ./actions.ts imports the same module.
 *
 * ════════════════════════════════════════════════════════════════════════
 * FORMDATA CONTRACT — exact field names parseCorporateJobInput(formData)
 * reads. The corporate wizard UI (built by a separate task) MUST submit
 * against this contract.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Single-value text/select fields (formData.get):
 *   title                          string, required, ≤200 chars
 *   description                    string, required, rich-text HTML
 *                                    (rejected if empty or "<p></p>")
 *   employment_type                string, default "full_time"
 *   corporate_function             string, REQUIRED — must be a valid slug
 *                                    from CORPORATE_FUNCTION_SLUGS
 *   authority_level                string, REQUIRED — valid AuthorityLevel
 *                                    (ic|manager|senior_manager|director|
 *                                     vp|svp|c_suite)
 *   work_mode                      string, REQUIRED — valid WorkMode
 *                                    (onsite|remote|hybrid|blended)
 *   work_mode_detail               string, optional free text
 *   travel_expectation             string, optional — valid TravelExpectation
 *                                    (none|under_10|10_to_25|25_to_50|50_plus);
 *                                    invalid/empty → null
 *   travel_territory               string, optional free text
 *   reports_to                     string, optional free text
 *   direct_reports_band            string, optional — valid DirectReportsBand
 *                                    (zero|1_3|4_9|10_plus); invalid/empty → null
 *   indirect_reports_band          string, optional — valid IndirectReportsBand
 *                                    (zero|1_9|10_49|50_plus); invalid/empty → null
 *   education_requirement          string, optional — valid EducationRequirement
 *                                    (hs|ba_bs|ma_ms|mba|jd|dds_dmd|phd|
 *                                     certification_only|none); invalid/empty → null
 *   industry_experience            string, optional — valid IndustryExperience
 *                                    (dso_required|healthcare_adjacent|agnostic);
 *                                    invalid/empty → null
 *   min_years_corporate_experience string int, optional; NaN → error,
 *                                    negative → error
 *   max_years_corporate_experience string int, optional; NaN → error,
 *                                    negative → error; if both present and
 *                                    min > max → error
 *   bonus_structure                string, optional free text
 *   equity_note                    string, optional free text
 *   compensation_min               string int, optional; NaN → error
 *   compensation_max               string int, optional; NaN → error
 *   compensation_period            string, optional (e.g. "year", "hour")
 *   compensation_type              string, default "range" — one of
 *                                    range|starting_at|up_to|exact|doe
 *   requirements                   string, optional free text
 *   status                         string, default "draft"
 *
 * Checkbox fields ("on" when checked, absent otherwise):
 *   compensation_visible           checkbox
 *   hide_stages_from_candidate     checkbox
 *   equity_offered                 checkbox
 *
 * Repeated / multi-value fields (formData.getAll):
 *   location_ids                   repeated string — anchor location IDs;
 *                                    0/1/N all valid (NOT required)
 *   remote_state_restrictions      repeated string — state codes; trimmed,
 *                                    blanks dropped, upper-cased
 *   external_link_label            repeated string \ paired by index into
 *   external_link_url              repeated string / { label, url } rows
 *                                    via the shared parseExternalLinks
 *
 * Sentinel fields:
 *   external_links_submitted       "1" when the form included an external-
 *                                    links section; gates the external_links
 *                                    DB write on update (Slice B pattern)
 *
 * JSON-blob fields:
 *   screening_questions            JSON-encoded array of question objects
 *                                    { id, prompt, helper_text, kind,
 *                                      options, required, sort_order,
 *                                      knockout, knockout_correct_answer }
 *                                    — same shape as the practice wizard
 *
 * Identity fields (create vs update):
 *   dso_id                         string — required on create + all updates
 *   job_id                         string — required on update + section saves
 *
 * Fields the corporate flow deliberately does NOT read (clinical-only):
 *   specialty, min_years_experience, schedule_days, schedule_evenings,
 *   schedule_weekends — left at their column defaults.
 * ════════════════════════════════════════════════════════════════════════
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireActiveSubscriptionError } from "@/lib/billing/subscription";
import { recordAuditEvent } from "@/lib/audit/record";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { CORPORATE_FUNCTION_SLUGS } from "@/lib/corporate/functions";
import {
  WORK_MODES,
  TRAVEL_EXPECTATIONS,
  DIRECT_REPORTS_BANDS,
  INDIRECT_REPORTS_BANDS,
  AUTHORITY_LEVELS,
  EDUCATION_REQUIREMENTS,
  INDUSTRY_EXPERIENCES,
  isValidFieldValue,
  type WorkMode,
  type TravelExpectation,
  type DirectReportsBand,
  type IndirectReportsBand,
  type AuthorityLevel,
  type EducationRequirement,
  type IndustryExperience,
} from "@/lib/corporate/job-fields";
import {
  VALID_KINDS,
  makeSlug,
  validateKnockoutCorrectAnswer,
  parseExternalLinks,
  emitJobAuditEvent,
  resolveAvailableJobSlug,
  type ScreeningQuestionPayload,
} from "./job-shared";
// Reuse the practice wizard's JobActionState verbatim — the corporate
// edit/wizard surfaces are useActionState consumers expecting the same
// { ok, error } shape.
import type { JobActionState } from "./actions";

export type { JobActionState };

/* ───── Parsed shape ───── */

interface ParsedCorporateJobInput {
  title: string;
  description: string;
  employmentType: string;
  status: string;
  // Corporate categorization.
  corporateFunction: string;
  // Compensation — same machinery as the practice wizard.
  compMin: number | null;
  compMax: number | null;
  compPeriod: string | null;
  compType: "range" | "starting_at" | "up_to" | "exact" | "doe";
  compVisible: boolean;
  requirements: string;
  hideStagesFromCandidate: boolean;
  // Anchor locations — OPTIONAL for corporate (0/1/N all valid).
  locationIds: string[];
  // External links + the Slice B sentinel.
  externalLinks: Array<{ label: string; url: string }>;
  externalLinksSubmitted: boolean;
  screeningQuestions: ScreeningQuestionPayload[];
  // ── 16-column corporate sandbox ──
  workMode: WorkMode; // required
  workModeDetail: string | null;
  remoteStateRestrictions: string[];
  travelExpectation: TravelExpectation | null;
  travelTerritory: string | null;
  reportsTo: string | null;
  directReportsBand: DirectReportsBand | null;
  indirectReportsBand: IndirectReportsBand | null;
  authorityLevel: AuthorityLevel; // required
  educationRequirement: EducationRequirement | null;
  industryExperience: IndustryExperience | null;
  minYearsCorporateExperience: number | null;
  maxYearsCorporateExperience: number | null;
  bonusStructure: string | null;
  equityOffered: boolean;
  equityNote: string | null;
}

/* ───── Parsing + validation ───── */

const VALID_CORPORATE_FUNCTION_SLUGS = new Set<string>(CORPORATE_FUNCTION_SLUGS);

/**
 * Read an optional free-text field — trimmed, empty → null.
 */
function optText(formData: FormData, key: string): string | null {
  const v = String(formData.get(key) ?? "").trim();
  return v || null;
}

/**
 * Read an optional closed-enum field — validated against `options`,
 * invalid/empty → null.
 */
function optEnum<V extends string>(
  formData: FormData,
  key: string,
  options: ReadonlyArray<{ value: V; label: string; hint?: string }>
): V | null {
  const v = String(formData.get(key) ?? "").trim();
  return isValidFieldValue(options, v) ? v : null;
}

/**
 * Parse + validate the corporate field set off a FormData submission.
 *
 * NOTE on the async signature: this module is "use server", and Next.js
 * requires every export of a "use server" module to be an async function.
 * The parse logic is synchronous in spirit — there are no awaits inside —
 * but the function is declared `async` so it's a legal "use server"
 * export. Callers `await` it. The return is the discriminated union
 * `ParsedCorporateJobInput | { error: string }` (check `"error" in result`).
 */
export async function parseCorporateJobInput(
  formData: FormData
): Promise<ParsedCorporateJobInput | { error: string }> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const employmentType = String(formData.get("employment_type") ?? "full_time");
  const status = String(formData.get("status") ?? "draft");

  if (!title) return { error: "Job title is required." };
  if (title.length > 200) return { error: "Job title is too long." };
  if (!description || description === "<p></p>") {
    return { error: "Job description is required." };
  }

  // ── Required: corporate_function ──
  const rawCorpFn = String(formData.get("corporate_function") ?? "").trim();
  if (!rawCorpFn) {
    return { error: "Pick a corporate function for this role." };
  }
  if (!VALID_CORPORATE_FUNCTION_SLUGS.has(rawCorpFn)) {
    return { error: "That corporate function isn't recognized." };
  }
  const corporateFunction = rawCorpFn;

  // ── Required: authority_level ──
  const rawAuthority = String(formData.get("authority_level") ?? "").trim();
  if (!rawAuthority) {
    return { error: "Pick an authority level for this role." };
  }
  if (!isValidFieldValue(AUTHORITY_LEVELS, rawAuthority)) {
    return { error: "That authority level isn't recognized." };
  }
  const authorityLevel: AuthorityLevel = rawAuthority;

  // ── Required: work_mode ──
  const rawWorkMode = String(formData.get("work_mode") ?? "").trim();
  if (!rawWorkMode) {
    return { error: "Pick a work mode for this role." };
  }
  if (!isValidFieldValue(WORK_MODES, rawWorkMode)) {
    return { error: "That work mode isn't recognized." };
  }
  const workMode: WorkMode = rawWorkMode;

  // ── Optional closed enums — invalid/empty coerce to null ──
  const travelExpectation = optEnum(
    formData,
    "travel_expectation",
    TRAVEL_EXPECTATIONS
  );
  const directReportsBand = optEnum(
    formData,
    "direct_reports_band",
    DIRECT_REPORTS_BANDS
  );
  const indirectReportsBand = optEnum(
    formData,
    "indirect_reports_band",
    INDIRECT_REPORTS_BANDS
  );
  const educationRequirement = optEnum(
    formData,
    "education_requirement",
    EDUCATION_REQUIREMENTS
  );
  const industryExperience = optEnum(
    formData,
    "industry_experience",
    INDUSTRY_EXPERIENCES
  );

  // ── Optional free text ──
  const workModeDetail = optText(formData, "work_mode_detail");
  const travelTerritory = optText(formData, "travel_territory");
  const reportsTo = optText(formData, "reports_to");
  const bonusStructure = optText(formData, "bonus_structure");
  const equityNote = optText(formData, "equity_note");
  const requirements = String(formData.get("requirements") ?? "").trim();

  // ── remote_state_restrictions — repeated, trimmed, blanks dropped ──
  const remoteStateRestrictions = formData
    .getAll("remote_state_restrictions")
    .map((v) => String(v).trim().toUpperCase())
    .filter(Boolean);

  // ── Years of corporate experience — optional ints + range sanity ──
  const minYearsRaw = String(
    formData.get("min_years_corporate_experience") ?? ""
  ).trim();
  const maxYearsRaw = String(
    formData.get("max_years_corporate_experience") ?? ""
  ).trim();
  const minYearsCorporateExperience = minYearsRaw
    ? parseInt(minYearsRaw, 10)
    : null;
  const maxYearsCorporateExperience = maxYearsRaw
    ? parseInt(maxYearsRaw, 10)
    : null;
  if (
    minYearsCorporateExperience !== null &&
    Number.isNaN(minYearsCorporateExperience)
  ) {
    return { error: "Min years of experience must be a number." };
  }
  if (
    maxYearsCorporateExperience !== null &&
    Number.isNaN(maxYearsCorporateExperience)
  ) {
    return { error: "Max years of experience must be a number." };
  }
  if (
    minYearsCorporateExperience !== null &&
    minYearsCorporateExperience < 0
  ) {
    return { error: "Min years of experience can't be negative." };
  }
  if (
    maxYearsCorporateExperience !== null &&
    maxYearsCorporateExperience < 0
  ) {
    return { error: "Max years of experience can't be negative." };
  }
  // Fail-friendly on the range even though the DB has a CHECK too.
  if (
    minYearsCorporateExperience !== null &&
    maxYearsCorporateExperience !== null &&
    minYearsCorporateExperience > maxYearsCorporateExperience
  ) {
    return {
      error: "Min years of experience can't be greater than max.",
    };
  }

  // ── equity_offered checkbox + note ──
  const equityOffered = formData.get("equity_offered") === "on";

  // ── Compensation — same machinery as the practice wizard ──
  const compMinRaw = String(formData.get("compensation_min") ?? "").trim();
  const compMaxRaw = String(formData.get("compensation_max") ?? "").trim();
  const compPeriod = String(formData.get("compensation_period") ?? "").trim();
  const compTypeRaw = String(
    formData.get("compensation_type") ?? "range"
  ).trim();
  const compType: "range" | "starting_at" | "up_to" | "exact" | "doe" =
    ["range", "starting_at", "up_to", "exact", "doe"].includes(compTypeRaw)
      ? (compTypeRaw as "range" | "starting_at" | "up_to" | "exact" | "doe")
      : "range";
  const compVisible = formData.get("compensation_visible") === "on";
  const hideStagesFromCandidate =
    formData.get("hide_stages_from_candidate") === "on";

  const compMin = compMinRaw ? parseInt(compMinRaw, 10) : null;
  const compMax = compMaxRaw ? parseInt(compMaxRaw, 10) : null;
  if (compMin !== null && Number.isNaN(compMin)) {
    return { error: "Min compensation must be a number." };
  }
  if (compMax !== null && Number.isNaN(compMax)) {
    return { error: "Max compensation must be a number." };
  }

  // ── Anchor locations — OPTIONAL for corporate (no ≥1 enforcement) ──
  const locationIds = formData
    .getAll("location_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  // ── External links (shared helper) + Slice B sentinel ──
  const linksResult = parseExternalLinks(formData);
  if (!Array.isArray(linksResult)) {
    return { error: linksResult.error };
  }
  const externalLinks = linksResult;
  const externalLinksSubmitted =
    String(formData.get("external_links_submitted") ?? "") === "1";

  // ── Screening questions — JSON-encoded array (same shape as practice) ──
  const rawQuestions = String(
    formData.get("screening_questions") ?? ""
  ).trim();
  let screeningQuestions: ScreeningQuestionPayload[] = [];
  if (rawQuestions) {
    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(rawQuestions);
    } catch {
      return { error: "Couldn't parse screening questions payload." };
    }
    if (!Array.isArray(parsedRaw)) {
      return { error: "Screening questions payload must be an array." };
    }
    for (let i = 0; i < parsedRaw.length; i++) {
      const raw = parsedRaw[i] as Record<string, unknown>;
      const prompt = String(raw.prompt ?? "").trim();
      if (!prompt) return { error: `Question ${i + 1}: prompt is empty.` };
      const kind = String(raw.kind ?? "");
      if (!VALID_KINDS.has(kind as ScreeningQuestionPayload["kind"])) {
        return { error: `Question ${i + 1}: invalid kind "${kind}".` };
      }
      const required = Boolean(raw.required);
      const sortOrder =
        typeof raw.sort_order === "number" ? raw.sort_order : i;
      const helperText =
        raw.helper_text === null || raw.helper_text === undefined
          ? null
          : String(raw.helper_text).trim() || null;
      const id =
        raw.id === null || raw.id === undefined || raw.id === ""
          ? null
          : String(raw.id);

      let options: ScreeningQuestionPayload["options"] = null;
      if (kind === "single_select" || kind === "multi_select") {
        const rawOpts = raw.options;
        if (!Array.isArray(rawOpts) || rawOpts.length < 2) {
          return { error: `Question ${i + 1}: needs at least 2 options.` };
        }
        options = [];
        for (let j = 0; j < rawOpts.length; j++) {
          const o = rawOpts[j] as Record<string, unknown>;
          const optId = String(o.id ?? "").trim();
          const label = String(o.label ?? "").trim();
          if (!optId || !label) {
            return {
              error: `Question ${i + 1}: option ${j + 1} is incomplete.`,
            };
          }
          options.push({ id: optId, label });
        }
      }

      // E2.10 — knockout flag + correct-answer payload. Same validation
      // as the practice wizard; see validateKnockoutCorrectAnswer.
      const koFlag =
        Boolean(raw.knockout) &&
        (kind === "yes_no" ||
          kind === "single_select" ||
          kind === "multi_select" ||
          kind === "number");
      const koAnswer = koFlag
        ? validateKnockoutCorrectAnswer(
            raw.knockout_correct_answer,
            kind,
            options ?? null
          )
        : null;

      screeningQuestions.push({
        id,
        prompt,
        helper_text: helperText,
        kind: kind as ScreeningQuestionPayload["kind"],
        options,
        required,
        sort_order: sortOrder,
        knockout: koFlag && koAnswer !== null,
        knockout_correct_answer: koAnswer,
      });
    }
    // Re-number sort_order to match array order (defensive).
    screeningQuestions = screeningQuestions.map((q, idx) => ({
      ...q,
      sort_order: idx,
    }));
  }

  return {
    title,
    description,
    employmentType,
    status,
    corporateFunction,
    compMin,
    compMax,
    compPeriod: compPeriod || null,
    compType,
    compVisible,
    requirements,
    hideStagesFromCandidate,
    locationIds,
    externalLinks,
    externalLinksSubmitted,
    screeningQuestions,
    workMode,
    workModeDetail,
    remoteStateRestrictions,
    travelExpectation,
    travelTerritory,
    reportsTo,
    directReportsBand,
    indirectReportsBand,
    authorityLevel,
    educationRequirement,
    industryExperience,
    minYearsCorporateExperience,
    maxYearsCorporateExperience,
    bonusStructure,
    equityOffered,
    equityNote,
  };
}

/**
 * The full corporate-sandbox column payload, derived from a parsed input.
 * Centralized so create + update write the EXACT same 16 columns.
 */
function corporateSandboxColumns(parsed: ParsedCorporateJobInput) {
  return {
    work_mode: parsed.workMode,
    work_mode_detail: parsed.workModeDetail,
    remote_state_restrictions: parsed.remoteStateRestrictions,
    travel_expectation: parsed.travelExpectation,
    travel_territory: parsed.travelTerritory,
    reports_to: parsed.reportsTo,
    direct_reports_band: parsed.directReportsBand,
    indirect_reports_band: parsed.indirectReportsBand,
    authority_level: parsed.authorityLevel,
    education_requirement: parsed.educationRequirement,
    industry_experience: parsed.industryExperience,
    min_years_corporate_experience: parsed.minYearsCorporateExperience,
    max_years_corporate_experience: parsed.maxYearsCorporateExperience,
    bonus_structure: parsed.bonusStructure,
    equity_offered: parsed.equityOffered,
    equity_note: parsed.equityNote,
  };
}

/* ───── Create ───── */

export async function createCorporateJob(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const parsed = await parseCorporateJobInput(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = await createSupabaseServerClient();

  // Feature gate — block job creation behind an active subscription.
  const billingError = await requireActiveSubscriptionError(supabase, dsoId);
  if (billingError) return { ok: false, error: billingError };

  const baseSlug = makeSlug(parsed.title);
  if (!baseSlug) return { ok: false, error: "Couldn't generate a URL slug." };
  const slug = await resolveAvailableJobSlug(supabase, dsoId, baseSlug);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .eq("dso_id", dsoId)
    .maybeSingle();

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      dso_id: dsoId,
      title: parsed.title,
      slug,
      description: parsed.description,
      employment_type: parsed.employmentType,
      // Corporate jobs always carry role_category='other'; corporate_function
      // is the real categorization.
      role_category: "other",
      scope: "corporate",
      corporate_function: parsed.corporateFunction,
      compensation_min: parsed.compMin,
      compensation_max: parsed.compMax,
      compensation_period: parsed.compPeriod,
      compensation_type: parsed.compType,
      compensation_visible: parsed.compVisible,
      requirements: parsed.requirements || null,
      status: parsed.status,
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
      external_links: parsed.externalLinks,
      // 16-column corporate sandbox.
      ...corporateSandboxColumns(parsed),
      posted_at:
        parsed.status === "active" ? new Date().toISOString() : null,
      created_by: dsoUser?.id ?? null,
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return {
      ok: false,
      error:
        jobError?.message ??
        `Failed to create job. Refresh and try again, or email ${SUPPORT_EMAIL}.`,
    };
  }

  // Insert job_locations join rows — OPTIONAL for corporate (0/1/N).
  if (parsed.locationIds.length > 0) {
    const locationRows = parsed.locationIds.map((locId) => ({
      job_id: job.id as string,
      location_id: locId,
    }));
    await supabase.from("job_locations").insert(locationRows);
  }

  // Insert screening questions (create mode — all rows are new).
  if (parsed.screeningQuestions.length > 0) {
    const rows = parsed.screeningQuestions.map((q) => ({
      job_id: job.id as string,
      prompt: q.prompt,
      helper_text: q.helper_text,
      kind: q.kind,
      options: q.options,
      required: q.required,
      sort_order: q.sort_order,
      knockout: q.knockout ?? false,
      knockout_correct_answer: q.knockout_correct_answer ?? null,
    }));
    const { error: qError } = await supabase
      .from("job_screening_questions")
      .insert(rows);
    if (qError) {
      return {
        ok: false,
        error: `Job created, but couldn't save screening questions: ${qError.message}. Edit the job to retry.`,
      };
    }
  }

  // Audit log — must run BEFORE redirect (redirect() throws).
  await recordAuditEvent({
    dsoId,
    actorUserId: user.id,
    actorDsoUserId: dsoUser?.id ?? null,
    eventKind: "job.created",
    targetTable: "jobs",
    targetId: job.id as string,
    summary:
      parsed.status === "active"
        ? `Posted "${parsed.title}"`
        : `Drafted "${parsed.title}"`,
    metadata: {
      job_id: job.id,
      title: parsed.title,
      status: parsed.status,
      scope: "corporate",
      corporate_function: parsed.corporateFunction,
      authority_level: parsed.authorityLevel,
      work_mode: parsed.workMode,
      employment_type: parsed.employmentType,
      location_count: parsed.locationIds.length,
    },
  });

  redirect(`/employer/jobs/${job.id}`);
}

/* ───── Update ───── */

export async function updateCorporateJob(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) return { ok: false, error: "Missing job ID." };

  const parsed = await parseCorporateJobInput(formData);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = await createSupabaseServerClient();

  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      title: parsed.title,
      description: parsed.description,
      employment_type: parsed.employmentType,
      role_category: "other",
      scope: "corporate",
      corporate_function: parsed.corporateFunction,
      compensation_min: parsed.compMin,
      compensation_max: parsed.compMax,
      compensation_period: parsed.compPeriod,
      compensation_type: parsed.compType,
      compensation_visible: parsed.compVisible,
      requirements: parsed.requirements || null,
      status: parsed.status,
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
      // Sentinel-gated write (Slice B pattern) — only persist external_links
      // when the form explicitly opted in.
      ...(parsed.externalLinksSubmitted
        ? { external_links: parsed.externalLinks }
        : {}),
      // 16-column corporate sandbox.
      ...corporateSandboxColumns(parsed),
      posted_at:
        parsed.status === "active" ? new Date().toISOString() : null,
    })
    .eq("id", jobId)
    .eq("dso_id", dsoId);

  if (updateError) {
    return {
      ok: false,
      error: updateError.message ?? "Failed to update job.",
    };
  }

  // Replace job_locations — corporate anchors are 0/1/N.
  await supabase.from("job_locations").delete().eq("job_id", jobId);
  if (parsed.locationIds.length > 0) {
    await supabase.from("job_locations").insert(
      parsed.locationIds.map((locId) => ({
        job_id: jobId,
        location_id: locId,
      }))
    );
  }

  // Sync screening questions (same strategy as updateJob).
  await syncScreeningQuestions(supabase, jobId, parsed.screeningQuestions);

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/jobs/${jobId}/apply`);
  revalidatePath(`/employer/jobs/${jobId}`);

  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated "${parsed.title}"`,
    metadata: {
      job_id: jobId,
      title: parsed.title,
      status: parsed.status,
      scope: "corporate",
      section: "all",
    },
  });

  return { ok: true };
}

/**
 * Screening-question sync — mirrors the logic in updateJob / the practice
 * wizard's per-section save. Kept as a local helper so updateCorporateJob
 * and updateCorporateJobDetailsSection don't duplicate it. Returns a
 * JobActionState error string when a question write fails; null on success.
 */
async function syncScreeningQuestions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  jobId: string,
  screening: ScreeningQuestionPayload[]
): Promise<{ error: string } | null> {
  const incomingIds = new Set(
    screening.map((q) => q.id).filter((id): id is string => id !== null)
  );

  // 1. Delete questions whose id is NOT in the incoming set.
  if (incomingIds.size > 0) {
    await supabase
      .from("job_screening_questions")
      .delete()
      .eq("job_id", jobId)
      .not(
        "id",
        "in",
        `(${[...incomingIds].map((id) => `"${id}"`).join(",")})`
      );
  } else {
    await supabase
      .from("job_screening_questions")
      .delete()
      .eq("job_id", jobId);
  }

  // 2. Update existing rows.
  for (const q of screening) {
    if (q.id) {
      const { error: updateQErr } = await supabase
        .from("job_screening_questions")
        .update({
          prompt: q.prompt,
          helper_text: q.helper_text,
          kind: q.kind,
          options: q.options,
          required: q.required,
          sort_order: q.sort_order,
          knockout: q.knockout ?? false,
          knockout_correct_answer: q.knockout_correct_answer ?? null,
        })
        .eq("id", q.id)
        .eq("job_id", jobId);
      if (updateQErr) {
        return {
          error: `Couldn't update screening question: ${updateQErr.message}`,
        };
      }
    }
  }

  // 3. Insert new rows.
  const newRows = screening
    .filter((q) => !q.id)
    .map((q) => ({
      job_id: jobId,
      prompt: q.prompt,
      helper_text: q.helper_text,
      kind: q.kind,
      options: q.options,
      required: q.required,
      sort_order: q.sort_order,
      knockout: q.knockout ?? false,
      knockout_correct_answer: q.knockout_correct_answer ?? null,
    }));
  if (newRows.length > 0) {
    const { error: insertQErr } = await supabase
      .from("job_screening_questions")
      .insert(newRows);
    if (insertQErr) {
      return {
        error: `Couldn't add new screening question: ${insertQErr.message}`,
      };
    }
  }

  return null;
}

/* ───── Per-section saves (parallel sectioned edit page) ───── */

/**
 * Update the corporate Basics section: title, employment_type,
 * corporate_function, authority_level, work_mode (+ work_mode_detail),
 * and anchor job_locations (replace; 0/1/N valid). Slug is left as-is on
 * edit. role_category + scope are pinned to 'other' / 'corporate'.
 *
 * The Description section is scope-agnostic — the corporate edit page
 * reuses the existing updateJobDescriptionSection from ./actions.ts.
 */
export async function updateCorporateJobBasicsSection(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  if (!jobId || !dsoId) return { ok: false, error: "Missing job or DSO." };

  const title = String(formData.get("title") ?? "").trim();
  const employmentType = String(
    formData.get("employment_type") ?? "full_time"
  );
  if (!title) return { ok: false, error: "Job title is required." };
  if (title.length > 200) {
    return { ok: false, error: "Job title is too long." };
  }

  // Required: corporate_function.
  const rawCorpFn = String(formData.get("corporate_function") ?? "").trim();
  if (!rawCorpFn) {
    return { ok: false, error: "Pick a corporate function for this role." };
  }
  if (!VALID_CORPORATE_FUNCTION_SLUGS.has(rawCorpFn)) {
    return { ok: false, error: "That corporate function isn't recognized." };
  }

  // Required: authority_level.
  const rawAuthority = String(formData.get("authority_level") ?? "").trim();
  if (!rawAuthority || !isValidFieldValue(AUTHORITY_LEVELS, rawAuthority)) {
    return { ok: false, error: "Pick an authority level for this role." };
  }

  // Required: work_mode.
  const rawWorkMode = String(formData.get("work_mode") ?? "").trim();
  if (!rawWorkMode || !isValidFieldValue(WORK_MODES, rawWorkMode)) {
    return { ok: false, error: "Pick a work mode for this role." };
  }
  const workModeDetail = optText(formData, "work_mode_detail");

  const locationIds = formData
    .getAll("location_ids")
    .map((v) => String(v).trim())
    .filter(Boolean);

  const supabase = await createSupabaseServerClient();

  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      title,
      employment_type: employmentType,
      role_category: "other",
      scope: "corporate",
      corporate_function: rawCorpFn,
      authority_level: rawAuthority,
      work_mode: rawWorkMode,
      work_mode_detail: workModeDetail,
    })
    .eq("id", jobId)
    .eq("dso_id", dsoId);
  if (updateError) return { ok: false, error: updateError.message };

  // Replace anchor locations — 0/1/N all valid for corporate.
  await supabase.from("job_locations").delete().eq("job_id", jobId);
  if (locationIds.length > 0) {
    await supabase
      .from("job_locations")
      .insert(
        locationIds.map((locId) => ({ job_id: jobId, location_id: locId }))
      );
  }

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}/edit`);

  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated basics on "${title}"`,
    metadata: {
      job_id: jobId,
      title,
      scope: "corporate",
      section: "basics",
    },
  });

  return { ok: true };
}

/**
 * Update the corporate Details section: the rest of the 16-column sandbox
 * (travel, reporting structure, education, industry experience, years
 * range, bonus/equity), plus compensation (range/period/type/visible),
 * requirements, and the hide-stages toggle. Mirrors updateJobDetailsSection
 * but for the corporate field set.
 *
 * Reuses parseCorporateJobInput for the validation — but the per-section
 * form does NOT submit title/description/corporate_function/authority_level/
 * work_mode, so this action injects placeholder values for those required
 * fields before parsing, then discards them (only the details-section
 * columns are written). That keeps ALL the corporate validation logic in
 * ONE function rather than re-implementing the years-range + enum checks.
 */
export async function updateCorporateJobDetailsSection(
  _prev: JobActionState,
  formData: FormData
): Promise<JobActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  if (!jobId || !dsoId) return { ok: false, error: "Missing job or DSO." };

  // The details section form omits the Basics-section required fields.
  // Inject sentinels so parseCorporateJobInput's required-field guards
  // pass; we never write these placeholder values back to the row.
  const proxy = new FormData();
  for (const [k, v] of formData.entries()) proxy.append(k, v);
  if (!String(proxy.get("title") ?? "").trim()) {
    proxy.set("title", "section-save-placeholder");
  }
  if (!String(proxy.get("description") ?? "").trim()) {
    proxy.set("description", "<p>placeholder</p>");
  }
  if (!String(proxy.get("corporate_function") ?? "").trim()) {
    proxy.set("corporate_function", CORPORATE_FUNCTION_SLUGS[0]);
  }
  if (!String(proxy.get("authority_level") ?? "").trim()) {
    proxy.set("authority_level", AUTHORITY_LEVELS[0].value);
  }
  if (!String(proxy.get("work_mode") ?? "").trim()) {
    proxy.set("work_mode", WORK_MODES[0].value);
  }

  const parsed = await parseCorporateJobInput(proxy);
  if ("error" in parsed) return { ok: false, error: parsed.error };

  const supabase = await createSupabaseServerClient();

  const { error: updateError } = await supabase
    .from("jobs")
    .update({
      compensation_min: parsed.compMin,
      compensation_max: parsed.compMax,
      compensation_period: parsed.compPeriod,
      compensation_type: parsed.compType,
      compensation_visible: parsed.compVisible,
      requirements: parsed.requirements || null,
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
      // Sentinel-gated external_links write.
      ...(parsed.externalLinksSubmitted
        ? { external_links: parsed.externalLinks }
        : {}),
      // Details-section corporate columns. work_mode + work_mode_detail
      // belong to the Basics section and are NOT written here, so we
      // override them out of the sandbox column set.
      remote_state_restrictions: parsed.remoteStateRestrictions,
      travel_expectation: parsed.travelExpectation,
      travel_territory: parsed.travelTerritory,
      reports_to: parsed.reportsTo,
      direct_reports_band: parsed.directReportsBand,
      indirect_reports_band: parsed.indirectReportsBand,
      education_requirement: parsed.educationRequirement,
      industry_experience: parsed.industryExperience,
      min_years_corporate_experience: parsed.minYearsCorporateExperience,
      max_years_corporate_experience: parsed.maxYearsCorporateExperience,
      bonus_structure: parsed.bonusStructure,
      equity_offered: parsed.equityOffered,
      equity_note: parsed.equityNote,
    })
    .eq("id", jobId)
    .eq("dso_id", dsoId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}/edit`);

  void emitJobAuditEvent(supabase, dsoId, jobId, {
    eventKind: "job.updated",
    summary: `Updated compensation & details`,
    metadata: {
      job_id: jobId,
      scope: "corporate",
      section: "details",
      compensation_visible: parsed.compVisible,
      hide_stages_from_candidate: parsed.hideStagesFromCandidate,
    },
  });

  return { ok: true };
}
