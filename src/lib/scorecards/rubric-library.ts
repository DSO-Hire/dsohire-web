/**
 * Curated scorecard rubric library for DSO hiring.
 *
 * Pure data — no DB rows, no async. Maps `role_category` → a recommended
 * 1-5 rubric. Each rubric has 5-7 attributes, each attribute is scored on
 * a 1 (significant concern) → 5 (exceptional) scale, and reviewers can
 * leave a per-attribute note plus an overall recommendation + note.
 *
 * Rubric IDs are stable slugs. They are persisted on the scorecard row so
 * that older scorecards continue to render against the rubric they were
 * authored against; if a slug is ever removed, callers fall back to the
 * universal rubric (see `getRubricForRole`).
 *
 * Voice: declarative, dental-domain specific, no marketing fluff. Each
 * attribute's `description` is a single helper line the reviewer reads
 * when they're picking a score — keep it concrete.
 */

export type ScorecardAttributeCategory =
  | "clinical"
  | "soft_skills"
  | "role_specific"
  | "culture_fit";

export interface ScorecardAttribute {
  /** Stable slug — used as a key in attribute_scores jsonb. */
  id: string;
  label: string;
  /** 1-2 sentence helper shown under the attribute label. */
  description: string;
  category: ScorecardAttributeCategory;
}

export interface ScorecardRubric {
  /** Stable slug — persisted on the scorecard row. */
  id: string;
  label: string;
  description: string;
  attributes: ScorecardAttribute[];
}

export type OverallRecommendation =
  | "strong_yes"
  | "yes"
  | "maybe"
  | "no"
  | "strong_no";

export const RECOMMENDATION_ORDER: OverallRecommendation[] = [
  "strong_yes",
  "yes",
  "maybe",
  "no",
  "strong_no",
];

export const RECOMMENDATION_LABELS: Record<OverallRecommendation, string> = {
  strong_yes: "Strong Yes",
  yes: "Yes",
  maybe: "Maybe",
  no: "No",
  strong_no: "Strong No",
};

/**
 * Color tokens for the recommendation pills. Mirrors the kanban stage
 * palette so the visual language stays consistent across the detail page.
 */
export const RECOMMENDATION_COLORS: Record<
  OverallRecommendation,
  { bg: string; ring: string; text: string }
> = {
  strong_yes: {
    bg: "bg-heritage/15",
    ring: "ring-heritage/40",
    text: "text-heritage-deep",
  },
  yes: { bg: "bg-emerald-50", ring: "ring-emerald-200", text: "text-emerald-700" },
  maybe: { bg: "bg-amber-50", ring: "ring-amber-200", text: "text-amber-700" },
  no: { bg: "bg-slate-100", ring: "ring-slate-200", text: "text-slate-700" },
  strong_no: { bg: "bg-red-50", ring: "ring-red-200", text: "text-red-700" },
};

export const SCORE_VALUES: readonly number[] = [1, 2, 3, 4, 5] as const;

export const SCORE_LABELS: Record<number, string> = {
  1: "Significant concern",
  2: "Below expectations",
  3: "Meets expectations",
  4: "Above expectations",
  5: "Exceptional",
};

export const ATTRIBUTE_CATEGORY_LABELS: Record<
  ScorecardAttributeCategory,
  string
> = {
  clinical: "Clinical",
  soft_skills: "Soft skills",
  role_specific: "Role specific",
  culture_fit: "Culture fit",
};

/* ─────────────────────────────────────────────────────────────────
 * Per-role rubrics
 * ────────────────────────────────────────────────────────────────*/

