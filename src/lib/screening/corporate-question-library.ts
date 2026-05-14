/**
 * Curated CORPORATE screening question library for the DSO Hire
 * corporate job posting wizard (Phase 5G.d, 2026-05-14).
 *
 * Pure data — no DB rows, no async. The parallel /employer/jobs/new/corporate
 * wizard has a deliberately-empty Screening seam waiting for a
 * corporate-tuned recommended-question set. The dental
 * `question-library.ts` asks chairside/clinical questions that make no
 * sense for a CFO / COO / VP hire — this file is its corporate twin.
 *
 * Structurally a sibling of question-library.ts:
 *   - Reuses the `RecommendedQuestion` / `RecommendedOption` shapes (imported,
 *     not redefined) so the panel can consume cards identically.
 *   - Returns a `RoleCategoryRecommendation` from `getCorporateRecommendations`
 *     so the corporate panel mirrors `getRecommendationsForRole` exactly.
 *
 * STRUCTURAL DEVIATION — a corporate-specific category enum:
 *   The dental `QuestionCategory` values ("qualification" = licensing,
 *   "skills" = clinical specializations, "logistics" = chair schedule)
 *   are clinical in spirit and their LABELS ("Qualifications & licensing",
 *   "Skills & specializations") read wrong for an executive hire. Rather
 *   than mislabel, this file defines `CorporateQuestionCategory` with the
 *   SAME SIX KEYS as the dental enum — so any code keyed on the string
 *   union still type-checks — but corporate-appropriate LABELS via
 *   `CORPORATE_CATEGORY_LABELS`. `CORPORATE_CATEGORY_ORDER` mirrors
 *   `CATEGORY_ORDER`. The corporate panel imports the labels/order from
 *   here; the dental panel keeps importing from question-library.ts.
 *   Keys identical → `RecommendedQuestion.category` stays assignable, no
 *   shape divergence.
 *
 *   - knockout=true → flagged in the UI as a disqualifying filter. Used
 *     sparingly here (right-to-work only) — corporate screening is mostly
 *     informational depth-gauging, not pass/fail gating.
 *   - rationale     → ~1 sentence shown under each card.
 *   - category      → drives sectioning in the panel. Every question tagged.
 */

import type {
  RecommendedOption,
  RecommendedQuestion,
  RoleCategoryRecommendation,
} from "./question-library";

/**
 * Corporate category keys — intentionally identical to the dental
 * `QuestionCategory` union so `RecommendedQuestion.category` stays a
 * single shared type. Only the human labels differ (see below).
 */
export type CorporateQuestionCategory =
  | "qualification"
  | "experience"
  | "skills"
  | "logistics"
  | "compensation"
  | "fit";

/** Corporate-tuned section labels — the executive-hire equivalents. */
export const CORPORATE_CATEGORY_LABELS: Record<
  CorporateQuestionCategory,
  string
> = {
  qualification: "Credentials & eligibility",
  experience: "Experience & scope",
  skills: "Functional depth",
  logistics: "Location & travel",
  compensation: "Compensation",
  fit: "Fit & open-ended",
};

export const CORPORATE_CATEGORY_ORDER: CorporateQuestionCategory[] = [
  "qualification",
  "experience",
  "skills",
  "logistics",
  "compensation",
  "fit",
];

/* ─────────────────────────────────────────────────────────────────
 * Shared option sets
 * ────────────────────────────────────────────────────────────────*/

const CORP_YEARS_OPTIONS: RecommendedOption[] = [
  { id: "cyrs_0_2", label: "Less than 2 years" },
  { id: "cyrs_2_5", label: "2–5 years" },
  { id: "cyrs_5_10", label: "5–10 years" },
  { id: "cyrs_10_15", label: "10–15 years" },
  { id: "cyrs_15p", label: "15+ years" },
];

