/**
 * Curated screening question library for the DSO Hire job posting wizard.
 *
 * Pure data — no DB rows, no async. Maps role_category (matches
 * ROLE_OPTIONS in src/app/employer/jobs/job-wizard.tsx) → a recommended
 * starter set of screening questions.
 *
 * Sourced from a competitor benchmark pass (Indeed, Workable, JazzHR,
 * Greenhouse, Built In, Hireology, plus dental-vertical players DentalPost
 * and DentalWorkers) and dental hiring best practices.
 *
 * The wizard surfaces these above the empty "add a question" UI so
 * employers can one-click add, customize, or skip each one.
 *
 *   - knockout=true → flagged in the UI as a disqualifying filter; reserved
 *     for license/right-to-work essentials. Most questions are informational.
 *   - rationale     → ~1 sentence shown under each card to help the employer
 *     decide whether the question fits their funnel.
 */

import type { ScreeningQuestionKind } from "@/app/employer/jobs/job-wizard";

export interface RecommendedOption {
  id: string;
  label: string;
}

export interface RecommendedQuestion {
  /** Stable slug — used as a key when accepting/skipping in the wizard. */
  id: string;
  prompt: string;
  helper_text?: string;
  kind: ScreeningQuestionKind;
  options?: RecommendedOption[];
  required: boolean;
  /**
   * Knockout disqualifier — true only when a "wrong" answer means the
   * candidate cannot do the job at all (no license, can't legally work).
   * Visual badge in the wizard; not auto-rejection at the data layer.
   */
  knockout?: boolean;
  rationale: string;
}

export interface RoleCategoryRecommendation {
  /** Human-friendly role name shown in the panel header. */
  label: string;
  questions: RecommendedQuestion[];
}

/* ─────────────────────────────────────────────────────────────────
 * Shared option sets
 * ────────────────────────────────────────────────────────────────*/

const YEARS_OPTIONS: RecommendedOption[] = [
  { id: "yrs_0_1", label: "Less than 1 year" },
  { id: "yrs_1_3", label: "1–3 years" },
  { id: "yrs_3_5", label: "3–5 years" },
  { id: "yrs_5_10", label: "5–10 years" },
  { id: "yrs_10p", label: "10+ years" },
];

const SCHEDULE_OPTIONS: RecommendedOption[] = [
  { id: "sched_ft", label: "Full-time" },
  { id: "sched_pt", label: "Part-time" },
  { id: "sched_prn", label: "PRN / per diem" },
  { id: "sched_locum", label: "Locum / contract" },
  { id: "sched_flex", label: "Flexible — open to options" },
];

const PMS_OPTIONS: RecommendedOption[] = [
  { id: "pms_dentrix", label: "Dentrix" },
  { id: "pms_eaglesoft", label: "Eaglesoft" },
  { id: "pms_open_dental", label: "Open Dental" },
  { id: "pms_curve", label: "Curve Dental" },
  { id: "pms_carestack", label: "CareStack" },
  { id: "pms_denticon", label: "Denticon" },
  { id: "pms_other", label: "Other / none" },
];

/* ─────────────────────────────────────────────────────────────────
 * Universal / fallback questions
 * ────────────────────────────────────────────────────────────────*/

