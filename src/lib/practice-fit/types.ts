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
  | "pms_fluency"
  | "license_state"
  | "certifications"
  | "specialty"
  | "skills"
  | "years_experience"
  | "employment_type"
  | "dso_size"
  | "schedule_overlap"
  // v3 Phase B.1 — culture / work-style dims. Each scores a candidate
  // assessment signal against the practice profile (or, for practice_feel,
  // the practice size when the profile is blank). All stay UNSCORED until
  // both sides have data — never a penalty.
  | "work_pace"
  | "autonomy"
  | "mentorship"
  | "ce_growth"
  | "practice_feel"
  | "work_life"
  // v3.1 Phase B.5 (2026-06-05) — benefits coverage. Scores the candidate's
  // ranked "benefits that matter most" against the benefits the JOB lists
  // (existing structured data — no employer profile needed). Unscored until
  // the candidate has priorities AND the job lists benefits; never a penalty.
  | "benefits"
  // v3.1 (2026-06-05) — patient-population fit. The candidate picks who they
  // most enjoy caring for; the practice picks the populations it serves
  // (employer practice profile). Unscored until both sides have data; the
  // candidate's "I enjoy all populations" answer is a no-penalty no-signal.
  | "patient_population"
  // #52 DSOFit corporate dims (corporate-track only; per-function weighted).
  | "seniority"
  | "org_scale"
  | "domain_fit"
  | "leadership_scope"
  | "work_mode";

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
  /**
   * False when this dimension doesn't APPLY to the job's track (e.g. a
   * clinical dim on a corporate req). Distinct from `scored` (which is
   * false for applicable-but-empty gaps). Non-applicable dims drop from
   * the coverage denominator on BOTH the fresh-compute and cache-read
   * paths. Optional for back-compat with rows stored before this field
   * existed (treated as applicable); a MODEL_VERSION bump repopulates it.
   */
  applicable?: boolean;
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

/**
 * v2 (Phase A.4) — a post-normalization adjustment to the score.
 *   • "cap"   — a deal-breaker (e.g. wrong-state clinical license) ceilings
 *     the overall score regardless of how strong the rest is. `value` is the
 *     max score it imposes. Informational only — never auto-screens.
 *   • "boost" — the marquee dental signals all line up, so a genuinely great
 *     match is allowed to break 90. `value` is the points added (ceilinged).
 * Derived deterministically from the dimensions, so cache hits reconstruct
 * the same reasons without re-applying to the number.
 */
export interface FitAdjustment {
  kind: "cap" | "boost";
  dimension: FitDimensionKey | null;
  value: number;
  reason: string;
}

export interface FitResult {
  /** 0-100, normalized over scored dimensions then capped/boosted (A.4). */
  score: number;
  bucket: FitBucket;
  /**
   * #49/DSOFit — which fit product this score belongs to, driving the chip's
   * color ramp (navy PracticeFit vs heritage DSOFit). Derived from the job's
   * track (corporate → "dsofit", else "practicefit"). Optional for back-compat;
   * consumers default to "practicefit".
   */
  product?: "practicefit" | "dsofit";
  dimensions: Record<FitDimensionKey, FitDimension>;
  /** Caps/boosters applied to the score, for transparent display. */
  adjustments: FitAdjustment[];
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
  /**
   * v2 (Phase A.2) — geocoded centroids of the candidate's desired markets
   * (resolved server-side from desired_locations). Drives real commute-
   * distance scoring. Empty when none geocoded yet → location falls back to
   * string/state matching.
   */
  desired_location_points: Array<{ lat: number; lng: number }>;
  /**
   * v2 (Phase A.3) — practice-management systems the candidate is fluent in
   * (canonical PMS_SYSTEMS values). Drives the pms_fluency dimension.
   */
  pms_systems: string[];
  /**
   * v2 (Phase A.3b) — certification kinds the candidate has on file
   * (candidate_certifications.kind, canonical CERTIFICATION_KINDS values).
   * Drives the certifications dimension.
   */
  certifications: string[];
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
  /* ── v3 Phase B.1 — assessment work-style / culture signals. Each is
   *    null until the candidate takes the assessment; null excludes the
   *    matching dimension (never penalizes). Vocab matches the assessment
   *    question options. ── */
  /** high_volume | steady | thorough */
  work_pace: string | null;
  /** autonomy | balance | structure */
  autonomy_pref: string | null;
  /** strong | occasional | independent */
  mentorship_pref: string | null;
  /** 1-5; stored for future use — not yet a scored dimension in B.1. */
  patient_facing_energy: number | null;
  /** private | midsize | large | any ("any" = no preference → unscored). */
  practice_feel: string | null;
  /** 1-5 — how much the candidate values CE/growth (desire side). */
  ce_growth_importance: number | null;
  /** 1-5 — how much the candidate values predictable work-life balance. */
  work_life_priority: number | null;
  /**
   * v3 Phase B.2 — "what matters MOST to you" (comp | schedule | culture |
   * growth | location). Re-weights THIS candidate's match toward the dimensions
   * they care about (a per-candidate tilt, not a new dimension). Null = no tilt
   * (identical to pre-B.2 scoring).
   */
  comp_priority: string | null;
  /**
   * v3 — ranked "what matters most" (ordered, up to 3; index 0 = #1). When
   * non-empty it supersedes `comp_priority` and applies a tiered weight tilt
   * (rank 1 heaviest). Empty array falls back to the single comp_priority.
   */
  comp_priorities: string[];
  /**
   * v3.1 — the candidate's "benefits that matter most" (assessment chips:
   * health | retirement_match | pto | ce_allowance | bonus | loan_repayment |
   * flex_schedule | partnership). Empty = no signal → benefits dim excluded.
   */
  benefit_priorities: string[];
  /**
   * v3.1 — patient populations the candidate most enjoys caring for (canonical
   * PATIENT_POPULATIONS values, plus a no-signal "all"). Scored against the
   * practice's served populations. Empty / "all"-only → dim excluded.
   */
  patient_population_pref: string[];
  /* ── #52 DSOFit corporate signals. Null until the DSOFit assessment captures
   *    them; null excludes the matching dim (never a penalty). Derived where
   *    possible from the resume, confirmed by the assessment. ── */
  /** ic | lead | manager | director | vp | c_suite (candidate's level). */
  seniority_level: string | null;
  /** solo | small | mid | large | enterprise — largest org SCALE operated at
   *  (1 / 2–9 / 10–49 / 50–99 / 100+ locations). The multi-site moat signal. */
  org_scale_experience: string | null;
  /** none | adjacent_healthcare | dental_dso — dental/healthcare domain depth. */
  domain_background: string | null;
  /** Years in that domain (optional; nuances domain_fit). */
  domain_years: number | null;
  /** none | 1-5 | 6-20 | 21-100 | 100+ — people managed (leadership scope). */
  mgmt_span: string | null;
  /** none | departmental | multi_site | org_wide — P&L / budget ownership. */
  pl_scope: string | null;
  /** onsite | hybrid | remote | open — work-mode preference. */
  work_mode_pref: string | null;
  /** none | occasional | frequent — travel tolerance. */
  travel_tolerance: string | null;
}

