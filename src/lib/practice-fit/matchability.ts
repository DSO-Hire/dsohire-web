/**
 * Job-posting Matchability (Lane 6 — Job Studio, Model 05).
 *
 * "How many PracticeFit dimensions does this posting give the engine to
 * work with — and exactly which field buys the next one?"
 *
 * Pure + client-safe: a live function over wizard fields, recomputed per
 * keystroke. The enumeration mirrors the ENGINE's documented exclusion
 * rules (lib/practice-fit/types.ts JobFitInputs + DsoFitInputs comments)
 * and uses the engine's own free-text detectors (./job-text-signals) so
 * the meter can never claim a dimension the engine wouldn't score.
 *
 * Honesty notes:
 *   • "Scoreable" means the POSTING side provides the signal. Whether a
 *     given candidate scores on it still depends on their side — the
 *     meter copy says "gives PracticeFit X dimensions to work with",
 *     never "will score X".
 *   • Specialty is legitimately empty for admin/front-desk roles — the
 *     hint says so instead of nagging.
 *   • Practice-profile dimensions live on Settings → Profile, not in
 *     the wizard; practice_feel derives from location count even with a
 *     blank profile, so it's always-on (engine rule).
 */

import { detectJobPms, detectJobCerts } from "./job-text-signals";
import { isPercentModel, type CompModel } from "@/lib/comp/model";

export type MatchabilityStep =
  | "basics"
  | "details"
  | "description"
  | "profile"
  | "always";

export interface MatchabilityDim {
  key: string;
  label: string;
  scoreable: boolean;
  /** For missing dims — the exact field that unlocks it. */
  hint?: string;
  /** Which wizard step (or the practice profile) owns the unlock. */
  where: MatchabilityStep;
}

export interface MatchabilityProfileFlags {
  practice_pace: boolean;
  autonomy_level: boolean;
  mentorship_offered: boolean;
  ce_support: boolean;
  work_life_balance: boolean;
  patient_populations: boolean;
}

export interface ClinicalMatchabilityInput {
  title: string;
  /** Tiptap HTML is fine — the detectors regex over raw text. */
  description: string;
  requirements: string;
  compType: string;
  compMin: string;
  compMax: string;
  /** #128 — structured comp model. For percentage models the Pay dim
   * lights off the est. annual range (the only comp fact the engine
   * scores), not the legacy min/max. Omit/"simple" = legacy behavior. */
  compModel?: string;
  estAnnualMin?: string;
  estAnnualMax?: string;
  skills: string[];
  specialty: string[];
  minYearsExperience: string;
  benefits: string[];
  scheduleDays: string[];
  /** From the dsos row; omit entirely when the caller didn't load it —
   * profile dims then render as missing with the settings pointer. */
  profile?: MatchabilityProfileFlags;
}

export interface MatchabilityResult {
  dims: MatchabilityDim[];
  scoreable: number;
  total: number;
}

export function computeClinicalMatchability(
  input: ClinicalMatchabilityInput
): MatchabilityResult {
  const pmsFound =
    detectJobPms(input.title, input.requirements, input.description).length >
    0;
  const certsFound =
    detectJobCerts(input.title, input.requirements, input.description)
      .length > 0;
  // #128 — percentage models score Pay off the est. annual range
  // (engine rule: percentages are never scored); simple models keep
  // the legacy compType/min/max gate.
  const percentModel = isPercentModel(
    (input.compModel ?? "simple") as CompModel
  );
  const compOk = percentModel
    ? (input.estAnnualMin ?? "").trim() !== "" ||
      (input.estAnnualMax ?? "").trim() !== ""
    : input.compType !== "doe" &&
      (input.compMin.trim() !== "" || input.compMax.trim() !== "");
  const compHint = percentModel
    ? "Add the est. annual range — it's what makes a percentage deal comparable (and required to post in some states)"
    : 'Add a pay range — "discussed at offer" hides this dimension';
  const p = input.profile;

  const dims: MatchabilityDim[] = [
    // ── Always-on (the wizard requires these to publish) ──
    { key: "role_fit", label: "Role", scoreable: true, where: "always" },
    { key: "location", label: "Location", scoreable: true, where: "always" },
    {
      key: "license_state",
      label: "License state",
      scoreable: true,
      where: "always",
    },
    {
      key: "employment_type",
      label: "Employment type",
      scoreable: true,
      where: "always",
    },
    { key: "dso_size", label: "Org size", scoreable: true, where: "always" },
    {
      key: "practice_feel",
      label: "Practice feel",
      scoreable: true,
      where: "always",
    },

    // ── Unlocked by posting fields ──
    {
      key: "compensation",
      label: "Pay",
      scoreable: compOk,
      hint: compHint,
      where: "details",
    },
    {
      key: "skills",
      label: "Skills",
      scoreable: input.skills.length > 0,
      hint: "Add the skills the role needs",
      where: "details",
    },
    {
      key: "specialty",
      label: "Specialty",
      scoreable: input.specialty.length > 0,
      hint: "Pick a specialty (leaving it empty is right for admin roles)",
      where: "details",
    },
    {
      key: "years_experience",
      label: "Experience",
      scoreable: input.minYearsExperience.trim() !== "",
      hint: "Set a minimum years-of-experience",
      where: "details",
    },
    {
      key: "benefits",
      label: "Benefits",
      scoreable: input.benefits.length > 0,
      hint: "List the benefits you offer",
      where: "details",
    },
    {
      key: "schedule_overlap",
      label: "Schedule",
      scoreable: input.scheduleDays.length > 0,
      hint: "Pick the working days",
      where: "details",
    },
    {
      key: "pms_fluency",
      label: "PMS",
      scoreable: pmsFound,
      hint: "Name your practice-management system (e.g. Dentrix) in the posting text",
      where: "description",
    },
    {
      key: "certifications",
      label: "Certifications",
      scoreable: certsFound,
      hint: "Call out required certs (CPR/BLS, radiology…) in the posting text",
      where: "description",
    },

    // ── Unlocked by the practice profile (Settings → Profile) ──
    {
      key: "work_pace",
      label: "Pace",
      scoreable: p?.practice_pace ?? false,
      hint: "Practice profile — how your practice works",
      where: "profile",
    },
    {
      key: "autonomy",
      label: "Autonomy",
      scoreable: p?.autonomy_level ?? false,
      hint: "Practice profile — autonomy style",
      where: "profile",
    },
    {
      key: "mentorship",
      label: "Mentorship",
      scoreable: p?.mentorship_offered ?? false,
      hint: "Practice profile — mentorship offered",
      where: "profile",
    },
    {
      key: "ce_growth",
      label: "CE & growth",
      scoreable: p?.ce_support ?? false,
      hint: "Practice profile — CE support",
      where: "profile",
    },
    {
      key: "work_life",
      label: "Work-life",
      scoreable: p?.work_life_balance ?? false,
      hint: "Practice profile — schedule predictability",
      where: "profile",
    },
    {
      key: "patient_population",
      label: "Patient mix",
      scoreable: p?.patient_populations ?? false,
      hint: "Practice profile — patient populations you serve",
      where: "profile",
    },
  ];

  return {
    dims,
    scoreable: dims.filter((d) => d.scoreable).length,
    total: dims.length,
  };
}

