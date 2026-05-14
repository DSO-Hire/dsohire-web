/**
 * Corporate job sandbox field enums (5G.d, 2026-05-14).
 *
 * The single canonical TS source for the six closed-enum corporate job
 * fields added by migration 20260514000001_jobs_corporate_sandbox. The DB
 * CHECK constraints on public.jobs mirror these exact value sets — if a
 * value is added or renamed here, update the migration's CHECK too (and
 * ship a new migration; never edit an applied one).
 *
 * Consumed by:
 *   • the corporate wizard at /employer/jobs/new/corporate
 *   • the parallel sectioned edit page
 *   • the corporate job create/update server actions
 *   • the public job page + /corporate-roles/[function] cards
 *
 * Pattern mirrors src/lib/corporate/functions.ts: `as const` option tuples,
 * derived union types, and label lookups — no enums, no magic strings.
 */

/** One selectable option: the stored `value` + its human `label`. */
export interface FieldOption<V extends string = string> {
  value: V;
  label: string;
  /** Optional helper text for radio-card UIs. */
  hint?: string;
}

/* ── Work mode (required by the corporate wizard) ───────────────────────── */

export const WORK_MODES = [
  { value: "onsite", label: "On-site", hint: "In a practice or corporate office full time." },
  { value: "remote", label: "Remote", hint: "Fully remote; optionally restricted by state." },
  { value: "hybrid", label: "Hybrid", hint: "A set split of office and remote days." },
  { value: "blended", label: "Blended", hint: "Mix of travel, office, and remote — no fixed split." },
] as const;
export type WorkMode = (typeof WORK_MODES)[number]["value"];

/* ── Travel expectation ─────────────────────────────────────────────────── */

export const TRAVEL_EXPECTATIONS = [
  { value: "none", label: "None" },
  { value: "under_10", label: "Under 10%" },
  { value: "10_to_25", label: "10–25%" },
  { value: "25_to_50", label: "25–50%" },
  { value: "50_plus", label: "50%+" },
] as const;
export type TravelExpectation = (typeof TRAVEL_EXPECTATIONS)[number]["value"];

/* ── Reporting structure: direct + indirect report bands ────────────────── */

export const DIRECT_REPORTS_BANDS = [
  { value: "zero", label: "0" },
  { value: "1_3", label: "1–3" },
  { value: "4_9", label: "4–9" },
  { value: "10_plus", label: "10+" },
] as const;
export type DirectReportsBand = (typeof DIRECT_REPORTS_BANDS)[number]["value"];

export const INDIRECT_REPORTS_BANDS = [
  { value: "zero", label: "0" },
  { value: "1_9", label: "1–9" },
  { value: "10_49", label: "10–49" },
  { value: "50_plus", label: "50+" },
] as const;
export type IndirectReportsBand = (typeof INDIRECT_REPORTS_BANDS)[number]["value"];

/* ── Authority level (required by the corporate wizard) ─────────────────── */

export const AUTHORITY_LEVELS = [
  { value: "ic", label: "Individual Contributor" },
  { value: "manager", label: "Manager" },
  { value: "senior_manager", label: "Senior Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP" },
  { value: "svp", label: "SVP" },
  { value: "c_suite", label: "C-Suite" },
] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number]["value"];

/* ── Education requirement ──────────────────────────────────────────────── */

export const EDUCATION_REQUIREMENTS = [
  { value: "hs", label: "High school" },
  { value: "ba_bs", label: "Bachelor's" },
  { value: "ma_ms", label: "Master's" },
  { value: "mba", label: "MBA" },
  { value: "jd", label: "JD" },
  { value: "dds_dmd", label: "DDS / DMD" },
  { value: "phd", label: "PhD" },
  { value: "certification_only", label: "Certification only" },
  { value: "none", label: "None specified" },
] as const;
export type EducationRequirement = (typeof EDUCATION_REQUIREMENTS)[number]["value"];

/* ── Industry experience (the dental-vertical moat) ─────────────────────── */

export const INDUSTRY_EXPERIENCES = [
  {
    value: "dso_required",
    label: "DSO experience required",
    hint: "Candidate must have prior DSO / multi-practice experience.",
  },
  {
    value: "healthcare_adjacent",
    label: "Healthcare-adjacent acceptable",
    hint: "DSO experience preferred; broader healthcare experience considered.",
  },
  {
    value: "agnostic",
    label: "Industry-agnostic",
    hint: "Open to strong candidates from any industry.",
  },
] as const;
export type IndustryExperience = (typeof INDUSTRY_EXPERIENCES)[number]["value"];

/* ── Lookup helpers ─────────────────────────────────────────────────────── */

function labelMap<V extends string>(
  options: ReadonlyArray<FieldOption<V>>
): Record<V, string> {
  return options.reduce(
    (acc, o) => {
      acc[o.value] = o.label;
      return acc;
    },
    {} as Record<V, string>
  );
}

export const WORK_MODE_LABELS = labelMap(WORK_MODES);
export const TRAVEL_EXPECTATION_LABELS = labelMap(TRAVEL_EXPECTATIONS);
export const DIRECT_REPORTS_BAND_LABELS = labelMap(DIRECT_REPORTS_BANDS);
export const INDIRECT_REPORTS_BAND_LABELS = labelMap(INDIRECT_REPORTS_BANDS);
export const AUTHORITY_LEVEL_LABELS = labelMap(AUTHORITY_LEVELS);
export const EDUCATION_REQUIREMENT_LABELS = labelMap(EDUCATION_REQUIREMENTS);
export const INDUSTRY_EXPERIENCE_LABELS = labelMap(INDUSTRY_EXPERIENCES);

/** Runtime guard: is `v` a valid value for the given option set? */
export function isValidFieldValue<V extends string>(
  options: ReadonlyArray<FieldOption<V>>,
  v: unknown
): v is V {
  return typeof v === "string" && options.some((o) => o.value === v);
}

/**
 * The full corporate sandbox shape — every field nullable, matching the
 * migration (all columns nullable / defaulted; clinical jobs leave them null).
 * `equity_offered` carries a DB default of false.
 */
export interface CorporateJobFields {
  work_mode: WorkMode | null;
  work_mode_detail: string | null;
  remote_state_restrictions: string[];
  travel_expectation: TravelExpectation | null;
  travel_territory: string | null;
  reports_to: string | null;
  direct_reports_band: DirectReportsBand | null;
  indirect_reports_band: IndirectReportsBand | null;
  authority_level: AuthorityLevel | null;
  education_requirement: EducationRequirement | null;
  industry_experience: IndustryExperience | null;
  min_years_corporate_experience: number | null;
  max_years_corporate_experience: number | null;
  bonus_structure: string | null;
  equity_offered: boolean;
  equity_note: string | null;
}
