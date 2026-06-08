/**
 * PracticeFit v3 — the assessment question bank (config, not schema).
 *
 * The approved ~5-minute, résumé-first, minimal-free-text assessment. Tweak
 * questions/options here freely — none of this touches the database. The
 * résumé-first wizard renders these; the save action maps answers to the
 * candidate signal columns (see assessment-action). Spec: Business Plan &
 * Strategy/PracticeFit_v3_Assessment_Questions_2026-06-04.md.
 *
 * Design rules baked in:
 *   • Part 1 (basics) is résumé-prefilled — shown to confirm, asked only when
 *     missing. Part 2 (deep) is always asked — no résumé contains it.
 *   • Every experience/confidence item has a positive "new / growing into"
 *     answer that is never a penalty (mirrors the engine's denominator rule).
 *   • Clinical-depth questions gate to clinical roles only (keeps it ~5 min).
 */

import {
  ROLE_CATEGORIES,
  SPECIALTIES,
  PMS_SYSTEMS,
} from "@/lib/candidate/canonical-lists";

export type AnswerType =
  | "single"
  | "multi"
  | "slider"
  | "salary"
  | "text"
  | "rank";

export type AssessmentSection =
  | "basics"
  | "work_style"
  | "clinical"
  | "culture"
  | "logistics"
  | "open";

export interface AssessmentOption {
  value: string;
  label: string;
}

export interface AssessmentQuestion {
  /** Stored answer key (maps to a candidate signal column in the save action). */
  key: string;
  section: AssessmentSection;
  /** PracticeFit dimension this feeds (existing or v3-new). For reference/UI. */
  dimension: string;
  prompt: string;
  help?: string;
  type: AnswerType;
  /** For single/multi. For `clinical` procedures we swap in role-specific lists. */
  options?: AssessmentOption[];
  /** For slider (1–5). */
  sliderLabels?: { low: string; high: string };
  /** True when the résumé parser can pre-fill this (Part 1 confirm step). */
  resumePrefill?: boolean;
  /** Only ask for clinical roles (dentist / hygienist / assistant / specialist). */
  clinicalOnly?: boolean;
  /** Never required (the single optional free-text box). */
  optional?: boolean;
}

/**
 * Role categories treated as clinical for the procedures section. Uses the
 * canonical candidate role values (ROLE_CATEGORIES), so it matches what the
 * profile + scoring engine already store/expect.
 */
export const CLINICAL_ROLES = [
  "associate_dentist",
  "specialist_dentist",
  "hygienist",
  "assistant",
] as const;

/**
 * Procedure confidence lists per role. Used by both the "confident doing" and
 * "want to grow into" questions. Red-pen these freely — pure config.
 */
export const PROCEDURES_BY_ROLE: Record<string, AssessmentOption[]> = {
  hygienist: [
    { value: "prophy", label: "Adult & child prophy" },
    { value: "srp_perio", label: "SRP / perio therapy" },
    { value: "perio_charting", label: "Perio charting" },
    { value: "local_anesthesia", label: "Local anesthesia" },
    { value: "nitrous", label: "Nitrous oxide" },
    { value: "sealants", label: "Sealants & fluoride" },
    { value: "scaling", label: "Hand & ultrasonic scaling" },
    { value: "lasers", label: "Laser therapy" },
    { value: "intraoral_imaging", label: "Intraoral imaging / x-rays" },
  ],
  associate_dentist: [
    { value: "crown_bridge", label: "Crown & bridge" },
    { value: "molar_endo", label: "Molar endo" },
    { value: "surgical_ext", label: "Surgical extractions" },
    { value: "implant_place", label: "Implant placement" },
    { value: "implant_restore", label: "Implant restoration" },
    { value: "clear_aligners", label: "Clear aligners" },
    { value: "removable_pros", label: "Removable prosthodontics" },
    { value: "pediatric", label: "Pediatric dentistry" },
    { value: "oral_surgery", label: "Oral surgery" },
  ],
  specialist_dentist: [
    { value: "crown_bridge", label: "Crown & bridge" },
    { value: "molar_endo", label: "Molar endo" },
    { value: "surgical_ext", label: "Surgical extractions" },
    { value: "implant_place", label: "Implant placement" },
    { value: "implant_restore", label: "Implant restoration" },
    { value: "clear_aligners", label: "Clear aligners" },
    { value: "sedation", label: "Sedation" },
    { value: "oral_surgery", label: "Oral surgery" },
  ],
  // NOTE: keyed by the CANDIDATE canonical role value ("assistant"), which is
  // what the assessment wizard looks up — NOT the job-side "dental_assistant"
  // vocabulary. Mismatch here left the Dental Assistant procedure picker empty.
  assistant: [
    { value: "four_handed", label: "4-handed dentistry" },
    { value: "radiographs", label: "Radiographs" },
    { value: "temporaries", label: "Temporaries" },
    { value: "impressions_scan", label: "Impressions / intraoral scanning" },
    { value: "coronal_polish", label: "Coronal polish" },
    { value: "sterilization", label: "Sterilization & infection control" },
    { value: "expanded_functions", label: "Expanded functions (EFDA)" },
  ],
};