const ASSOCIATE_DENTIST_RUBRIC: ScorecardRubric = {
  id: "rubric_associate_dentist_v1",
  label: "Associate Dentist",
  description:
    "General-practice associate joining an existing chair. Weights clinical decision-making and treatment-planning judgment alongside chairside warmth.",
  attributes: [
    {
      id: "clinical_decision_making",
      label: "Clinical decision-making",
      description:
        "Diagnostic accuracy, conservative-vs-aggressive judgment, awareness of when to refer.",
      category: "clinical",
    },
    {
      id: "procedural_breadth",
      label: "Procedural breadth",
      description:
        "Comfort across the GP procedure mix the chair sees: extractions, endo, restorative, aligners.",
      category: "clinical",
    },
    {
      id: "chairside_manner",
      label: "Chairside manner",
      description:
        "Warmth, calm under pressure, plain-language patient communication.",
      category: "soft_skills",
    },
    {
      id: "treatment_planning_acumen",
      label: "Treatment-planning acumen",
      description:
        "Builds plans patients accept; thinks in terms of long-term oral health and practice production.",
      category: "role_specific",
    },
    {
      id: "team_collaboration",
      label: "Team collaboration",
      description:
        "Works well with hygiene, assistants, and front desk; comfortable in shared-panel, multi-doc settings.",
      category: "soft_skills",
    },
    {
      id: "coachability",
      label: "Learning curve and coachability",
      description:
        "Open to feedback, owns mistakes, ramps quickly on new tech and protocols.",
      category: "culture_fit",
    },
  ],
};

const SPECIALIST_DENTIST_RUBRIC: ScorecardRubric = {
  id: "rubric_specialist_dentist_v1",
  label: "Specialist Dentist",
  description:
    "Specialty seat (endo, OMS, perio, ortho, pedo, etc.). Weights specialty-specific depth and case-complexity tolerance.",
  attributes: [
    {
      id: "specialty_skill_depth",
      label: "Specialty-skill depth",
      description:
        "Mastery of the procedure mix unique to the specialty, evidenced by case volume and complexity.",
      category: "clinical",
    },
    {
      id: "case_complexity_tolerance",
      label: "Case-complexity tolerance",
      description:
        "Comfortable taking on the harder cases your panel produces without referring out.",
      category: "clinical",
    },
    {
      id: "chairside_manner",
      label: "Chairside manner",
      description:
        "Calm, consent-driven explanations on procedures patients are nervous about.",
      category: "soft_skills",
    },
    {
      id: "lab_referral_workflow",
      label: "Lab and referral workflow fluency",
      description:
        "Owns the case from intake through delivery; clear specs, fast turnaround, accountable for outcomes.",
      category: "role_specific",
    },
    {
      id: "associate_mentorship",
      label: "Mentorship of associates",
      description:
        "Lifts the GP team's case mix by coaching on diagnosis, prep, and case selection.",
      category: "role_specific",
    },
    {
      id: "business_acumen",
      label: "Business acumen",
      description:
        "Thinks about chair productivity, case acceptance, and lab cost; partners with ops on the numbers.",
      category: "culture_fit",
    },
  ],
};

const HYGIENIST_RUBRIC: ScorecardRubric = {
  id: "rubric_hygienist_v1",
  label: "Dental Hygienist",
  description:
    "RDH for a high-throughput chair. Weights perio judgment and patient-education skill alongside warmth and pace.",
  attributes: [
    {
      id: "clinical_thoroughness",
      label: "Clinical thoroughness",
      description:
        "Complete prophy and SRP technique; doesn't cut corners under schedule pressure.",
      category: "clinical",
    },
    {
      id: "perio_diagnosis",
      label: "Perio diagnosis confidence",
      description:
        "Pocket charting accuracy, comfort recommending SRP, conversation-ready on the perio program.",
      category: "clinical",
    },
    {
      id: "patient_education",
      label: "Patient education skill",
      description:
        "Explains findings in plain language; converts clinical reality into recare and home-care change.",
      category: "soft_skills",
    },
    {
      id: "chairside_warmth",
      label: "Chairside warmth",
      description:
        "Makes nervous patients comfortable; the hygienist patients ask for by name.",
      category: "soft_skills",
    },
    {
      id: "recare_ownership",
      label: "Recare ownership mindset",
      description:
        "Thinks of the hygiene program as theirs — recare percentage, reactivation, no-show recovery.",
      category: "role_specific",
    },
    {
      id: "pace_efficiency",
      label: "Pace and efficiency",
      description:
        "Stays on schedule across a full hygiene day without sacrificing quality.",
      category: "role_specific",
    },
    {
      id: "software_fluency",
      label: "Software fluency",
      description:
        "Charts and codes accurately in the practice's PMS; treats the chart as a clinical record, not paperwork.",
      category: "culture_fit",
    },
  ],
};