const WORK_MODE_OPTIONS: RecommendedOption[] = [
  { id: "wm_onsite", label: "On-site" },
  { id: "wm_hybrid", label: "Hybrid" },
  { id: "wm_remote", label: "Fully remote" },
  { id: "wm_flex", label: "Flexible — open to options" },
];

const TRAVEL_OPTIONS: RecommendedOption[] = [
  { id: "trv_none", label: "Little to none" },
  { id: "trv_25", label: "Up to 25%" },
  { id: "trv_50", label: "Up to 50%" },
  { id: "trv_75p", label: "50%+ — road warrior" },
];

const LEADERSHIP_SCOPE_OPTIONS: RecommendedOption[] = [
  { id: "lead_ic", label: "Individual contributor" },
  { id: "lead_team", label: "Led a team (1–10)" },
  { id: "lead_dept", label: "Led a department (11–50)" },
  { id: "lead_function", label: "Led a function / org (50+)" },
  { id: "lead_exec", label: "C-suite / executive team" },
];

const PMS_OPTIONS: RecommendedOption[] = [
  { id: "pms_dentrix", label: "Dentrix" },
  { id: "pms_eaglesoft", label: "Eaglesoft" },
  { id: "pms_open_dental", label: "Open Dental" },
  { id: "pms_denticon", label: "Denticon" },
  { id: "pms_carestack", label: "CareStack" },
  { id: "pms_other", label: "Other / none" },
];

const DENTAL_INDUSTRY_OPTIONS: RecommendedOption[] = [
  { id: "ind_dso", label: "DSO / multi-practice dental group" },
  { id: "ind_solo_group", label: "Solo or small group dental practice" },
  { id: "ind_healthcare", label: "Other healthcare (non-dental)" },
  { id: "ind_multisite_retail", label: "Multi-site retail / services (non-healthcare)" },
  { id: "ind_other", label: "Other industry" },
];

/* ─────────────────────────────────────────────────────────────────
 * Bank 1 — Universal Corporate
 * ────────────────────────────────────────────────────────────────*/