/** Canonical candidate roles (matches the profile + scoring engine). */
export const ROLE_OPTIONS: AssessmentOption[] = ROLE_CATEGORIES.map((r) => ({
  value: r.value,
  label: r.label,
}));

/* ──────────────────────────────────────────────────────────────
 * v3.1 (2026-06-05) — question-bank expansion option lists.
 *
 * All pure config (no schema). Each new question stores to a candidate
 * signal column; the genuinely-new dimensions (deal_breakers, benefits,
 * patient_population, team_size) stay UNSCORED until a practice-profile
 * mirror exists — exactly like the Phase B.1 culture dims started. PMS
 * proficiency piggybacks the existing pms_fluency dim (no engine change).
 * ─────────────────────────────────────────────────────────── */

/**
 * Curated ALLOWLIST of deal-breakers (HARD RULE: allowlist-only, and selecting
 * one NEVER auto-hides a job — purely a signal we surface to the candidate +
 * employer). Working-condition items only; deliberately excludes anything tied
 * to patient demographics or protected characteristics.
 */
export const DEAL_BREAKER_OPTIONS: AssessmentOption[] = [
  { value: "benefits_required", label: "Must offer health benefits" },
  { value: "no_nights", label: "No required nights" },
  { value: "no_weekends", label: "No required weekends" },
  { value: "four_day_week", label: "4-day work week" },
  { value: "commute_cap", label: "Within my commute limit" },
  { value: "modern_tech", label: "Modern / digital workflow" },
  { value: "no_quota_pressure", label: "No production-quota pressure" },
  { value: "guaranteed_base", label: "Guaranteed base pay" },
];

/**
 * Short curated benefits list for the "which benefits matter most" chip
 * question. The full canonical BENEFITS list (~28) is too long to tap through;
 * this is the high-signal subset candidates actually weigh a role on.
 */
export const BENEFIT_PRIORITY_OPTIONS: AssessmentOption[] = [
  { value: "health", label: "Health insurance" },
  { value: "retirement_match", label: "401(k) match" },
  { value: "pto", label: "Generous PTO" },
  { value: "ce_allowance", label: "CE allowance" },
  { value: "bonus", label: "Production / sign-on bonus" },
  { value: "loan_repayment", label: "Student-loan help" },
  { value: "flex_schedule", label: "Flexible schedule" },
  { value: "partnership", label: "Equity / partnership track" },
];

/** Day-to-day team size the candidate wants around them. */
export const TEAM_SIZE_OPTIONS: AssessmentOption[] = [
  { value: "solo", label: "Solo or 1–2 chairs" },
  { value: "small", label: "A handful (3–6)" },
  { value: "large", label: "Big team (7+)" },
  { value: "any", label: "No preference" },
];

/**
 * PMS proficiency — a depth signal on top of the *which systems* multi-select.
 * Every option is positive; "newer to PMS" is first-class (adaptability is a
 * plus, never a penalty), mirroring the engine's denominator rule.
 */
export const PMS_PROFICIENCY_OPTIONS: AssessmentOption[] = [
  { value: "power", label: "Power user — I train others" },
  { value: "confident", label: "Confident in my main system" },
  { value: "adaptable", label: "Comfortable — I pick up new ones fast" },
  { value: "learning", label: "Newer to PMS — happy to learn" },
];

/** Patient populations the candidate most enjoys / wants to work with. */
export const PATIENT_POPULATION_OPTIONS: AssessmentOption[] = [
  { value: "pediatric", label: "Kids / pediatric" },
  { value: "geriatric", label: "Older adults" },
  { value: "special_needs", label: "Special-needs patients" },
  { value: "anxious", label: "Anxious / phobic patients" },
  { value: "cosmetic", label: "Cosmetic-focused" },
  { value: "underserved", label: "Underserved / community health" },
  { value: "all", label: "I enjoy all populations" },
];