const DENTAL_ASSISTANT_RUBRIC: ScorecardRubric = {
  id: "rubric_dental_assistant_v1",
  label: "Dental Assistant",
  description:
    "Chairside assistant. Weights four-handed efficiency, sterilization rigor, and anticipation alongside warmth.",
  attributes: [
    {
      id: "four_handed_efficiency",
      label: "Four-handed efficiency",
      description:
        "Anticipates the doctor's next move; instrument transfer is fast, quiet, and accurate.",
      category: "clinical",
    },
    {
      id: "sterilization_rigor",
      label: "Sterilization and OSHA rigor",
      description:
        "Treats infection control as non-negotiable; fluent in instrument processing and operatory turnover.",
      category: "clinical",
    },
    {
      id: "patient_comfort",
      label: "Patient comfort skills",
      description:
        "Reads anxiety, intervenes early, makes nervous patients feel seen.",
      category: "soft_skills",
    },
    {
      id: "charting_accuracy",
      label: "Software and charting accuracy",
      description:
        "Captures procedure notes in real time; the chart matches what happened in the chair.",
      category: "role_specific",
    },
    {
      id: "lab_ticket_fluency",
      label: "Lab ticket fluency",
      description:
        "Owns the lab workflow — Rx, shade, tracking — so the doctor doesn't have to chase it.",
      category: "role_specific",
    },
    {
      id: "anticipation_prep",
      label: "Anticipation and prep",
      description:
        "Operatory is set up before the doctor arrives; trays match the procedure on the schedule.",
      category: "role_specific",
    },
    {
      id: "attitude_learning_posture",
      label: "Attitude and learning posture",
      description:
        "Asks good questions, takes feedback without defensiveness, treats every case as a chance to level up.",
      category: "culture_fit",
    },
  ],
};

const FRONT_OFFICE_RUBRIC: ScorecardRubric = {
  id: "rubric_front_office_v1",
  label: "Front Desk",
  description:
    "Front-of-house operator. Weights insurance fluency and treatment-plan presentation alongside phone presence.",
  attributes: [
    {
      id: "patient_communication",
      label: "Patient communication",
      description:
        "Phone presence, in-person warmth, ability to set the tone for the visit at check-in.",
      category: "soft_skills",
    },
    {
      id: "insurance_fluency",
      label: "Insurance and financial fluency",
      description:
        "Verifies benefits, explains balances, presents financing options without losing the patient.",
      category: "role_specific",
    },
    {
      id: "schedule_management",
      label: "Schedule management",
      description:
        "Keeps the chair full; thinks about block scheduling, no-show recovery, and recare flow.",
      category: "role_specific",
    },
    {
      id: "problem_solving",
      label: "Problem solving",
      description:
        "Handles billing disputes and angry patients without escalating; resolves rather than relays.",
      category: "soft_skills",
    },
    {
      id: "team_collaboration",
      label: "Team collaboration",
      description:
        "Hands off cleanly to clinical; the back office trusts what the front office tells them.",
      category: "soft_skills",
    },
    {
      id: "software_speed",
      label: "Software speed",
      description:
        "Keyboard-fluent in the PMS; shorter check-in/check-out cycles than the average front-desk hire.",
      category: "role_specific",
    },
    {
      id: "ownership_mindset",
      label: "Ownership mindset",
      description:
        "Treats the practice's collections and recare numbers as theirs; flags issues before they're caught.",
      category: "culture_fit",
    },
  ],
};