const UNIVERSAL_CORPORATE_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "corp_univ_right_to_work",
    prompt:
      "Are you legally authorized to work in the United States without sponsorship?",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Knockout filter required by federal hiring rules — flags candidates who would need visa sponsorship.",
    category: "qualification",
  },
  {
    id: "corp_univ_years_corporate",
    prompt:
      "How many total years of corporate or professional-services experience do you have?",
    kind: "single_select",
    options: CORP_YEARS_OPTIONS,
    required: false,
    rationale:
      "Quick seniority filter that works regardless of which corporate function you're hiring for.",
    category: "experience",
  },
  {
    id: "corp_univ_current_title",
    prompt: "What is your current (or most recent) job title and employer?",
    helper_text: "Employer name optional — title and company type are enough.",
    kind: "short_text",
    required: false,
    rationale:
      "Title + employer type calibrates seniority faster than parsing a resume header.",
    category: "experience",
  },
  {
    id: "corp_univ_leadership_scope",
    prompt: "What is the largest leadership scope you've held?",
    kind: "single_select",
    options: LEADERSHIP_SCOPE_OPTIONS,
    required: false,
    rationale:
      "Span of leadership is the single biggest predictor of readiness for a corporate DSO seat.",
    category: "experience",
  },
  {
    id: "corp_univ_work_mode",
    prompt: "What work mode are you targeting for this role?",
    kind: "single_select",
    options: WORK_MODE_OPTIONS,
    required: false,
    rationale:
      "Work-mode mismatch ends corporate searches fast — surface it before the first screen.",
    category: "logistics",
  },
  {
    id: "corp_univ_why_dso",
    prompt:
      "Why are you interested in a corporate role at a dental support organization specifically?",
    kind: "long_text",
    required: false,
    rationale:
      "Separates candidates drawn to the DSO model from those treating it as a generic corporate job.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Bank 2 — Finance / Accounting
 * ────────────────────────────────────────────────────────────────*/

const FINANCE_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "corp_fin_cpa",
    prompt: "Do you hold an active CPA license (or equivalent: CMA, CFA, MBA-Finance)?",
    helper_text: "List the credential if you'd like — we may follow up.",
    kind: "yes_no",
    required: false,
    rationale:
      "Many controllership and senior finance seats screen for a CPA — surface it up front.",
    category: "qualification",
  },
  {
    id: "corp_fin_revenue_scale",
    prompt: "What is the largest annual revenue scale you've had financial responsibility for?",
    kind: "single_select",
    options: [
      { id: "rev_lt10m", label: "Under $10M" },
      { id: "rev_10_50m", label: "$10M–$50M" },
      { id: "rev_50_150m", label: "$50M–$150M" },
      { id: "rev_150_500m", label: "$150M–$500M" },
      { id: "rev_500mp", label: "$500M+" },
    ],
    required: false,
    rationale:
      "Revenue scale is a sharper fit signal than years of experience for a finance leader.",
    category: "experience",
  },
  {
    id: "corp_fin_multi_entity",
    prompt:
      "Have you owned multi-entity accounting and consolidations (multiple legal entities, intercompany)?",
    kind: "yes_no",
    required: false,
    rationale:
      "DSOs run dozens of legal entities — multi-entity consolidation experience is a core differentiator.",
    category: "skills",
  },
  {
    id: "corp_fin_depth_areas",
    prompt: "Which finance functions have you owned hands-on?",
    kind: "multi_select",
    options: [
      { id: "fin_fpa", label: "FP&A / budgeting / forecasting" },
      { id: "fin_rev_cycle", label: "Revenue cycle / dental billing & collections" },
      { id: "fin_controllership", label: "Controllership / month-end close" },
      { id: "fin_treasury", label: "Treasury / cash management" },
      { id: "fin_tax", label: "Tax strategy & compliance" },
      { id: "fin_audit", label: "Audit (internal or external)" },
      { id: "fin_provider_comp", label: "Provider compensation modeling" },
    ],
    required: false,
    rationale:
      "Finance scope varies widely — pinpoint which areas the candidate has actually owned.",
    category: "skills",
  },
  {
    id: "corp_fin_ma_diligence",
    prompt:
      "Have you supported M&A financial diligence or post-acquisition integration?",
    kind: "yes_no",
    required: false,
    rationale:
      "Growth-stage DSOs acquire constantly — diligence and integration exposure is high-value.",
    category: "skills",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Bank 3 — Operations / Clinical Ops
 * ────────────────────────────────────────────────────────────────*/

const OPERATIONS_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "corp_ops_practices_managed",
    prompt:
      "What is the largest number of practices or locations you've had operational responsibility for?",
    kind: "single_select",
    options: [
      { id: "loc_1_3", label: "1–3 locations" },
      { id: "loc_4_10", label: "4–10 locations" },
      { id: "loc_11_25", label: "11–25 locations" },
      { id: "loc_26_75", label: "26–75 locations" },
      { id: "loc_75p", label: "75+ locations" },
    ],
    required: false,
    rationale:
      "Location span is the strongest predictor of operational bandwidth for a DSO ops seat.",
    category: "experience",
  },
  {
    id: "corp_ops_pl_ownership",
    prompt:
      "Have you carried direct P&L accountability for the locations you've managed?",
    kind: "yes_no",
    required: false,
    rationale:
      "Some ops leaders own execution only; others own P&L — DSOs hire differently for each.",
    category: "experience",
  },
  {
    id: "corp_ops_systems",
    prompt: "Which practice management or operational systems have you worked with?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Familiarity with the DSO's EMR/PMS stack shortens ramp from months to weeks.",
    category: "skills",
  },
  {
    id: "corp_ops_de_novo",
    prompt:
      "Have you led a de novo practice opening or integrated a newly acquired location?",
    kind: "yes_no",
    required: false,
    rationale:
      "De novo and post-acquisition integration is a distinct skill set from steady-state operations.",
    category: "skills",
  },
  {
    id: "corp_ops_standardization",
    prompt:
      "Briefly describe how you've standardized processes or KPIs across multiple sites.",
    kind: "long_text",
    required: false,
    rationale:
      "Multi-site standardization is the central operating challenge in a DSO — surfaces operating philosophy.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Bank 4 — HR / Recruiting / Training
 * ────────────────────────────────────────────────────────────────*/

const HR_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "corp_hr_function_scope",
    prompt: "Which HR / people functions have you owned?",
    kind: "multi_select",
    options: [
      { id: "hr_ta", label: "Talent acquisition / recruiting" },
      { id: "hr_hrbp", label: "HR business partnering" },
      { id: "hr_comp_benefits", label: "Compensation & benefits" },
      { id: "hr_ld", label: "Learning & development / training" },
      { id: "hr_er", label: "Employee relations / compliance" },
      { id: "hr_hris", label: "HRIS / people operations" },
      { id: "hr_dei", label: "Culture / engagement / DEI" },
    ],
    required: false,
    rationale:
      "HR scope varies widely — pinpoint which functions the candidate has actually run.",
    category: "skills",
  },
  {
    id: "corp_hr_headcount",
    prompt: "What is the largest employee headcount you've directly supported as an HR leader?",
    kind: "single_select",
    options: [
      { id: "hc_lt100", label: "Under 100" },
      { id: "hc_100_500", label: "100–500" },
      { id: "hc_500_1500", label: "500–1,500" },
      { id: "hc_1500_5000", label: "1,500–5,000" },
      { id: "hc_5000p", label: "5,000+" },
    ],
    required: false,
    rationale:
      "Headcount supported calibrates the candidate against the size of your people function.",
    category: "experience",
  },
  {
    id: "corp_hr_industry",
    prompt: "What industry is most of your HR experience in?",
    kind: "single_select",
    options: DENTAL_INDUSTRY_OPTIONS,
    required: false,
    rationale:
      "Dental or multi-site healthcare HR experience transfers far more cleanly than generic corporate HR.",
    category: "experience",
  },
  {
    id: "corp_hr_depth",
    prompt:
      "Briefly describe your deepest area of HR expertise (e.g. comp & benefits design, L&D program build, high-volume clinical recruiting).",
    kind: "long_text",
    required: false,
    rationale:
      "Surfaces where the candidate is genuinely deep vs. broadly familiar.",
    category: "skills",
  },
  {
    id: "corp_hr_systems",
    prompt: "Which ATS or HRIS platforms have you administered or led implementations for?",
    helper_text: "e.g. Workday, UKG, ADP, Paycom, Greenhouse, Lever.",
    kind: "short_text",
    required: false,
    rationale:
      "Systems fluency shortens ramp and signals scale — high-volume DSO hiring lives in the ATS/HRIS.",
    category: "skills",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Bank 5 — IT / Engineering
 * ────────────────────────────────────────────────────────────────*/

const IT_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "corp_it_pms_experience",
    prompt:
      "Which dental practice management systems have you supported or integrated at the technical level?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Hands-on dental PMS experience (Dentrix, Eaglesoft, Open Dental) is rare and high-value for a DSO IT hire.",
    category: "skills",
  },
  {
    id: "corp_it_multisite_scale",
    prompt:
      "What is the largest number of sites or locations you've supported IT for?",
    kind: "single_select",
    options: [
      { id: "itloc_1_5", label: "1–5 sites" },
      { id: "itloc_6_25", label: "6–25 sites" },
      { id: "itloc_26_75", label: "26–75 sites" },
      { id: "itloc_75_200", label: "75–200 sites" },
      { id: "itloc_200p", label: "200+ sites" },
    ],
    required: false,
    rationale:
      "Multi-site IT scale is a different discipline than single-HQ IT — calibrate against your footprint.",
    category: "experience",
  },
  {
    id: "corp_it_focus",
    prompt: "Where is your technical center of gravity?",
    kind: "single_select",
    options: [
      { id: "itf_infra", label: "Infrastructure / networking / endpoints" },
      { id: "itf_software", label: "Software engineering / application development" },
      { id: "itf_data", label: "Data / analytics / BI" },
      { id: "itf_security", label: "Security / compliance" },
      { id: "itf_leadership", label: "IT leadership / strategy (broad)" },
    ],
    required: false,
    rationale:
      "Routes the candidate to the right opening — infra, software, data, and security are distinct hires.",
    category: "skills",
  },
  {
    id: "corp_it_security_compliance",
    prompt:
      "Have you owned security or compliance programs (HIPAA, SOC 2, security audits) in a healthcare setting?",
    kind: "yes_no",
    required: false,
    rationale:
      "Healthcare data compliance is non-negotiable for a DSO — surface this exposure explicitly.",
    category: "skills",
  },
  {
    id: "corp_it_scope_summary",
    prompt:
      "Briefly describe the size and shape of the IT environment you currently run (team size, users, key systems).",
    kind: "long_text",
    required: false,
    rationale:
      "A short environment summary is higher-signal than resume keywords for sizing the seat.",
    category: "experience",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Bank 6 — Marketing / BizDev / M&A / Other
 * ────────────────────────────────────────────────────────────────*/

const MARKETING_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "corp_mkt_focus",
    prompt: "Which area best describes your professional focus?",
    kind: "single_select",
    options: [
      { id: "mkt_growth", label: "Marketing / patient acquisition / brand" },
      { id: "mkt_bizdev", label: "Business development / partnerships / affiliations" },
      { id: "mkt_ma", label: "M&A / corporate development / deal sourcing" },
      { id: "mkt_strategy", label: "Strategy / corporate planning" },
    ],
    required: false,
    rationale:
      "Routes the candidate to the right opening — marketing, BizDev, and M&A are distinct corporate tracks.",
    category: "experience",
  },
  {
    id: "corp_mkt_patient_acquisition",
    prompt:
      "What is the largest patient-acquisition or marketing budget you've managed annually?",
    kind: "single_select",
    options: [
      { id: "bud_lt250k", label: "Under $250K" },
      { id: "bud_250k_1m", label: "$250K–$1M" },
      { id: "bud_1m_5m", label: "$1M–$5M" },
      { id: "bud_5m_15m", label: "$5M–$15M" },
      { id: "bud_15mp", label: "$15M+" },
    ],
    required: false,
    rationale:
      "Budget scale is a sharper fit signal than years for a marketing or growth leader.",
    category: "experience",
  },
  {
    id: "corp_mkt_brand_portfolio",
    prompt:
      "Have you managed marketing across a multi-brand or multi-location portfolio?",
    kind: "yes_no",
    required: false,
    rationale:
      "DSOs often run several practice brands — multi-brand portfolio experience transfers directly.",
    category: "skills",
  },
  {
    id: "corp_mkt_channel_or_pipeline",
    prompt:
      "Which channels or sourcing motions are you strongest in?",
    helper_text:
      "For marketing: paid search, SEO, social, CRM. For BizDev/M&A: affiliation sourcing, broker relationships, deal pipeline.",
    kind: "long_text",
    required: false,
    rationale:
      "Open-ended on purpose — channel mix and sourcing motion are too varied for a fixed checklist.",
    category: "skills",
  },
  {
    id: "corp_mkt_deal_pipeline",
    prompt:
      "If applicable: roughly how many affiliations, partnerships, or acquisitions have you sourced or closed?",
    helper_text: "Approximate is fine. Leave blank if not a deal-focused role.",
    kind: "short_text",
    required: false,
    rationale:
      "Deal and partnership throughput is the highest-signal metric for a BizDev or corp-dev hire.",
    category: "skills",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Bank registry + function → bank mapping
 * ────────────────────────────────────────────────────────────────*/

/**
 * The six corporate banks, keyed by a stable bank id. Universal Corporate
 * is always prepended by `getCorporateRecommendations`; the other five are
 * function-matched.
 */
export const CORPORATE_QUESTION_BANKS = {
  universal: {
    label: "this corporate role",
    questions: UNIVERSAL_CORPORATE_QUESTIONS,
  },
  finance: {
    label: "Finance & Accounting",
    questions: FINANCE_QUESTIONS,
  },
  operations: {
    label: "Operations",
    questions: OPERATIONS_QUESTIONS,
  },
  hr: {
    label: "HR, Recruiting & Training",
    questions: HR_QUESTIONS,
  },
  it: {
    label: "IT & Engineering",
    questions: IT_QUESTIONS,
  },
  marketing: {
    label: "Marketing, BizDev & Corporate Development",
    questions: MARKETING_QUESTIONS,
  },
} as const;

type CorporateBankId = keyof typeof CORPORATE_QUESTION_BANKS;

/**
 * Maps all 12 CORPORATE_FUNCTIONS slugs (src/lib/corporate/functions.ts)
 * onto one of the 5 non-universal banks. Reasoning per non-obvious slug:
 *
 *   finance-accounting          → finance
 *   marketing                   → marketing
 *   operations                  → operations
 *   hr-recruiting               → hr
 *   it-engineering              → it
 *   legal-compliance            → operations  (corp-staff back-office; ops bank
 *                                  covers P&L / multi-site / standardization
 *                                  questions that read closest to a GC seat —
 *                                  better than mislabeling under marketing/finance)
 *   real-estate-facilities      → operations  (multi-site footprint, de novo
 *                                  openings, integration — squarely ops-flavored)
 *   ma-corporate-development    → marketing   (the marketing bank doubles as the
 *                                  BizDev/M&A bank — deal pipeline + sourcing Qs)
 *   training-development        → hr          (L&D / curriculum / LMS lives inside
 *                                  the HR bank's function-scope + depth Qs)
 *   supply-chain-procurement    → operations  (vendor mgmt, multi-site logistics,
 *                                  process standardization — ops-flavored)
 *   clinical-operations         → operations  (VP Clinical Affairs / regional
 *                                  clinical directors — same multi-site ops Qs,
 *                                  kept non-clinical in vocabulary by design)
 *   business-development        → marketing   (partnerships + affiliation sourcing
 *                                  — same bank as M&A / corp dev)
 */
const FUNCTION_TO_BANK: Record<string, CorporateBankId> = {
  "finance-accounting": "finance",
  "marketing": "marketing",
  "operations": "operations",
  "hr-recruiting": "hr",
  "it-engineering": "it",
  "legal-compliance": "operations",
  "real-estate-facilities": "operations",
  "ma-corporate-development": "marketing",
  "training-development": "hr",
  "supply-chain-procurement": "operations",
  "clinical-operations": "operations",
  "business-development": "marketing",
};

/**
 * Returns the recommended set for a corporate function slug: Universal
 * Corporate questions followed by the one function-matched bank. Falls
 * back to Universal-only when the slug is unknown or missing.
 *
 * Shape mirrors `getRecommendationsForRole` (a `RoleCategoryRecommendation`)
 * so the corporate panel can consume it exactly like the dental panel.
 */
export function getCorporateRecommendations(
  functionSlug: string | null | undefined
): RoleCategoryRecommendation {
  const universal = CORPORATE_QUESTION_BANKS.universal;
  if (!functionSlug) {
    return { label: universal.label, questions: [...universal.questions] };
  }
  const bankId = FUNCTION_TO_BANK[functionSlug];
  if (!bankId) {
    return { label: universal.label, questions: [...universal.questions] };
  }
  const bank = CORPORATE_QUESTION_BANKS[bankId];
  return {
    label: bank.label,
    questions: [...universal.questions, ...bank.questions],
  };
}