/* ──────────────────────────────────────────────────────────────
 * Corporate (DSOFit) matchability — mirrors the engine's corporate
 * signal mapping in get-or-compute.ts:
 *   seniority_target  ← authority_level (set ⇒ scoreable)
 *   org_scale_need    ← DSO location count (always derivable)
 *   domain_preference ← explicit OR derived from industry_experience
 *   leadership_required ← reports bands / authority level
 *   work_mode / travel_required ← their wizard fields
 * plus the shared posting facts (function, comp, years, benefits).
 * ─────────────────────────────────────────────────────────── */

export interface CorporateMatchabilityInput {
  corporateFunction: string;
  /** The DSO's location count — mapOrgScaleNeed returns null (dim
   * excluded) for single-location orgs. */
  locationCount: number;
  authorityLevel: string;
  industryExperience: string;
  directReportsBand: string;
  indirectReportsBand: string;
  workMode: string;
  travelExpectation: string;
  compType: string;
  compMin: string;
  compMax: string;
  minYears: string;
  benefits: string[];
}

export function computeCorporateMatchability(
  input: CorporateMatchabilityInput
): MatchabilityResult {
  const compOk =
    input.compType !== "doe" &&
    (input.compMin.trim() !== "" || input.compMax.trim() !== "");
  // Mirrors mapLeadershipRequired (get-or-compute.ts): any reports band
  // OR a vp/svp/c_suite authority resolves the dim (incl. "none" for
  // explicit zero-report ICs — that's still a scoreable signal).
  const leadershipOk =
    input.directReportsBand.trim() !== "" ||
    input.indirectReportsBand.trim() !== "" ||
    ["vp", "svp", "c_suite"].includes(input.authorityLevel);

  const dims: MatchabilityDim[] = [
    {
      key: "function_fit",
      label: "Function",
      scoreable: input.corporateFunction.trim() !== "",
      hint: "Pick the corporate function",
      where: "basics",
    },
    {
      key: "org_scale",
      label: "Org scale",
      scoreable: input.locationCount > 1,
      hint: "Applies once your organization has multiple locations",
      where: "always",
    },
    {
      key: "seniority",
      label: "Seniority",
      scoreable: input.authorityLevel.trim() !== "",
      hint: "Set the role's authority level",
      where: "details",
    },
    {
      key: "domain_fit",
      label: "Domain",
      scoreable: input.industryExperience.trim() !== "",
      hint: "Set the industry-experience expectation (dental / healthcare / open)",
      where: "details",
    },
    {
      key: "leadership_scope",
      label: "Leadership",
      scoreable: leadershipOk,
      hint: "Set direct/indirect reports (skip for IC roles — that's correct)",
      where: "details",
    },
    {
      key: "work_mode",
      label: "Work mode",
      scoreable: input.workMode.trim() !== "",
      hint: "Pick onsite / hybrid / remote",
      where: "details",
    },
    {
      key: "travel",
      label: "Travel",
      scoreable: input.travelExpectation.trim() !== "",
      hint: "Set the travel expectation",
      where: "details",
    },
    {
      key: "compensation",
      label: "Pay",
      scoreable: compOk,
      hint: 'Add a pay range — "discussed at offer" hides this dimension',
      where: "details",
    },
    {
      key: "years_experience",
      label: "Experience",
      scoreable: input.minYears.trim() !== "",
      hint: "Set minimum years of corporate experience",
      where: "details",
    },
    {
      key: "benefits",
      label: "Benefits",
      scoreable: input.benefits.length > 0,
      hint: "List the benefits you offer",
      where: "details",
    },
  ];

  return {
    dims,
    scoreable: dims.filter((d) => d.scoreable).length,
    total: dims.length,
  };
}