const OFFICE_MANAGER_RUBRIC: ScorecardRubric = {
  id: "rubric_office_manager_v1",
  label: "Office Manager",
  description:
    "Single-practice manager. Weights leadership presence and KPI literacy alongside vendor and IT savvy.",
  attributes: [
    {
      id: "leadership_presence",
      label: "Leadership presence",
      description:
        "The team looks to them; calm in chaos, decisive on day-to-day judgment calls.",
      category: "soft_skills",
    },
    {
      id: "kpi_literacy",
      label: "KPI literacy",
      description:
        "Reads production, collections, recare, and overhead numbers and acts on them.",
      category: "role_specific",
    },
    {
      id: "conflict_resolution",
      label: "Conflict resolution",
      description:
        "Handles team conflict and patient complaints without making them bigger.",
      category: "soft_skills",
    },
    {
      id: "pl_thinking",
      label: "P&L thinking",
      description:
        "Connects daily decisions to the practice's bottom line; partners with ownership on the numbers.",
      category: "role_specific",
    },
    {
      id: "hiring_coaching",
      label: "Hiring and coaching",
      description:
        "Recruits, onboards, and coaches the team; turnover and time-to-productivity reflect their work.",
      category: "role_specific",
    },
    {
      id: "vendor_it_savvy",
      label: "Vendor and IT savvy",
      description:
        "Manages PMS, imaging, supply, and lab vendors; keeps the practice running when something breaks.",
      category: "role_specific",
    },
    {
      id: "multi_location_coordination",
      label: "Multi-location coordination",
      description:
        "Comfortable coordinating with sister offices, regional ops, and shared services.",
      category: "culture_fit",
    },
  ],
};

const REGIONAL_MANAGER_RUBRIC: ScorecardRubric = {
  id: "rubric_regional_manager_v1",
  label: "Regional Manager",
  description:
    "Multi-practice operator. Weights span-of-control, KPI scorecard fluency, and provider recruitment.",
  attributes: [
    {
      id: "span_of_control",
      label: "Span of control",
      description:
        "Comfortably runs multiple practices in parallel without losing detail at any of them.",
      category: "role_specific",
    },
    {
      id: "kpi_scorecard_fluency",
      label: "KPI scorecard fluency",
      description:
        "Reads a multi-practice scorecard and knows where to push first; doesn't get lost in the data.",
      category: "role_specific",
    },
    {
      id: "provider_recruitment",
      label: "Provider recruitment",
      description:
        "Builds the bench: associates, hygienists, specialists. Closes candidates and protects retention.",
      category: "role_specific",
    },
    {
      id: "brand_vs_ops_judgment",
      label: "Brand-vs-ops judgment",
      description:
        "Knows when to enforce a brand standard vs. let a practice keep its identity. Bias toward outcomes.",
      category: "soft_skills",
    },
    {
      id: "change_leadership",
      label: "Change leadership",
      description:
        "Rolls out new tech, protocols, and KPIs across practices without losing the team.",
      category: "soft_skills",
    },
    {
      id: "financial_acumen",
      label: "Financial acumen",
      description:
        "Reads a P&L, plans capex, manages overhead. Comfortable in budget conversations with ownership.",
      category: "role_specific",
    },
    {
      id: "on_the_ground_coaching",
      label: "On-the-ground coaching",
      description:
        "Doesn't manage from a dashboard; in the office, in the chair side, coaching OMs and providers in person.",
      category: "culture_fit",
    },
  ],
};

const UNIVERSAL_RUBRIC: ScorecardRubric = {
  id: "rubric_universal_v1",
  label: "General role",
  description:
    "Fallback rubric for roles outside the curated set. Use when the role doesn't have a tailored rubric yet.",
  attributes: [
    {
      id: "communication",
      label: "Communication",
      description: "Clarity, listening, calibration to audience.",
      category: "soft_skills",
    },
    {
      id: "professionalism",
      label: "Professionalism",
      description:
        "Reliability, follow-through, ownership over the work and the relationships.",
      category: "soft_skills",
    },
    {
      id: "role_fit",
      label: "Role fit",
      description:
        "How well their experience and instincts match the seat they're being hired into.",
      category: "role_specific",
    },
    {
      id: "team_collaboration",
      label: "Team collaboration",
      description:
        "Plays well with the people they'd work with day to day.",
      category: "soft_skills",
    },
    {
      id: "growth_mindset",
      label: "Growth mindset",
      description: "Open to feedback, owns mistakes, gets better over time.",
      category: "culture_fit",
    },
  ],
};