const UNIVERSAL_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "univ_right_to_work",
    prompt:
      "Are you legally authorized to work in the United States without sponsorship?",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Knockout filter required by federal hiring rules — flags candidates who would need visa sponsorship.",
  },
  {
    id: "univ_start_date",
    prompt: "What is your earliest available start date?",
    kind: "short_text",
    helper_text: "A rough month is fine — e.g. 'Mid-July 2026'.",
    required: false,
    rationale:
      "Lets you flag candidates who can fill the chair on your timeline vs. those still locked into notice periods.",
  },
  {
    id: "univ_comp_expectations",
    prompt: "What are your compensation expectations for this role?",
    helper_text: "Hourly rate, daily rate, or annual — whichever fits.",
    kind: "short_text",
    required: false,
    rationale:
      "Surfaces budget mismatches early so neither side wastes interviews.",
  },
  {
    id: "univ_relocation",
    prompt: "Will you need to relocate to take this position?",
    kind: "yes_no",
    required: false,
    rationale:
      "Helps you weigh time-to-start risk and whether to consider a relocation stipend.",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Dentist (Associate / DDS / DMD)
 * ────────────────────────────────────────────────────────────────*/

const DENTIST_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "dds_license_state",
    prompt:
      "Do you hold an active dental license in the state(s) where this position is located?",
    helper_text:
      "If you hold a license in a neighboring state and would need to apply, answer No and we'll follow up.",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Knockout filter — an unlicensed dentist can't legally see patients on day one.",
  },
  {
    id: "dds_years_experience",
    prompt: "How many years have you practiced as a licensed dentist?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Standardized buckets make it easy to filter the inbox to your seniority target.",
  },
  {
    id: "dds_specialty",
    prompt: "Which best describes your clinical focus?",
    kind: "single_select",
    options: [
      { id: "spec_general", label: "General dentistry" },
      { id: "spec_pedo", label: "Pediatric" },
      { id: "spec_endo", label: "Endodontics" },
      { id: "spec_perio", label: "Periodontics" },
      { id: "spec_pros", label: "Prosthodontics" },
      { id: "spec_ortho", label: "Orthodontics" },
      { id: "spec_oms", label: "Oral & maxillofacial surgery" },
      { id: "spec_other", label: "Other / multi-discipline" },
    ],
    required: false,
    rationale:
      "Helps you route specialty applicants to the right opening when you run multiple jobs.",
  },
  {
    id: "dds_dea",
    prompt: "Do you currently hold an active DEA registration?",
    kind: "yes_no",
    required: false,
    rationale:
      "Useful for offices that prescribe controlled substances — flags candidates who'll need to apply.",
  },
  {
    id: "dds_malpractice",
    prompt: "Have you ever had a malpractice claim or board action against you?",
    helper_text:
      "Disclosure here is informational — we follow up on context during interviews.",
    kind: "yes_no",
    required: false,
    rationale:
      "Standard pre-credentialing disclosure; surfaces context you'd otherwise discover in background check.",
  },
  {
    id: "dds_clinical_skills",
    prompt:
      "Which of the following procedures are you comfortable performing without supervision?",
    kind: "multi_select",
    options: [
      { id: "skill_extractions", label: "Routine extractions" },
      { id: "skill_surgical_ext", label: "Surgical extractions" },
      { id: "skill_endo_anterior", label: "Endo — anterior" },
      { id: "skill_endo_molar", label: "Endo — molar" },
      { id: "skill_implants_place", label: "Implant placement" },
      { id: "skill_implants_restore", label: "Implant restoration" },
      { id: "skill_clear_aligners", label: "Clear aligners" },
      { id: "skill_pedo", label: "Pediatric treatment" },
      { id: "skill_iv_sedation", label: "IV sedation" },
    ],
    required: false,
    rationale:
      "Lets you match procedural mix to your practice's case load instead of relying on resume keywords.",
  },
  {
    id: "dds_schedule_preference",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Filters out candidates whose desired schedule doesn't match the chair you're hiring for.",
  },
  {
    id: "dds_comp_expectations",
    prompt: "What is your target compensation structure for this role?",
    helper_text:
      "Daily guarantee, percentage of production/collections, base salary, or a mix — whatever fits how you think about pay.",
    kind: "long_text",
    required: false,
    rationale:
      "Open-ended on purpose — dentist comp is rarely a single number; you want their full ask up front.",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Hygienist (RDH)
 * ────────────────────────────────────────────────────────────────*/

const HYGIENIST_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "rdh_license_state",
    prompt:
      "Do you hold an active dental hygiene license in the state(s) where this position is located?",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Knockout filter — RDHs need state licensure to perform any clinical work.",
  },
  {
    id: "rdh_years_experience",
    prompt: "How many years have you practiced as a licensed hygienist?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Easy way to sort the inbox by experience tier without parsing resumes.",
  },
  {
    id: "rdh_local_anesthesia",
    prompt: "Are you certified to administer local anesthesia in your state?",
    kind: "yes_no",
    required: false,
    rationale:
      "Local-anesthesia-certified hygienists are scarcer and command higher pay — worth flagging up front.",
  },
  {
    id: "rdh_expanded_functions",
    prompt: "Which expanded-function certifications do you currently hold?",
    kind: "multi_select",
    options: [
      { id: "ef_local_anesthesia", label: "Local anesthesia" },
      { id: "ef_nitrous", label: "Nitrous oxide monitoring" },
      { id: "ef_restorative", label: "Restorative functions" },
      { id: "ef_laser", label: "Laser certification" },
      { id: "ef_perio_therapy", label: "Advanced periodontal therapy" },
      { id: "ef_none", label: "None of the above" },
    ],
    required: false,
    rationale:
      "Tells you whether you can flex this hire into more advanced procedures or need to stick to prophy.",
  },
  {
    id: "rdh_schedule_preference",
    prompt: "What schedule works best for you?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Hygiene schedules are often the make-or-break criterion — filter early.",
  },
  {
    id: "rdh_comp_expectations",
    prompt: "What hourly or daily rate are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Hygienist pay varies wildly by metro; surfacing the ask early avoids interview-stage surprises.",
  },
  {
    id: "rdh_pms_experience",
    prompt: "Which practice management software have you used?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Reduces ramp time when the candidate already knows your stack.",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Dental Assistant
 * ────────────────────────────────────────────────────────────────*/

const DENTAL_ASSISTANT_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "da_radiology",
    prompt:
      "Are you certified to take dental radiographs in the state where this position is located?",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Most states require radiology certification before a DA can shoot x-rays — knockout filter.",
  },
  {
    id: "da_years_experience",
    prompt: "How many years have you worked as a dental assistant?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Standard experience filter; keeps the candidate pool sortable.",
  },
  {
    id: "da_certifications",
    prompt: "Which certifications do you hold?",
    kind: "multi_select",
    options: [
      { id: "cert_efda", label: "EFDA / expanded functions" },
      { id: "cert_cda", label: "CDA (DANB)" },
      { id: "cert_radiology", label: "Radiology" },
      { id: "cert_coronal", label: "Coronal polishing" },
      { id: "cert_sealants", label: "Sealants" },
      { id: "cert_cpr", label: "CPR / BLS (current)" },
      { id: "cert_none", label: "None of the above" },
    ],
    required: false,
    rationale:
      "EFDA-certified assistants can handle expanded duties — often a meaningful productivity lift.",
  },
  {
    id: "da_chairside_skills",
    prompt: "Which areas are you comfortable assisting in?",
    kind: "multi_select",
    options: [
      { id: "asst_general", label: "General / restorative" },
      { id: "asst_oral_surgery", label: "Oral surgery" },
      { id: "asst_endo", label: "Endodontics" },
      { id: "asst_perio", label: "Periodontics" },
      { id: "asst_ortho", label: "Orthodontics" },
      { id: "asst_pedo", label: "Pediatrics" },
      { id: "asst_implants", label: "Implant procedures" },
    ],
    required: false,
    rationale:
      "Helps match candidates to your specialty mix — important for multi-doc and group practices.",
  },
  {
    id: "da_schedule_preference",
    prompt: "What schedule are you looking for?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Assistants are often hired for specific shifts; surface schedule mismatches up front.",
  },
  {
    id: "da_comp_expectations",
    prompt: "What hourly rate are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Avoids the awkward interview where your offer is $4 below their floor.",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Front Office / Receptionist
 * ────────────────────────────────────────────────────────────────*/

const FRONT_OFFICE_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "fo_pms_experience",
    prompt: "Which practice management software have you used at the front desk?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Front desk hires that already know your PMS ramp 3x faster — high-signal filter.",
  },
  {
    id: "fo_years_experience",
    prompt: "How many years of dental front-office experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Distinguishes career front-desk hires from candidates pivoting in from general admin.",
  },
  {
    id: "fo_insurance_verification",
    prompt:
      "Are you experienced verifying dental insurance benefits and submitting claims?",
    kind: "yes_no",
    required: false,
    rationale:
      "Insurance verification skill is the #1 differentiator between dental front desk and generic receptionist work.",
  },
  {
    id: "fo_responsibilities",
    prompt: "Which front-office tasks have you owned?",
    kind: "multi_select",
    options: [
      { id: "fo_scheduling", label: "Scheduling & confirmations" },
      { id: "fo_check_in", label: "Patient check-in / check-out" },
      { id: "fo_payments", label: "Payment collection" },
      { id: "fo_treatment_plans", label: "Treatment plan presentation" },
      { id: "fo_insurance_verify", label: "Insurance verification" },
      { id: "fo_claims", label: "Claims submission & follow-up" },
      { id: "fo_recall", label: "Recall / reactivation" },
      { id: "fo_new_patient", label: "New patient intake calls" },
    ],
    required: false,
    rationale:
      "Front-desk roles vary — pinpoint exactly which functions the candidate has owned.",
  },
  {
    id: "fo_schedule_preference",
    prompt: "What schedule are you looking for?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Saturday and evening coverage is the front-desk hiring blocker — surface availability now.",
  },
  {
    id: "fo_comp_expectations",
    prompt: "What hourly rate are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Open-ended; pay variance across metros is wide and you want the candidate's actual ask.",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Office Manager
 * ────────────────────────────────────────────────────────────────*/

const OFFICE_MANAGER_QUESTIONS: RecommendedQuestion[] = [
  {
    id: "om_years_experience",
    prompt: "How many years of dental office management experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Differentiates first-time managers from seasoned multi-location operators.",
  },
  {
    id: "om_team_size",
    prompt: "What is the largest team size you've directly managed?",
    kind: "single_select",
    options: [
      { id: "team_1_5", label: "1–5 people" },
      { id: "team_6_10", label: "6–10 people" },
      { id: "team_11_20", label: "11–20 people" },
      { id: "team_21_50", label: "21–50 people" },
      { id: "team_50p", label: "50+ people" },
    ],
    required: false,
    rationale:
      "Span of control is the single biggest predictor of OM readiness for a multi-op practice.",
  },
  {
    id: "om_responsibilities",
    prompt: "Which areas have you owned in a previous OM role?",
    kind: "multi_select",
    options: [
      { id: "om_pl", label: "P&L / financial reporting" },
      { id: "om_payroll", label: "Payroll administration" },
      { id: "om_hr", label: "Hiring, onboarding, performance" },
      { id: "om_scheduling", label: "Provider scheduling" },
      { id: "om_insurance", label: "Insurance / billing oversight" },
      { id: "om_compliance", label: "OSHA / HIPAA compliance" },
      { id: "om_marketing", label: "Local marketing & reactivation" },
      { id: "om_kpis", label: "KPI tracking & ops reviews" },
    ],
    required: false,
    rationale:
      "OM scope varies by practice — match the candidate's owned functions to what you actually need.",
  },
  {
    id: "om_pms_experience",
    prompt: "Which practice management software are you fluent in?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "OM fluency in your PMS shortens ramp from months to weeks.",
  },
  {
    id: "om_kpis",
    prompt:
      "Which KPIs have you been responsible for hitting in a previous role?",
    helper_text:
      "Examples: production per provider, collections %, hygiene re-care rate, treatment acceptance.",
    kind: "long_text",
    required: false,
    rationale:
      "Long-form answer surfaces whether the candidate thinks like an operator or a coordinator.",
  },
  {
    id: "om_comp_expectations",
    prompt: "What is your target base salary or salary + bonus structure?",
    kind: "short_text",
    required: false,
    rationale:
      "OM comp is highly variable by region and practice size — get the ask up front.",
  },
  {
    id: "om_start_date",
    prompt: "What's your earliest available start date?",
    helper_text:
      "Most OM hires need to give 2–4 weeks notice; rough month is fine.",
    kind: "short_text",
    required: false,
    rationale:
      "OM transitions take longer than chair-side roles; plan around their notice period.",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Public map
 * ────────────────────────────────────────────────────────────────*/

/**
 * Keys match `role_category` values from ROLE_OPTIONS in
 * src/app/employer/jobs/job-wizard.tsx. Practice-owner-style values
 * (`regional_manager`) intentionally fall through to the universal set —
 * those candidates are rare on a job board.
 */
export const ROLE_RECOMMENDATIONS: Record<string, RoleCategoryRecommendation> = {
  dentist: {
    label: "Dentist",
    questions: DENTIST_QUESTIONS,
  },
  specialist: {
    label: "Specialist Dentist",
    questions: DENTIST_QUESTIONS,
  },
  dental_hygienist: {
    label: "Dental Hygienist",
    questions: HYGIENIST_QUESTIONS,
  },
  dental_assistant: {
    label: "Dental Assistant",
    questions: DENTAL_ASSISTANT_QUESTIONS,
  },
  front_office: {
    label: "Front Office",
    questions: FRONT_OFFICE_QUESTIONS,
  },
  office_manager: {
    label: "Office Manager",
    questions: OFFICE_MANAGER_QUESTIONS,
  },
};

export const UNIVERSAL_RECOMMENDATIONS: RoleCategoryRecommendation = {
  label: "this role",
  questions: UNIVERSAL_QUESTIONS,
};

/**
 * Returns the recommended set for a role_category, falling back to the
 * universal set when the category isn't curated (e.g. `regional_manager`,
 * `other`).
 */
export function getRecommendationsForRole(
  roleCategory: string | null | undefined
): RoleCategoryRecommendation {
  if (!roleCategory) return UNIVERSAL_RECOMMENDATIONS;
  return ROLE_RECOMMENDATIONS[roleCategory] ?? UNIVERSAL_RECOMMENDATIONS;
}