/** The full ordered question list. The wizard sections + role-gates from this. */
export const ASSESSMENT_QUESTIONS: AssessmentQuestion[] = [
  // ── PART 1 — basics (résumé-prefilled) ──
  {
    key: "desired_roles",
    section: "basics",
    dimension: "role_fit",
    prompt: "What role(s) are you looking for?",
    type: "multi",
    options: ROLE_OPTIONS,
    resumePrefill: true,
  },
  {
    key: "years_experience",
    section: "basics",
    dimension: "years_experience",
    prompt: "How long have you been in dental?",
    type: "single",
    options: [
      { value: "new_grad", label: "New grad / entering dental" },
      { value: "lt2", label: "Less than 2 years" },
      { value: "2_5", label: "2–5 years" },
      { value: "6_10", label: "6–10 years" },
      { value: "10_plus", label: "10+ years" },
    ],
    resumePrefill: true,
  },
  {
    key: "desired_specialty",
    section: "basics",
    dimension: "specialty",
    prompt: "Specialty or focus areas?",
    type: "multi",
    options: SPECIALTIES.map((s) => ({ value: s.value, label: s.label })),
    resumePrefill: true,
  },
  {
    key: "pms_systems",
    section: "basics",
    dimension: "pms_fluency",
    prompt: "Practice-management software you know",
    help: "Pick any you've used. New to dental? Leave it blank — no penalty.",
    type: "multi",
    options: PMS_SYSTEMS.map((p) => ({ value: p.value, label: p.label })),
    resumePrefill: true,
  },
  {
    key: "pms_proficiency",
    section: "basics",
    dimension: "pms_fluency",
    prompt: "How deep does your software know-how go?",
    help: "New to dental software? Pick the last option — adaptability counts, never a penalty.",
    type: "single",
    options: PMS_PROFICIENCY_OPTIONS,
  },

  // ── PART 2A — how you like to work (always asked) ──
  {
    key: "work_pace",
    section: "work_style",
    dimension: "work_pace",
    prompt: "What pace brings out your best?",
    type: "single",
    options: [
      { value: "high_volume", label: "High-volume, fast-moving" },
      { value: "steady", label: "Steady and balanced" },
      { value: "thorough", label: "Unhurried and thorough" },
    ],
  },
  {
    key: "autonomy_pref",
    section: "work_style",
    dimension: "autonomy",
    prompt: "How much autonomy do you want?",
    type: "single",
    options: [
      { value: "autonomy", label: "Trust me to run my own chair/desk" },
      { value: "balance", label: "A balance" },
      { value: "structure", label: "Clear protocols + close support" },
    ],
  },
  {
    key: "patient_facing_energy",
    section: "work_style",
    dimension: "patient_facing",
    prompt: "Patient interaction energizes me.",
    type: "slider",
    // #96 (Day 28) — anchors now read as opposite poles of the stem so the
    // slider is coherent (was "I prefer clinical focus" vs "I love it", which
    // didn't complete the sentence). Still captures the clinical-vs-people
    // signal the patient_facing dimension scores.
    sliderLabels: { low: "I'd rather focus on the work", high: "It's the best part of my day" },
  },
  {
    key: "mentorship_pref",
    section: "work_style",
    dimension: "mentorship",
    prompt: "On mentorship, I'm looking for…",
    type: "single",
    options: [
      { value: "strong", label: "Strong mentorship + coaching" },
      { value: "occasional", label: "Occasional guidance" },
      { value: "independent", label: "Full independence" },
    ],
  },

  // ── PART 2B — clinical depth (clinical roles only) ──
  {
    key: "procedures_confident",
    section: "clinical",
    dimension: "procedures_confidence",
    prompt: "Procedures you're confident doing solo",
    help: "Pick all that apply — it's how practices match you to the right cases.",
    type: "multi",
    clinicalOnly: true,
  },
  {
    key: "procedures_growth",
    section: "clinical",
    dimension: "procedures_confidence",
    prompt: "Procedures you'd like to grow into",
    help: "Totally fine to leave blank — this just helps us find roles with the right mentorship.",
    type: "multi",
    clinicalOnly: true,
    optional: true,
  },

  // ── PART 2C — culture & environment (always asked) ──
  {
    key: "practice_feel",
    section: "culture",
    dimension: "practice_feel",
    prompt: "Where do you thrive?",
    type: "single",
    options: [
      { value: "private", label: "Tight-knit, private-practice feel" },
      { value: "midsize", label: "Mid-size, collaborative group" },
      { value: "large", label: "Large team with lots of resources" },
      { value: "any", label: "No preference" },
    ],
  },
  {
    key: "ce_growth_importance",
    section: "culture",
    dimension: "ce_growth",
    prompt: "Growth and continuing education matter to me.",
    type: "slider",
    sliderLabels: { low: "Not a priority", high: "Very important" },
  },
  {
    key: "work_life_priority",
    section: "culture",
    dimension: "work_life",
    prompt: "A predictable schedule and work-life balance is a top priority.",
    type: "slider",
    sliderLabels: { low: "I'll flex", high: "Top priority" },
  },
  {
    key: "career_trajectory",
    section: "culture",
    dimension: "career_trajectory",
    prompt: "In 2–3 years I want to…",
    type: "single",
    options: [
      { value: "grow", label: "Grow into a lead / OM / specialist / owner" },
      { value: "ic", label: "Keep doing what I love as an individual contributor" },
      { value: "unsure", label: "Still figuring it out" },
    ],
  },
  {
    key: "team_size_pref",
    section: "culture",
    dimension: "team_size",
    prompt: "Day-to-day, how big a team do you want around you?",
    type: "single",
    options: TEAM_SIZE_OPTIONS,
  },
  {
    key: "patient_population_pref",
    section: "culture",
    dimension: "patient_population",
    prompt: "Which patients do you most enjoy caring for?",
    help: "Pick any that fit — “I enjoy all populations” is a perfectly strong answer.",
    type: "multi",
    options: PATIENT_POPULATION_OPTIONS,
  },

  // ── PART 2D — logistics & what matters most ──
  {
    key: "commute_max_minutes",
    section: "logistics",
    dimension: "commute_tolerance",
    prompt: "Max one-way commute?",
    type: "single",
    options: [
      { value: "15", label: "≤ 15 min" },
      { value: "30", label: "≤ 30 min" },
      { value: "45", label: "≤ 45 min" },
      { value: "60", label: "≤ 60 min" },
      { value: "61", label: "60+ min / flexible" },
    ],
  },
  {
    key: "temp_or_perm",
    section: "logistics",
    dimension: "employment_type",
    prompt: "What kind of engagement?",
    type: "single",
    options: [
      { value: "perm", label: "Permanent / W-2" },
      { value: "temp", label: "Temp / contract / PRN" },
      { value: "either", label: "Either" },
    ],
    resumePrefill: true,
  },
  {
    key: "comp_priorities",
    section: "logistics",
    dimension: "comp_priority",
    prompt: "What matters most in your next role?",
    help: "Tap your top 3, in order — your #1 carries the most weight in your matches.",
    type: "rank",
    options: [
      { value: "comp", label: "Compensation" },
      { value: "schedule", label: "Schedule & balance" },
      { value: "culture", label: "Culture & team" },
      { value: "growth", label: "Growth & learning" },
      { value: "location", label: "Location / commute" },
    ],
  },
  {
    key: "benefit_priorities",
    section: "logistics",
    dimension: "benefits",
    prompt: "Which benefits matter most to you?",
    help: "Tap any that move the needle — helps us surface roles that actually offer them.",
    type: "multi",
    options: BENEFIT_PRIORITY_OPTIONS,
  },
  {
    key: "deal_breakers",
    section: "logistics",
    dimension: "deal_breakers",
    prompt: "Any hard deal-breakers?",
    help: "Tap any that apply. We'll flag how roles stack up — we never auto-hide jobs from you.",
    type: "multi",
    options: DEAL_BREAKER_OPTIONS,
    optional: true,
  },
  {
    key: "min_salary",
    section: "logistics",
    dimension: "compensation",
    prompt: "Your compensation floor",
    help: "The minimum you'd consider — kept private, used only to filter out low offers.",
    type: "salary",
    resumePrefill: true,
  },
  {
    key: "relocation",
    section: "logistics",
    dimension: "location",
    prompt: "Open to relocating for the right role?",
    type: "single",
    options: [
      { value: "no", label: "No" },
      { value: "right_role", label: "For the right role" },
      { value: "actively", label: "Actively looking to move" },
    ],
  },
  {
    key: "availability",
    section: "logistics",
    dimension: "availability",
    prompt: "When could you start?",
    type: "single",
    options: [
      { value: "immediate", label: "Immediately" },
      { value: "2_weeks", label: "Within 2 weeks" },
      { value: "1_month", label: "Within a month" },
      { value: "passive", label: "Just exploring" },
    ],
  },

  // ── PART 2E — the one optional open box ──
  {
    key: "assessment_note",
    section: "open",
    dimension: "none",
    prompt: "Anything you'd want a practice to know about you?",
    help: "Optional — shown to employers in your own words.",
    type: "text",
    optional: true,
  },
];

/**
 * The questions a given candidate sees: drop clinical-depth items for
 * non-clinical roles. (Résumé-prefill confirmation is handled in the wizard.)
 */
export function questionsForRoles(
  roleValues: string[]
): AssessmentQuestion[] {
  const isClinical = roleValues.some((r) =>
    (CLINICAL_ROLES as readonly string[]).includes(r)
  );
  return ASSESSMENT_QUESTIONS.filter((q) => !q.clinicalOnly || isClinical);
}