export interface JobFitInputs {
  /**
   * v1.1 — role is a HARD FILTER. computePracticeFit returns null
   * when candidate has non-empty `desired_roles` and this category
   * is not in that list.
   */
  role_category: string;
  /**
   * #110 (2026-06-09) — corporate postings store role_category="other" and
   * carry their real category here (a CORPORATE_FUNCTIONS slug, e.g.
   * "business-development", "it-engineering"). Null for clinical/admin jobs.
   * Drives corporate-track gating + function-fit scoring so a corporate req is
   * matched against the right corporate function, not against everyone.
   */
  corporate_function: string | null;
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
  /**
   * From job_locations join — city/state plus city-centroid coords (v2,
   * Phase A.2) for commute-distance scoring. May have multiple.
   */
  locations: Array<{
    state: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
  }>;
  /** From job_skills join. v1 schema doesn't distinguish required vs preferred. */
  skills: string[];
  /**
   * v2 (Phase A.3) — canonical PMS names detected in the job's title /
   * requirements / description text (the job side has no structured PMS
   * field). Empty when the posting doesn't name one → pms_fluency excluded.
   */
  pms_required: string[];
  /**
   * v2 (Phase A.3b) — certification kinds detected in the job's text
   * (CERTIFICATION_KINDS values). Empty when the posting doesn't call any
   * out → certifications dim excluded.
   */
  certs_required: string[];
  /**
   * v1.1 — multi-select against the SPECIALTIES canonical list. Empty
   * array means "specialty-agnostic" (admin / front-desk roles); the
   * specialty dim is excluded for those.
   */
  specialty: string[];
  /** v1.1 — null means "no minimum experience requirement"; the dim is excluded. */
  min_years_experience: number | null;
  /**
   * v3.1 — the benefits the posting lists (jobs.benefits, free-text-ish
   * strings like "401(k) with employer match", "Sign-on bonus available").
   * Matched against the candidate's benefit_priorities via keyword. Empty →
   * benefits dim excluded.
   */
  benefits: string[];
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
  /** #52 DSOFit — target seniority tier for the role (ic…c_suite) or null.
   *  From the corporate wizard level field / derived from title. */
  seniority_target: string | null;
  /** #52 DSOFit — minimum org scale the role expects experience at
   *  (solo…enterprise) or null when it doesn't matter. */
  org_scale_need: string | null;
  /** #52 DSOFit — domain preference: dental_preferred | healthcare_ok |
   *  agnostic (or null = agnostic, dim excluded). */
  domain_preference: string | null;
  /** #52 DSOFit — leadership tier the role needs: none | team | dept |
   *  multi_site | org (or null = not a leadership role, dim excluded). */
  leadership_required: string | null;
  /** #52 DSOFit — onsite | hybrid | remote (role's work mode) or null. */
  work_mode: string | null;
  /** #52 DSOFit — none | occasional | frequent (role's travel) or null. */
  travel_required: string | null;
}

export interface DsoFitInputs {
  /** Total practice / location count for the DSO. Drives the DSO-size dimension. */
  location_count: number;
  /* ── v3 Phase B.1 — the practice-profile mirror of the candidate's
   *    assessment culture signals. Null until the practice fills its
   *    profile; null excludes the matching dimension (never penalizes).
   *    Vocab matches the candidate columns so the engine compares
   *    directly. ── */
  /** high_volume | steady | thorough */
  practice_pace: string | null;
  /** autonomy | balance | structure */
  autonomy_level: string | null;
  /** strong | occasional | independent */
  mentorship_offered: string | null;
  /**
   * private | midsize | large. When null, the engine DERIVES it from
   * location_count (1 = private, 2-9 = midsize, 10+ = large) so the
   * practice_feel dim can score even before the profile is filled.
   */
  practice_feel: string | null;
  /** 1-5 — how much CE/growth the practice provides (provision side). */
  ce_support: number | null;
  /** 1-5 — how predictable / balanced the practice's schedule really is. */
  work_life_balance: number | null;
  /**
   * v3.1 — patient populations the practice serves (canonical
   * PATIENT_POPULATIONS values). Mirrors the candidate's
   * patient_population_pref. Empty → patient_population dim excluded.
   */
  patient_populations: string[];
}

export interface FitInputs {
  candidate: CandidateFitInputs;
  job: JobFitInputs;
  dso: DsoFitInputs;
}
