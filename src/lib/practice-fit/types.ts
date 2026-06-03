/**
 * Practice Fit shape definitions (Phase 5D v1.1).
 *
 * v1.1 architecture changes vs v0:
 *   • `role` is no longer a dimension — it's a HARD FILTER. Pairs with
 *     a role mismatch produce no FitResult at all.
 *   • Each scored dimension carries a `scored: boolean`. Dimensions
 *     where the data is missing on either side are still emitted (so
 *     the UI can show "Add X to factor this in"), but they're excluded
 *     from the score's denominator.
 *   • Final score is sum(scored contributions) / sum(scored weights) × 100.
 *     A pair with all dims scored hits the same score it would in v0;
 *     a pair with 2 missing dims is scored only on the 5 it can see,
 *     so missing data doesn't drag the score down — it just narrows
 *     the confidence.
 *   • Two new dimensions added: `specialty` (15) and `years_experience`
 *     (10). v0's role weight (25) is reallocated to these two.
 */

export type FitBucket = "excellent" | "strong" | "solid" | "light" | "low";

export type FitDimensionKey =
  | "role_fit"
  | "compensation"
  | "location"
  | "specialty"
  | "skills"
  | "years_experience"
  | "employment_type"
  | "dso_size"
  | "schedule_overlap";

export interface FitDimension {
  /** Maximum points this dimension can contribute when scored (0 when excluded). */
  weight: number;
  /** Raw fit on this dimension, 0-100. 0 when not scored. */
  raw: number;
  /** weight * raw / 100 — what this dimension contributed to the final score. */
  contribution: number;
  /**
   * False when one side has no data for this dimension. Excluded
   * dimensions are NOT counted toward the score's denominator —
   * they surface in the UI as "Add X to factor this in" rows but
   * don't drag the number down.
   */
  scored: boolean;
  /** Short label for the dimension (rendered in WhyThisMatch). */
  label: string;
  /**
   * Candidate-voice detail. Reads as "you" / "your" — used on candidate
   * surfaces. For SCORED dims this is the same as the employer voice;
   * for UNSCORED dims it's the action prompt ("You haven't set a
   * minimum salary — add one to factor compensation into your match.").
   */
  detail: string;
  /**
   * Employer-voice detail. Reads in third person — used on employer
   * surfaces (kanban / applications detail). v1.3: was missing in v1.1,
   * which left employers reading candidate-voice prose ("You haven't
   * set..."). Same content as `detail` for scored dims.
   */
  detail_employer: string;
  /**
   * Optional profile/job-link CTA shown next to excluded rows on the
   * candidate side. `cta_href` is the profile section link; `cta_label`
   * is the button text. Both null on scored rows AND on dims with an
   * inline editor (cta_inline=true) — the inline form replaces the link.
   */
  cta_href: string | null;
  cta_label: string | null;
  /**
   * v1.3 — when true, the WhyThisMatch UI renders an inline mini-editor
   * for this dim instead of a link out to the profile. Only the simple
   * single-value dims (compensation, years, employment type, DSO size)
   * set this; multi-selects stay link-out for now.
   */
  cta_inline: boolean;
}

export interface FitResult {
  /** 0-100 normalized over scored dimensions only. */
  score: number;
  bucket: FitBucket;
  dimensions: Record<FitDimensionKey, FitDimension>;
  /** Top 3 SCORED dimensions by contribution desc — drives the highlights row. */
  top_factors: FitDimensionKey[];
  /**
   * Coverage = sum of scored weights / sum of total weights. The UI
   * uses this to render "Solid fit · 6 of 7 dims" so readers know
   * when the score is based on partial data.
   */
  coverage: {
    scored_weight: number;
    total_weight: number;
    scored_count: number;
    total_count: number;
  };
  /** SHA-256 hex of the canonical input snapshot. */
  input_hash: string;
}

/* ──────────────────────────────────────────────────────────────
 * Inputs to the compute function.
 *
 * Kept narrow on purpose — only the fields actually consumed by the
 * scoring math. Callers project from the larger candidates / jobs /
 * dso rows into these shapes before calling computePracticeFit().
 * ─────────────────────────────────────────────────────────── */

export interface CandidateFitInputs {
  desired_roles: string[];
  /**
   * v2 (Phase A.1) — resume-derived current job title, free text. Used as
   * the role signal when `desired_roles` is empty so "open to anything"
   * candidates are still gated against their actual role (kills the
   * Front-Desk-shows-fit-for-CLO bug). Null when not parsed.
   */
  current_title: string | null;
  desired_specialty: string[];
  license_states: string[];
  desired_locations: string[];
  skills: string[];
  schedule_preferences: {
    mon?: boolean;
    tue?: boolean;
    wed?: boolean;
    thu?: boolean;
    fri?: boolean;
    sat?: boolean;
    sun?: boolean;
    evenings?: boolean;
    willing_to_relocate?: boolean;
  };
  min_salary: number | null;
  salary_unit: "hourly" | "yearly" | "per_visit" | "per_day" | null;
  temp_or_perm: "temp" | "perm" | "either" | null;
  dso_size_preference: "small" | "mid" | "large" | "any" | null;
  /**
   * v1.1 — used by the years_experience dimension. Null means "not
   * provided," which excludes that dim from the score (rather than
   * penalizing).
   */
  years_experience_dental: number | null;
}

export interface JobFitInputs {
  /**
   * v1.1 — role is a HARD FILTER. computePracticeFit returns null
   * when candidate has non-empty `desired_roles` and this category
   * is not in that list.
   */
  role_category: string;
  employment_type: string;
  /**
   * v1.8 — the comp shape the employer chose. Drives whether the
   * Practice Fit comp dim is excluded (doe) or comparable (others).
   */
  compensation_type:
    | "range"
    | "starting_at"
    | "up_to"
    | "exact"
    | "doe";
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: "hourly" | "yearly" | "per_visit" | "per_day" | null;
  /** From job_locations join — { state }, may have multiple. */
  locations: Array<{ state: string | null; city: string | null }>;
  /** From job_skills join. v1 schema doesn't distinguish required vs preferred. */
  skills: string[];
  /**
   * v1.1 — multi-select against the SPECIALTIES canonical list. Empty
   * array means "specialty-agnostic" (admin / front-desk roles); the
   * specialty dim is excluded for those.
   */
  specialty: string[];
  /** v1.1 — null means "no minimum experience requirement"; the dim is excluded. */
  min_years_experience: number | null;
  /**
   * Track F (2026-05-12) — days the job is staffed. Subset of
   * ['mon','tue','wed','thu','fri','sat','sun']. Empty array means
   * "not specified" → schedule_overlap dim excluded from the score.
   */
  schedule_days: string[];
  /** Track F — true if the role works evenings (≥ 5pm). */
  schedule_evenings: boolean;
  /** Track F — true if the role includes Sat/Sun. Sometimes set
   *  independently of schedule_days when the employer only flags it. */
  schedule_weekends: boolean;
}

export interface DsoFitInputs {
  /** Total practice / location count for the DSO. Drives the DSO-size dimension. */
  location_count: number;
}

export interface FitInputs {
  candidate: CandidateFitInputs;
  job: JobFitInputs;
  dso: DsoFitInputs;
}