/* ─────────────────────────────────────────────────────────────────
 * Public map
 * ────────────────────────────────────────────────────────────────*/

/**
 * Keys match `role_category` enum values from the jobs table. Roles outside
 * the curated set (e.g. `other`) fall through to the universal rubric.
 */
export const RUBRICS: Record<string, ScorecardRubric> = {
  dentist: ASSOCIATE_DENTIST_RUBRIC,
  specialist: SPECIALIST_DENTIST_RUBRIC,
  dental_hygienist: HYGIENIST_RUBRIC,
  dental_assistant: DENTAL_ASSISTANT_RUBRIC,
  front_office: FRONT_OFFICE_RUBRIC,
  office_manager: OFFICE_MANAGER_RUBRIC,
  regional_manager: REGIONAL_MANAGER_RUBRIC,
};

export { UNIVERSAL_RUBRIC };

/** Index of all known rubrics by id, for resolving stored scorecards. */
const RUBRICS_BY_ID: Record<string, ScorecardRubric> = (() => {
  const out: Record<string, ScorecardRubric> = {
    [UNIVERSAL_RUBRIC.id]: UNIVERSAL_RUBRIC,
  };
  for (const r of Object.values(RUBRICS)) out[r.id] = r;
  return out;
})();

/**
 * Resolve a rubric by `role_category`. Falls back to the universal rubric
 * when the category is unknown / `other` / null.
 */
export function getRubricForRole(
  roleCategory: string | null | undefined
): ScorecardRubric {
  if (!roleCategory) return UNIVERSAL_RUBRIC;
  return RUBRICS[roleCategory] ?? UNIVERSAL_RUBRIC;
}

/**
 * Resolve a rubric by stored id (for rendering a scorecard authored against
 * a previous rubric version). Falls back to universal if the id isn't known.
 */
export function getRubricById(rubricId: string | null | undefined): ScorecardRubric {
  if (!rubricId) return UNIVERSAL_RUBRIC;
  return RUBRICS_BY_ID[rubricId] ?? UNIVERSAL_RUBRIC;
}

/* ─────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────*/

/**
 * Stored shape of `attribute_scores`. Keys are attribute ids. Values are
 * { score, note } where `score` is in 1..5 and `note` is optional.
 *
 * The DB column is jsonb; this type is the canonical client-side shape we
 * marshal in/out.
 */
export interface AttributeScoreEntry {
  score: number;
  note?: string;
}

export type AttributeScoresMap = Record<string, AttributeScoreEntry>;

/**
 * Normalize an unknown jsonb value into AttributeScoresMap. Drops anything
 * that doesn't conform — defensive against hand-edited DB rows or rubric
 * version drift.
 */
export function parseAttributeScores(input: unknown): AttributeScoresMap {
  if (!input || typeof input !== "object") return {};
  const out: AttributeScoresMap = {};
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const score =
      typeof obj.score === "number"
        ? obj.score
        : typeof obj.score === "string"
          ? Number(obj.score)
          : NaN;
    if (!Number.isFinite(score) || score < 1 || score > 5) continue;
    const note = typeof obj.note === "string" ? obj.note : undefined;
    out[key] = note !== undefined ? { score, note } : { score };
  }
  return out;
}

/**
 * Average score across the attributes that have a score. Returns null if
 * the map is empty so the UI can render a clean "no scores yet" state.
 */
export function averageScore(scores: AttributeScoresMap): number | null {
  const values = Object.values(scores)
    .map((s) => s.score)
    .filter((n) => Number.isFinite(n));
  if (values.length === 0) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}
