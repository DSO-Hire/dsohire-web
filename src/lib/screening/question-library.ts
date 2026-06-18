/**
 * Curated screening question library for the DSO Hire job posting wizard.
 *
 * Pure data — no DB rows, no async. Maps role_category (matches
 * ROLE_OPTIONS in src/app/employer/jobs/job-wizard.tsx) → a recommended
 * starter set of screening questions, organized by category.
 *
 * Sourced from a competitor benchmark pass across major dental ATS
 * platforms, DSO career sites, generalist job boards (Indeed,
 * Workable, Hireology, Glassdoor), and dental-practice-management
 * publications, plus dental hiring best practices.
 *
 * The wizard surfaces these above the empty "add a question" UI so
 * employers can one-click add, customize, or skip each one. The panel
 * groups questions by `category` so an employer scanning the list sees
 * Qualifications → Experience → Skills → Logistics → Comp → Fit in a
 * predictable order.
 *
 *   - knockout=true → flagged in the UI as a disqualifying filter; reserved
 *     for license/right-to-work essentials. Most questions are informational.
 *   - rationale     → ~1 sentence shown under each card to help the employer
 *     decide whether the question fits their funnel.
 *   - category      → drives sectioning in the panel. Every question must
 *     be tagged.
 */

import type { ScreeningQuestionKind } from "@/app/employer/(app)/jobs/job-wizard";

export interface RecommendedOption {
  id: string;
  label: string;
}

export type QuestionCategory =
  | "qualification"
  | "experience"
  | "skills"
  | "logistics"
  | "compensation"
  | "fit";

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  qualification: "Qualifications & licensing",
  experience: "Experience",
  skills: "Skills & specializations",
  logistics: "Schedule & logistics",
  compensation: "Compensation",
  fit: "Fit & open-ended",
};

export const CATEGORY_ORDER: QuestionCategory[] = [
  "qualification",
  "experience",
  "skills",
  "logistics",
  "compensation",
  "fit",
];

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
  /** Drives section grouping in the recommended-questions panel. */
  category: QuestionCategory;
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

const SPECIALTY_OPTIONS: RecommendedOption[] = [
  { id: "spec_ortho", label: "Orthodontics" },
  { id: "spec_endo", label: "Endodontics" },
  { id: "spec_perio", label: "Periodontics" },
  { id: "spec_pros", label: "Prosthodontics" },
  { id: "spec_oms", label: "Oral & maxillofacial surgery" },
  { id: "spec_pedo", label: "Pediatric dentistry" },
  { id: "spec_oral_path", label: "Oral pathology / oral medicine" },
  { id: "spec_radiology", label: "Oral & maxillofacial radiology" },
  { id: "spec_public", label: "Dental public health" },
  { id: "spec_anesthesia", label: "Dental anesthesiology" },
];

const KPI_OPTIONS: RecommendedOption[] = [
  { id: "kpi_production", label: "Production per provider" },
  { id: "kpi_collections", label: "Collections %" },
  { id: "kpi_treatment_acceptance", label: "Treatment plan acceptance" },
  { id: "kpi_recare", label: "Hygiene re-care rate" },
  { id: "kpi_ar_aging", label: "A/R aging" },
  { id: "kpi_new_patients", label: "New patients / month" },
  { id: "kpi_no_show", label: "No-show / cancellation rate" },
  { id: "kpi_overhead", label: "Overhead %" },
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
    category: "qualification",
  },
  {
    id: "univ_years_dental",
    prompt: "How many total years have you worked in the dental industry?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Quick experience filter that works regardless of the specific role you're hiring for.",
    category: "experience",
  },
  {
    id: "univ_schedule_preference",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Schedule mismatch is the #1 reason interviews go nowhere — surface it first.",
    category: "logistics",
  },
  {
    id: "univ_start_date",
    prompt: "What is your earliest available start date?",
    helper_text: "A rough month is fine — e.g. 'Mid-July 2026'.",
    kind: "short_text",
    required: false,
    rationale:
      "Lets you flag candidates who can fill the chair on your timeline vs. those still locked into notice periods.",
    category: "logistics",
  },
  {
    id: "univ_relocation",
    prompt: "Will you need to relocate to take this position?",
    kind: "yes_no",
    required: false,
    rationale:
      "Helps you weigh time-to-start risk and whether to consider a relocation stipend.",
    category: "logistics",
  },
  {
    id: "univ_comp_expectations",
    prompt: "What are your compensation expectations for this role?",
    helper_text: "Hourly rate, daily rate, or annual — whichever fits.",
    kind: "short_text",
    required: false,
    rationale:
      "Surfaces budget mismatches early so neither side wastes interviews.",
    category: "compensation",
  },
  // #71 — slider ("drag") starters. Sliders shine for self-rated spectrums;
  // these mirror the PracticeFit assessment so the apply flow feels cohesive.
  {
    id: "univ_scale_patient_energy",
    prompt: "Patient interaction energizes me.",
    kind: "scale",
    options: [
      { id: "low", label: "I prefer clinical focus" },
      { id: "high", label: "I love it" },
    ],
    required: false,
    rationale:
      "A one-drag read on chairside temperament — great for patient-facing roles.",
    category: "fit",
  },
  {
    id: "univ_scale_pace",
    prompt: "What pace brings out your best?",
    kind: "scale",
    options: [
      { id: "low", label: "Steady & unhurried" },
      { id: "high", label: "High-volume & fast" },
    ],
    required: false,
    rationale:
      "Pace mismatch is a top driver of early turnover — surface it up front.",
    category: "fit",
  },
  {
    id: "univ_scale_autonomy",
    prompt: "How much autonomy do you want day-to-day?",
    kind: "scale",
    options: [
      { id: "low", label: "Clear protocols & support" },
      { id: "high", label: "Run my own chair" },
    ],
    required: false,
    rationale:
      "Reveals whether a candidate will thrive in your supervision style.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Associate Dentist (general practice)
 * ────────────────────────────────────────────────────────────────*/

const DENTIST_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
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
    category: "qualification",
  },
  // DEA-related screening question intentionally removed 2026-05-12 per
  // feedback_legal_shield_default_posture.md. DEA registration is
  // confirmed by the DSO directly at credentialing/onboarding, not at
  // the apply stage. Asking about it at apply intersects with ADA /
  // controlled-substance regulatory history concerns and isn't
  // collected by credible ATS competitors.
  {
    id: "dds_malpractice",
    prompt:
      "Have you ever had a malpractice claim or state dental board action against you?",
    helper_text:
      "Disclosure here is informational — we follow up on context during interviews.",
    kind: "yes_no",
    required: false,
    rationale:
      "Standard pre-credentialing disclosure; surfaces context you'd otherwise discover in background check.",
    category: "qualification",
  },
  // Experience
  {
    id: "dds_years_experience",
    prompt: "How many years have you practiced as a licensed dentist?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Standardized buckets make it easy to filter the inbox to your seniority target.",
    category: "experience",
  },
  {
    id: "dds_practice_setting",
    prompt: "Which practice settings have you worked in?",
    kind: "multi_select",
    options: [
      { id: "set_solo", label: "Solo / private practice" },
      { id: "set_group", label: "Small group practice" },
      { id: "set_dso", label: "DSO / multi-location group" },
      { id: "set_corp", label: "Corporate dental (e.g. retail-anchored)" },
      { id: "set_chc", label: "Community health center / FQHC" },
      { id: "set_residency", label: "GPR / AEGD residency" },
    ],
    required: false,
    rationale:
      "DSO-experienced associates ramp differently than solo-practice hires — useful filter for group operators.",
    category: "experience",
  },
  // Skills
  {
    id: "dds_clinical_skills",
    prompt:
      "Which procedures are you comfortable performing without supervision?",
    kind: "multi_select",
    options: [
      { id: "skill_extractions", label: "Routine extractions" },
      { id: "skill_surgical_ext", label: "Surgical extractions" },
      { id: "skill_endo_anterior", label: "Endo — anterior" },
      { id: "skill_endo_premolar", label: "Endo — premolar" },
      { id: "skill_endo_molar", label: "Endo — molar" },
      { id: "skill_implants_place", label: "Implant placement" },
      { id: "skill_implants_restore", label: "Implant restoration" },
      { id: "skill_clear_aligners", label: "Clear aligners (Invisalign / SureSmile)" },
      { id: "skill_pedo", label: "Pediatric treatment" },
      { id: "skill_iv_sedation", label: "IV sedation" },
      { id: "skill_oral_sedation", label: "Oral conscious sedation" },
    ],
    required: false,
    rationale:
      "Lets you match procedural mix to your practice's case load instead of relying on resume keywords.",
    category: "skills",
  },
  {
    id: "dds_pms_experience",
    prompt: "Which practice management software have you used?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "PMS familiarity shaves weeks off ramp time — high-signal filter for group practices.",
    category: "skills",
  },
  {
    id: "dds_avg_production",
    prompt: "What was your average daily production over the last 12 months?",
    helper_text:
      "Approximate is fine. We use this only to gauge fit with the chair — not as a hiring criterion.",
    kind: "short_text",
    required: false,
    rationale:
      "Production-history is a stronger predictor of new-chair productivity than years of experience.",
    category: "skills",
  },
  {
    id: "dds_aligners_implants_volume",
    prompt:
      "Roughly how many clear aligner cases and implant placements do you do per month?",
    helper_text:
      "Approximate — e.g. '4 aligners, 3 implants/mo'. Either zero is fine.",
    kind: "short_text",
    required: false,
    rationale:
      "Aligner and implant velocity is the highest-margin signal for a GP associate — sharper than 'years of experience'.",
    category: "skills",
  },
  // Logistics
  {
    id: "dds_schedule_preference",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Filters out candidates whose desired schedule doesn't match the chair you're hiring for.",
    category: "logistics",
  },
  {
    id: "dds_saturday",
    prompt: "Are you open to working Saturdays?",
    kind: "yes_no",
    required: false,
    rationale:
      "Saturday coverage is the most common associate hiring blocker — surface availability now.",
    category: "logistics",
  },
  // Compensation
  {
    id: "dds_comp_expectations",
    prompt: "What is your target compensation structure for this role?",
    helper_text:
      "Daily guarantee, percentage of production/collections, base salary, or a mix — whatever fits how you think about pay.",
    kind: "long_text",
    required: false,
    rationale:
      "Open-ended on purpose — dentist comp is rarely a single number; you want their full ask up front.",
    category: "compensation",
  },
  // Fit
  {
    id: "dds_treatment_philosophy",
    prompt:
      "Briefly describe your treatment-planning philosophy and how you approach patient case acceptance.",
    kind: "long_text",
    required: false,
    rationale:
      "Higher-signal than resume keywords for predicting how the candidate will fit your practice's clinical culture.",
    category: "fit",
  },
  {
    id: "dds_collaboration",
    prompt:
      "Are you comfortable working in a multi-doctor environment with shared patient panels and hygienist hand-offs?",
    kind: "yes_no",
    required: false,
    rationale:
      "Solo-practice associates sometimes struggle with shared schedules; this catches it before the interview.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Specialist Dentist (dedicated bank)
 * ────────────────────────────────────────────────────────────────*/

const SPECIALIST_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "spec_license_state",
    prompt:
      "Do you hold an active dental license in the state(s) where this position is located?",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Knockout filter — required to legally treat patients regardless of specialty.",
    category: "qualification",
  },
  {
    id: "spec_residency",
    prompt:
      "Have you completed an ADA/CODA-accredited residency in your specialty?",
    helper_text:
      "Include the program name and graduation year if comfortable — we may follow up.",
    kind: "yes_no",
    required: false,
    rationale:
      "CODA-accredited residency is the baseline credential for any recognized dental specialty.",
    category: "qualification",
  },
  {
    id: "spec_board_status",
    prompt: "What is your board-certification status?",
    kind: "single_select",
    options: [
      { id: "board_certified", label: "Board certified (active)" },
      { id: "board_eligible", label: "Board eligible (working toward)" },
      { id: "board_not_pursuing", label: "Not pursuing board certification" },
      { id: "board_na", label: "Not applicable for my specialty" },
    ],
    required: false,
    rationale:
      "Roughly 1 in 5 specialists complete board certification — meaningful filter when hiring against that bar.",
    category: "qualification",
  },
  // Experience
  {
    id: "spec_specialty_area",
    prompt: "Which specialty best describes your practice?",
    kind: "single_select",
    options: SPECIALTY_OPTIONS,
    required: true,
    rationale:
      "Routes the application to the right opening when you post for multiple specialty seats.",
    category: "experience",
  },
  {
    id: "spec_years_specialty",
    prompt: "Years practicing in your specialty since residency?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Specialist seniority drives both case complexity comfort and comp expectations.",
    category: "experience",
  },
  {
    id: "spec_fellowship",
    prompt:
      "Have you completed any post-residency fellowships or sub-specialty training?",
    helper_text:
      "Optional — list the program if comfortable (e.g. microsurgery, implant fellowship, craniofacial).",
    kind: "long_text",
    required: false,
    rationale:
      "Sub-specialty depth often justifies premium comp; surface it early.",
    category: "experience",
  },
  // Skills
  {
    id: "spec_case_volume",
    prompt: "What is your typical specialty case volume per month?",
    helper_text:
      "Approximate — e.g. ~80 endodontic cases/month or ~25 implant placements/month.",
    kind: "short_text",
    required: false,
    rationale:
      "Case volume is a sharper predictor of chair productivity than years of experience.",
    category: "skills",
  },
  {
    id: "spec_iv_sedation",
    prompt: "Are you credentialed to administer IV sedation or general anesthesia?",
    kind: "single_select",
    options: [
      { id: "sed_iv_full", label: "Yes — IV sedation permit, active" },
      { id: "sed_general", label: "Yes — general anesthesia permit, active" },
      { id: "sed_oral_only", label: "Oral conscious sedation only" },
      { id: "sed_none", label: "None" },
    ],
    required: false,
    rationale:
      "Sedation credentialing is the gating skill for most surgical-specialty roles.",
    category: "skills",
  },
  {
    id: "spec_hospital_privileges",
    prompt: "Do you currently hold hospital privileges?",
    kind: "yes_no",
    required: false,
    rationale:
      "Relevant for OMS, pediatric, and complex restorative roles where OR cases are part of the panel.",
    category: "skills",
  },
  {
    id: "spec_lab_relationships",
    prompt:
      "Do you have established lab relationships you'd want to bring with you?",
    helper_text:
      "Names optional — we just want to know if there's a lab transition to plan around.",
    kind: "long_text",
    required: false,
    rationale:
      "Specialty case quality depends heavily on lab continuity — a transition is often worth budgeting for.",
    category: "skills",
  },
  {
    id: "spec_imaging",
    prompt:
      "Which advanced imaging or specialty technology are you fluent with?",
    kind: "multi_select",
    options: [
      { id: "spec_cbct", label: "CBCT / 3D imaging" },
      { id: "spec_microscope", label: "Surgical operating microscope" },
      { id: "spec_guided_surgery", label: "Guided implant surgery" },
      { id: "spec_intraoral_scan", label: "Intraoral scanners (iTero / Trios / Primescan)" },
      { id: "spec_laser_surgical", label: "Surgical lasers" },
      { id: "spec_piezo", label: "Piezosurgery" },
    ],
    required: false,
    rationale:
      "Tech fluency narrows the gap between offer and full productivity — important for specialty seats.",
    category: "skills",
  },
  // Logistics
  {
    id: "spec_travel",
    prompt:
      "Are you open to travel between multiple locations as a traveling specialist?",
    kind: "yes_no",
    required: false,
    rationale:
      "Many DSO specialty roles are multi-office; this catches geography mismatch up front.",
    category: "logistics",
  },
  // Compensation
  {
    id: "spec_comp_expectations",
    prompt: "What is your target compensation structure for this role?",
    helper_text:
      "Daily guarantee, percentage of production/collections, base salary, or a mix.",
    kind: "long_text",
    required: false,
    rationale:
      "Specialist comp varies far more than associate comp — get the full ask in writing.",
    category: "compensation",
  },
  // Fit
  {
    id: "spec_mentorship",
    prompt:
      "Are you interested in mentoring associates on specialty cases inside the practice?",
    kind: "yes_no",
    required: false,
    rationale:
      "DSOs increasingly hire specialists who can lift the GP team's case mix — useful filter for that profile.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Hygienist (RDH)
 * ────────────────────────────────────────────────────────────────*/

const HYGIENIST_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "rdh_license_state",
    prompt:
      "Do you hold an active dental hygiene license in the state(s) where this position is located?",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Knockout filter — RDHs need state licensure to perform any clinical work.",
    category: "qualification",
  },
  {
    id: "rdh_local_anesthesia",
    prompt: "Are you certified to administer local anesthesia in your state?",
    kind: "yes_no",
    required: false,
    rationale:
      "Local-anesthesia-certified hygienists are scarcer and command higher pay — worth flagging up front.",
    category: "qualification",
  },
  {
    id: "rdh_expanded_certifications",
    prompt: "Which expanded-function certifications do you currently hold?",
    kind: "multi_select",
    options: [
      { id: "ef_local_anesthesia", label: "Local anesthesia" },
      { id: "ef_nitrous", label: "Nitrous oxide monitoring" },
      { id: "ef_restorative", label: "Restorative functions" },
      { id: "ef_laser", label: "Laser certification" },
      { id: "ef_perio_therapy", label: "Advanced periodontal therapy" },
      { id: "ef_sealants", label: "Sealant placement" },
      { id: "ef_cpr", label: "CPR / BLS (current)" },
      { id: "ef_none", label: "None of the above" },
    ],
    required: false,
    rationale:
      "Tells you whether you can flex this hire into more advanced procedures or need to stick to prophy.",
    category: "qualification",
  },
  // Experience
  {
    id: "rdh_years_experience",
    prompt: "How many years have you practiced as a licensed hygienist?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Easy way to sort the inbox by experience tier without parsing resumes.",
    category: "experience",
  },
  {
    id: "rdh_patient_volume",
    prompt: "Average patients you see per day in your current role?",
    kind: "single_select",
    options: [
      { id: "vol_lt6", label: "Fewer than 6" },
      { id: "vol_6_8", label: "6–8 patients" },
      { id: "vol_9_11", label: "9–11 patients" },
      { id: "vol_12p", label: "12 or more" },
    ],
    required: false,
    rationale:
      "Daily volume is a sharper predictor than years — flags candidates ready for high-throughput chairs.",
    category: "experience",
  },
  // Skills
  {
    id: "rdh_perio_depth",
    prompt:
      "How frequently do you perform scaling and root planing (SRP) in a typical week?",
    kind: "single_select",
    options: [
      { id: "srp_daily", label: "Multiple per day" },
      { id: "srp_weekly", label: "A few per week" },
      { id: "srp_monthly", label: "A few per month" },
      { id: "srp_rare", label: "Rarely" },
    ],
    required: false,
    rationale:
      "Perio comfort is the wedge between a prophy hygienist and a perio-program contributor.",
    category: "skills",
  },
  {
    id: "rdh_ultrasonic_preference",
    prompt: "Which ultrasonic system are you most comfortable with?",
    kind: "single_select",
    options: [
      { id: "us_cavitron", label: "Cavitron (magnetostrictive)" },
      { id: "us_piezo", label: "Piezo" },
      { id: "us_both", label: "Both equally" },
      { id: "us_none", label: "Hand instruments only" },
    ],
    required: false,
    rationale:
      "Quick fit-check with your operatory setup — Cavitron-only candidates struggle on piezo-only chairs.",
    category: "skills",
  },
  {
    id: "rdh_pms_experience",
    prompt: "Which practice management software have you used?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Reduces ramp time when the candidate already knows your stack.",
    category: "skills",
  },
  {
    id: "rdh_perio_codes",
    prompt:
      "Are you comfortable charting and coding using the full ADA periodontal code set (D4341, D4342, D4910, etc.)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Coding fluency directly affects production credit — many candidates over-code or default to prophy.",
    category: "skills",
  },
  {
    id: "rdh_pediatric",
    prompt: "Are you comfortable working chairside with pediatric patients?",
    kind: "yes_no",
    required: false,
    rationale:
      "Useful filter when the chair you're hiring for sees a meaningful pediatric panel.",
    category: "skills",
  },
  // Logistics
  {
    id: "rdh_schedule_preference",
    prompt: "What schedule works best for you?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Hygiene schedules are often the make-or-break criterion — filter early.",
    category: "logistics",
  },
  {
    id: "rdh_saturday",
    prompt: "Are you open to working Saturdays?",
    kind: "yes_no",
    required: false,
    rationale:
      "Saturday coverage is hard to staff in hygiene; surface availability now.",
    category: "logistics",
  },
  // Compensation
  {
    id: "rdh_comp_expectations",
    prompt: "What hourly or daily rate are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Hygienist pay varies wildly by metro; surfacing the ask early avoids interview-stage surprises.",
    category: "compensation",
  },
  // Fit
  {
    id: "rdh_recare_ownership",
    prompt:
      "Tell us how you've contributed to patient recare and reactivation in a previous role.",
    kind: "long_text",
    required: false,
    rationale:
      "Recare ownership is the difference between a chair-time hygienist and a hygiene-program partner.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Dental Assistant
 * ────────────────────────────────────────────────────────────────*/

const DENTAL_ASSISTANT_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "da_radiology",
    prompt:
      "Are you certified to take dental radiographs in the state where this position is located?",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Most states require radiology certification before a DA can shoot x-rays — knockout filter.",
    category: "qualification",
  },
  {
    id: "da_certifications",
    prompt: "Which certifications do you currently hold?",
    kind: "multi_select",
    options: [
      { id: "cert_efda", label: "EFDA / expanded functions" },
      { id: "cert_cda", label: "CDA (DANB)" },
      { id: "cert_radiology", label: "Radiology" },
      { id: "cert_coronal", label: "Coronal polishing" },
      { id: "cert_sealants", label: "Sealants" },
      { id: "cert_topical_anesthesia", label: "Topical anesthetic application" },
      { id: "cert_cpr", label: "CPR / BLS (current)" },
      { id: "cert_none", label: "None of the above" },
    ],
    required: false,
    rationale:
      "EFDA-certified assistants can handle expanded duties — often a meaningful productivity lift.",
    category: "qualification",
  },
  // Experience
  {
    id: "da_years_experience",
    prompt: "How many years have you worked as a dental assistant?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Standard experience filter; keeps the candidate pool sortable.",
    category: "experience",
  },
  {
    id: "da_chairside_specialties",
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
      { id: "asst_sedation", label: "Sedation / IV monitoring" },
    ],
    required: false,
    rationale:
      "Helps match candidates to your specialty mix — important for multi-doc and group practices.",
    category: "experience",
  },
  // Skills
  {
    id: "da_four_handed",
    prompt:
      "Are you comfortable with four-handed dentistry across multiple operatories?",
    kind: "yes_no",
    required: false,
    rationale:
      "Four-handed efficiency is the single biggest chairside-productivity lever — worth confirming explicitly.",
    category: "skills",
  },
  {
    id: "da_digital_impressions",
    prompt: "Which intraoral scanners have you used?",
    kind: "multi_select",
    options: [
      { id: "scan_itero", label: "iTero" },
      { id: "scan_trios", label: "Trios (3Shape)" },
      { id: "scan_primescan", label: "Primescan / CEREC" },
      { id: "scan_medit", label: "Medit" },
      { id: "scan_other", label: "Other digital scanner" },
      { id: "scan_none", label: "None — analog impressions only" },
    ],
    required: false,
    rationale:
      "Scanner familiarity ramps fast but pre-trained candidates skip a 2-week productivity dip.",
    category: "skills",
  },
  {
    id: "da_cbct",
    prompt: "Are you comfortable operating a CBCT or panoramic 3D imaging unit?",
    kind: "yes_no",
    required: false,
    rationale:
      "Implant- and surgery-heavy practices need CBCT-fluent assistants from day one.",
    category: "skills",
  },
  {
    id: "da_sterilization",
    prompt:
      "Are you trained on instrument sterilization and OSHA infection-control protocols?",
    kind: "yes_no",
    required: false,
    rationale:
      "Most states require this; flagging up front protects you from a compliance gap.",
    category: "skills",
  },
  {
    id: "da_pms_experience",
    prompt: "Which practice management software have you used?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Charting fluency in your PMS shortens ramp from weeks to days.",
    category: "skills",
  },
  {
    id: "da_lab_cases",
    prompt:
      "Have you owned the lab-case workflow (prescriptions, shipping, tracking) in a previous role?",
    kind: "yes_no",
    required: false,
    rationale:
      "Lab-ticket ownership is a meaningful productivity lift in restorative-heavy chairs.",
    category: "skills",
  },
  // Logistics
  {
    id: "da_schedule_preference",
    prompt: "What schedule are you looking for?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Assistants are often hired for specific shifts; surface schedule mismatches up front.",
    category: "logistics",
  },
  {
    id: "da_float",
    prompt:
      "Are you open to floating between multiple offices in the same group?",
    kind: "yes_no",
    required: false,
    rationale:
      "Float DAs are gold for group practices; surface willingness instead of asking later.",
    category: "logistics",
  },
  // Compensation
  {
    id: "da_comp_expectations",
    prompt: "What hourly rate are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Avoids the awkward interview where your offer is $4 below their floor.",
    category: "compensation",
  },
  // Fit
  {
    id: "da_patient_education",
    prompt:
      "How comfortable are you walking patients through pre-op instructions and basic post-op care?",
    kind: "single_select",
    options: [
      { id: "edu_lead", label: "Very — I lead these conversations" },
      { id: "edu_partner", label: "Comfortable with the doctor in the room" },
      { id: "edu_learning", label: "Still learning" },
    ],
    required: false,
    rationale:
      "Patient-education comfort is the difference between a chair-time DA and a true clinical partner.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Front Office / Receptionist
 * ────────────────────────────────────────────────────────────────*/

const FRONT_OFFICE_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "fo_hipaa_training",
    prompt: "Have you completed HIPAA training within the last 12 months?",
    kind: "yes_no",
    required: false,
    rationale:
      "Most practices require annual HIPAA refresh; surface gaps before the first day.",
    category: "qualification",
  },
  // Experience
  {
    id: "fo_years_experience",
    prompt: "How many years of dental front-office experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Distinguishes career front-desk hires from candidates pivoting in from general admin.",
    category: "experience",
  },
  {
    id: "fo_practice_size",
    prompt: "What's the largest practice you've worked the front desk for?",
    kind: "single_select",
    options: [
      { id: "fo_size_1op", label: "1–2 operatories" },
      { id: "fo_size_3_5", label: "3–5 operatories" },
      { id: "fo_size_6_10", label: "6–10 operatories" },
      { id: "fo_size_10p", label: "10+ operatories" },
      { id: "fo_size_multi", label: "Multi-location" },
    ],
    required: false,
    rationale:
      "Throughput at a 10-op practice is a different job than a 2-op solo — calibrate fit.",
    category: "experience",
  },
  // Skills
  {
    id: "fo_pms_experience",
    prompt:
      "Which practice management software have you used at the front desk?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Front desk hires that already know your PMS ramp 3x faster — high-signal filter.",
    category: "skills",
  },
  {
    id: "fo_insurance_verification",
    prompt:
      "Are you experienced verifying dental insurance benefits and submitting claims?",
    kind: "yes_no",
    required: false,
    rationale:
      "Insurance verification skill is the #1 differentiator between dental front desk and generic receptionist work.",
    category: "skills",
  },
  {
    id: "fo_insurance_types",
    prompt: "Which insurance types have you regularly worked with?",
    kind: "multi_select",
    options: [
      { id: "ins_ppo", label: "PPO" },
      { id: "ins_hmo", label: "HMO / DHMO" },
      { id: "ins_medicaid", label: "Medicaid / state programs" },
      { id: "ins_medicare", label: "Medicare Advantage dental" },
      { id: "ins_indemnity", label: "Indemnity / UCR" },
      { id: "ins_inhouse", label: "In-house membership plans" },
    ],
    required: false,
    rationale:
      "Insurance mix is a meaningful skills filter — Medicaid-heavy practices need different fluency than fee-for-service.",
    category: "skills",
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
      { id: "fo_claims", label: "Claims submission & appeals" },
      { id: "fo_recall", label: "Recall / reactivation" },
      { id: "fo_new_patient", label: "New patient intake calls" },
      { id: "fo_carecredit", label: "CareCredit / patient financing" },
      { id: "fo_reviews", label: "Reviews & social media response" },
    ],
    required: false,
    rationale:
      "Front-desk roles vary — pinpoint exactly which functions the candidate has owned.",
    category: "skills",
  },
  {
    id: "fo_treatment_presentation",
    prompt:
      "Are you comfortable presenting treatment plans and discussing patient financing?",
    kind: "yes_no",
    required: false,
    rationale:
      "Treatment-plan presentation is the highest-leverage front-desk skill — practice production rides on it.",
    category: "skills",
  },
  {
    id: "fo_d_codes",
    prompt:
      "Are you comfortable reading and using ADA D-codes day-to-day?",
    kind: "yes_no",
    required: false,
    rationale:
      "D-code fluency separates a true dental front desk from a transferable medical-front-desk hire.",
    category: "skills",
  },
  {
    id: "fo_phones",
    prompt: "Are you comfortable with multi-line phone systems?",
    kind: "yes_no",
    required: false,
    rationale:
      "Most dental front desks juggle 3-6 lines simultaneously — surface comfort with that pace.",
    category: "skills",
  },
  // Logistics
  {
    id: "fo_schedule_preference",
    prompt: "What schedule are you looking for?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Saturday and evening coverage is the front-desk hiring blocker — surface availability now.",
    category: "logistics",
  },
  {
    id: "fo_evening_saturday",
    prompt: "Are you available evenings or Saturdays?",
    kind: "single_select",
    options: [
      { id: "fo_avail_both", label: "Yes — evenings and Saturdays" },
      { id: "fo_avail_eve", label: "Evenings only" },
      { id: "fo_avail_sat", label: "Saturdays only" },
      { id: "fo_avail_neither", label: "Neither" },
    ],
    required: false,
    rationale:
      "Granular availability filter — extended-hours practices need this answered before screen.",
    category: "logistics",
  },
  // Compensation
  {
    id: "fo_comp_expectations",
    prompt: "What hourly rate are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Open-ended; pay variance across metros is wide and you want the candidate's actual ask.",
    category: "compensation",
  },
  // Fit
  {
    id: "fo_difficult_patient",
    prompt:
      "Briefly describe how you'd handle a patient frustrated about an unexpected balance after insurance.",
    kind: "long_text",
    required: false,
    rationale:
      "Real-scenario question — better signal than 'tell me about your customer service'.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Office Manager
 * ────────────────────────────────────────────────────────────────*/

const OFFICE_MANAGER_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "om_compliance_officer",
    prompt:
      "Have you served as an OSHA or HIPAA compliance officer in a previous role?",
    kind: "yes_no",
    required: false,
    rationale:
      "Many practices roll compliance officer into the OM seat — useful filter for that scope.",
    category: "qualification",
  },
  // Experience
  {
    id: "om_years_experience",
    prompt: "How many years of dental office management experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Differentiates first-time managers from seasoned multi-location operators.",
    category: "experience",
  },
  {
    id: "om_multi_location",
    prompt:
      "Have you managed more than one practice location at a time?",
    kind: "single_select",
    options: [
      { id: "ml_one", label: "Single location only" },
      { id: "ml_two_three", label: "2–3 locations" },
      { id: "ml_four_plus", label: "4+ locations" },
    ],
    required: false,
    rationale:
      "Multi-location experience is the wedge between a single-practice OM and a DSO-ready candidate.",
    category: "experience",
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
    category: "experience",
  },
  // Skills
  {
    id: "om_responsibilities",
    prompt: "Which areas have you owned in a previous OM role?",
    kind: "multi_select",
    options: [
      { id: "om_pl", label: "P&L / financial reporting" },
      { id: "om_payroll", label: "Payroll administration" },
      { id: "om_hr", label: "Hiring, onboarding, performance" },
      { id: "om_provider_sched", label: "Provider scheduling" },
      { id: "om_insurance", label: "Insurance / billing oversight" },
      { id: "om_compliance", label: "OSHA / HIPAA compliance" },
      { id: "om_marketing", label: "Local marketing & reactivation" },
      { id: "om_kpis", label: "KPI tracking & ops reviews" },
      { id: "om_vendor", label: "Vendor negotiation" },
      { id: "om_tech", label: "Technology rollouts (PMS, imaging, etc.)" },
    ],
    required: false,
    rationale:
      "OM scope varies by practice — match the candidate's owned functions to what you actually need.",
    category: "skills",
  },
  {
    id: "om_pms_experience",
    prompt: "Which practice management software are you fluent in?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "OM fluency in your PMS shortens ramp from months to weeks.",
    category: "skills",
  },
  {
    id: "om_provider_comp",
    prompt:
      "Have you been responsible for calculating provider compensation (production splits, collections splits, bonuses)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Provider-comp ownership is a meaningful skill gap — one of the most error-prone parts of the OM seat.",
    category: "skills",
  },
  {
    id: "om_kpis",
    prompt:
      "Which KPIs have you been responsible for hitting in a previous role?",
    kind: "multi_select",
    options: KPI_OPTIONS,
    required: false,
    rationale:
      "Quick scan vs. the long-form follow-up — lets you sort by owner-mindset candidates.",
    category: "skills",
  },
  {
    id: "om_kpi_story",
    prompt:
      "Pick one KPI from above and briefly describe how you moved it in a previous role.",
    kind: "long_text",
    required: false,
    rationale:
      "Long-form answer surfaces whether the candidate thinks like an operator or a coordinator.",
    category: "skills",
  },
  // Logistics
  {
    id: "om_schedule_preference",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Most OM seats are FT but some DSOs run shared/regional OMs; surface preference now.",
    category: "logistics",
  },
  {
    id: "om_start_date",
    prompt: "What is your earliest available start date?",
    helper_text:
      "Most OM hires need to give 2–4 weeks notice; rough month is fine.",
    kind: "short_text",
    required: false,
    rationale:
      "OM transitions take longer than chair-side roles; plan around their notice period.",
    category: "logistics",
  },
  // Compensation
  {
    id: "om_comp_expectations",
    prompt: "What is your target base salary or salary + bonus structure?",
    kind: "short_text",
    required: false,
    rationale:
      "OM comp is highly variable by region and practice size — get the ask up front.",
    category: "compensation",
  },
  // Fit
  {
    id: "om_underperformer",
    prompt:
      "Briefly describe how you'd approach a long-tenured front desk lead missing collections targets.",
    kind: "long_text",
    required: false,
    rationale:
      "Real-scenario question — surfaces management style and confrontation comfort better than 'leadership philosophy'.",
    category: "fit",
  },
  {
    id: "om_doctor_relationship",
    prompt:
      "How do you partner with the practice owner or lead doctor on day-to-day decisions?",
    kind: "long_text",
    required: false,
    rationale:
      "OM-to-doctor dynamic is the most common derailer of long OM tenures; surface their model.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Regional Manager (multi-practice)
 * ────────────────────────────────────────────────────────────────*/

const REGIONAL_MANAGER_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "rm_dso_tenure",
    prompt:
      "Which DSOs or multi-practice groups have you held a regional or area-manager role at?",
    helper_text:
      "Names optional — we just want to know the size and type of operations you've supported.",
    kind: "long_text",
    required: false,
    rationale:
      "DSO operational experience is the single most-asked credential for regional seats.",
    category: "qualification",
  },
  // Experience
  {
    id: "rm_years_regional",
    prompt: "How many years have you held a regional / area-manager role?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Regional experience compounds — first-year regionals miss things 5-year regionals catch on day one.",
    category: "experience",
  },
  {
    id: "rm_practices_overseen",
    prompt: "How many practices do you currently oversee?",
    kind: "single_select",
    options: [
      { id: "rm_2_4", label: "2–4 practices" },
      { id: "rm_5_8", label: "5–8 practices" },
      { id: "rm_9_15", label: "9–15 practices" },
      { id: "rm_15p", label: "15+ practices" },
    ],
    required: false,
    rationale:
      "Span of practices is the strongest predictor of regional bandwidth and travel comfort.",
    category: "experience",
  },
  {
    id: "rm_fte_span",
    prompt: "Approximately how many FTEs across all practices do you support?",
    kind: "short_text",
    required: false,
    rationale:
      "Practice count and FTE count diverge quickly — both matter for sizing the seat.",
    category: "experience",
  },
  {
    id: "rm_multi_state",
    prompt: "Have you operated practices across multiple states?",
    kind: "yes_no",
    required: false,
    rationale:
      "Multi-state regulatory complexity (Medicaid, scope of practice) is its own skill — flag it.",
    category: "experience",
  },
  // Skills
  {
    id: "rm_pl_per_practice",
    prompt:
      "Are you accountable for a P&L per practice in your current role?",
    kind: "yes_no",
    required: false,
    rationale:
      "Some regionals own ops only; others own P&L. Practices hire differently for each profile.",
    category: "skills",
  },
  {
    id: "rm_kpi_scorecard",
    prompt: "Which scorecard KPIs do you actively manage to?",
    kind: "multi_select",
    options: KPI_OPTIONS,
    required: false,
    rationale:
      "Reveals operating cadence — ops-focused regionals scan different KPIs than P&L-focused regionals.",
    category: "skills",
  },
  {
    id: "rm_provider_recruitment",
    prompt:
      "Are you actively involved in recruiting and retaining providers for your practices?",
    kind: "yes_no",
    required: false,
    rationale:
      "Provider recruitment is the highest-leverage regional skill; unbundle it from generic 'leadership'.",
    category: "skills",
  },
  {
    id: "rm_new_office",
    prompt:
      "Have you opened or onboarded a newly acquired practice as part of your regional role?",
    kind: "yes_no",
    required: false,
    rationale:
      "De novo or post-acquisition integration is a different skill set than steady-state ops.",
    category: "skills",
  },
  // Logistics
  {
    id: "rm_travel",
    prompt: "What percentage of your time are you comfortable traveling?",
    kind: "single_select",
    options: [
      { id: "rm_travel_25", label: "Up to 25%" },
      { id: "rm_travel_50", label: "Up to 50%" },
      { id: "rm_travel_75", label: "Up to 75%" },
      { id: "rm_travel_100", label: "Road warrior — happy to travel weekly" },
    ],
    required: false,
    rationale:
      "Most regional seats require meaningful travel; surface comfort before the screen.",
    category: "logistics",
  },
  // Compensation
  {
    id: "rm_comp_expectations",
    prompt:
      "What is your target compensation structure (base, bonus, equity)?",
    kind: "long_text",
    required: false,
    rationale:
      "Regional comp commonly mixes base + practice-performance bonus + sometimes equity — get all three.",
    category: "compensation",
  },
  // Fit
  {
    id: "rm_brand_vs_ops",
    prompt:
      "How do you balance enforcing standardized brand and protocols with letting individual practices keep their identity?",
    kind: "long_text",
    required: false,
    rationale:
      "The brand-vs-ops tension is the central tradeoff in the regional seat — surfaces operating philosophy.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * #77 (2026-06-12) — expanded practice-level roles
 * ────────────────────────────────────────────────────────────────*/

const DENTAL_THERAPIST_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "dt_state_authorized",
    prompt:
      "Are you licensed or certified to practice dental therapy in the state where this position is located?",
    helper_text:
      "Dental therapy is authorized in a limited set of states — confirm before anything else.",
    kind: "yes_no",
    required: true,
    knockout: true,
    rationale:
      "Dental therapy is only authorized in certain states; an unlicensed therapist can't see patients on day one.",
    category: "qualification",
  },
  {
    id: "dt_supervision_level",
    prompt:
      "What supervision arrangement have you practiced under (direct, indirect, collaborative agreement)?",
    kind: "single_select",
    options: [
      { id: "dt_sup_direct", label: "Direct supervision" },
      { id: "dt_sup_indirect", label: "Indirect / general supervision" },
      { id: "dt_sup_collab", label: "Collaborative management agreement" },
      { id: "dt_sup_mixed", label: "A mix — varies by setting" },
    ],
    required: false,
    rationale:
      "Supervision rules vary by state and practice model — match their experience to how your dentists actually work.",
    category: "qualification",
  },
  // Experience
  {
    id: "dt_years_experience",
    prompt: "How many years have you practiced as a dental therapist?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "A young profession — many strong candidates have 1–3 years; calibrate expectations accordingly.",
    category: "experience",
  },
  // Skills
  {
    id: "dt_procedures",
    prompt: "Which procedures are within your trained scope?",
    kind: "multi_select",
    options: [
      { id: "dt_proc_restorative", label: "Direct restorations" },
      { id: "dt_proc_extractions", label: "Simple extractions" },
      { id: "dt_proc_preventive", label: "Preventive care / prophylaxis" },
      { id: "dt_proc_anesthesia", label: "Local anesthesia" },
      { id: "dt_proc_ssc", label: "Stainless steel crowns" },
      { id: "dt_proc_radiographs", label: "Radiographs" },
    ],
    required: false,
    rationale:
      "Therapist scope varies sharply by state and training program — pin down the actual procedure mix.",
    category: "skills",
  },
  {
    id: "dt_populations",
    prompt:
      "Have you worked with underserved or public-health populations (community clinics, FQHCs, school programs)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Dental therapy grew out of the access-to-care movement — many of the best candidates come from public-health settings.",
    category: "experience",
  },
  // Logistics
  {
    id: "dt_schedule",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Schedule mismatch is the #1 reason interviews go nowhere — surface it first.",
    category: "logistics",
  },
  // Compensation
  {
    id: "dt_comp_expectation",
    prompt: "What hourly or annual compensation are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Therapist comp benchmarks are thin — getting the ask up front avoids a late-stage surprise.",
    category: "compensation",
  },
  // Fit
  {
    id: "dt_why_therapy",
    prompt:
      "What drew you to dental therapy, and what kind of practice setting do you do your best work in?",
    kind: "long_text",
    required: false,
    rationale:
      "Open-ended fit read — therapists chose a newer path on purpose; the why tells you a lot.",
    category: "fit",
  },
];

const STERILIZATION_TECH_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "st_infection_control_training",
    prompt:
      "Have you completed formal infection-control training (OSHA bloodborne pathogens, CDC guidelines)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Sterile processing is a compliance role at its core — formal training beats on-the-job-only backgrounds.",
    category: "qualification",
  },
  {
    id: "st_certification",
    prompt:
      "Do you hold a sterile-processing certification (CRCST, CSPDT, or similar)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Certifications are uncommon in dental sterile processing — holding one signals a career tech, not a pass-through hire.",
    category: "qualification",
  },
  // Experience
  {
    id: "st_years_experience",
    prompt:
      "How many years of sterilization / instrument-processing experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Includes dental and medical sterile processing — both transfer well.",
    category: "experience",
  },
  {
    id: "st_setting",
    prompt: "Where have you done sterile processing?",
    kind: "multi_select",
    options: [
      { id: "st_set_dental", label: "Dental practice" },
      { id: "st_set_oms", label: "Oral surgery / specialty office" },
      { id: "st_set_hospital", label: "Hospital / surgery center" },
      { id: "st_set_other", label: "Other clinical setting" },
    ],
    required: false,
    rationale:
      "Hospital-trained techs bring rigorous protocol habits; dental-trained techs know your instrument mix.",
    category: "experience",
  },
  // Skills
  {
    id: "st_equipment",
    prompt: "Which sterilization equipment have you operated?",
    kind: "multi_select",
    options: [
      { id: "st_eq_autoclave", label: "Steam autoclave" },
      { id: "st_eq_statim", label: "STATIM / cassette autoclave" },
      { id: "st_eq_ultrasonic", label: "Ultrasonic cleaner" },
      { id: "st_eq_washer", label: "Instrument washer" },
      { id: "st_eq_biological", label: "Biological monitoring / spore testing" },
    ],
    required: false,
    rationale:
      "Equipment fluency = day-one productivity; spore-testing experience signals they ran the program, not just the machine.",
    category: "skills",
  },
  {
    id: "st_turnover_pace",
    prompt:
      "Are you comfortable turning operatories in a high-volume practice (10+ patients per day per chair)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Turnover pace is where sterilization roles burn out — set the volume expectation honestly.",
    category: "logistics",
  },
  // Logistics
  {
    id: "st_schedule",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Schedule mismatch is the #1 reason interviews go nowhere — surface it first.",
    category: "logistics",
  },
  // Fit
  {
    id: "st_process_improvement",
    prompt:
      "Tell us about a time you improved a sterilization or instrument-flow process.",
    kind: "long_text",
    required: false,
    rationale:
      "Separates techs who own the sterilization PROGRAM from those who run a machine.",
    category: "fit",
  },
];

const LAB_TECH_QUESTIONS: RecommendedQuestion[] = [
  // Qualifications
  {
    id: "lt_cdt_certified",
    prompt: "Are you a Certified Dental Technician (CDT), or working toward it?",
    kind: "single_select",
    options: [
      { id: "lt_cdt_yes", label: "CDT certified" },
      { id: "lt_cdt_progress", label: "Working toward CDT" },
      { id: "lt_cdt_no", label: "Not pursuing certification" },
    ],
    required: false,
    rationale:
      "CDT is optional but meaningful — certified techs command premium pay and handle complex cases.",
    category: "qualification",
  },
  // Experience
  {
    id: "lt_years_experience",
    prompt: "How many years of dental lab experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale: "Bench skill compounds with years — a quick calibration.",
    category: "experience",
  },
  {
    id: "lt_lab_setting",
    prompt: "What kind of lab have you worked in?",
    kind: "multi_select",
    options: [
      { id: "lt_set_inhouse", label: "In-house practice lab" },
      { id: "lt_set_commercial", label: "Commercial dental lab" },
      { id: "lt_set_milling", label: "Milling center" },
      { id: "lt_set_ortho", label: "Orthodontic lab" },
    ],
    required: false,
    rationale:
      "In-house techs juggle chairside adjustments + same-day work; commercial techs go deeper on fewer products.",
    category: "experience",
  },
  // Skills
  {
    id: "lt_products",
    prompt: "Which products do you fabricate confidently?",
    kind: "multi_select",
    options: [
      { id: "lt_prod_crown_bridge", label: "Crown & bridge" },
      { id: "lt_prod_dentures", label: "Full / partial dentures" },
      { id: "lt_prod_implant", label: "Implant restorations" },
      { id: "lt_prod_nightguards", label: "Nightguards / splints" },
      { id: "lt_prod_ortho", label: "Orthodontic appliances / aligners" },
      { id: "lt_prod_ceramics", label: "Layered ceramics / aesthetics" },
    ],
    required: false,
    rationale:
      "Match the product mix to what your practice actually sends to the bench.",
    category: "skills",
  },
  {
    id: "lt_digital_workflow",
    prompt: "Which digital workflows have you used?",
    kind: "multi_select",
    options: [
      { id: "lt_dig_exocad", label: "exocad" },
      { id: "lt_dig_3shape", label: "3Shape" },
      { id: "lt_dig_cerec", label: "CEREC / chairside CAD-CAM" },
      { id: "lt_dig_milling", label: "Milling units" },
      { id: "lt_dig_printing", label: "3D printing" },
      { id: "lt_dig_scanning", label: "Intraoral scan workflows" },
      { id: "lt_dig_analog", label: "Primarily analog / traditional" },
    ],
    required: false,
    rationale:
      "Digital fluency is the dividing line in modern lab hiring — analog-only techs need ramp time on a digital bench.",
    category: "skills",
  },
  {
    id: "lt_turnaround",
    prompt:
      "Are you comfortable with same-day / next-day turnaround expectations for in-house cases?",
    kind: "yes_no",
    required: false,
    rationale:
      "In-house labs live on fast turnaround — commercial-lab veterans sometimes find the pace jarring.",
    category: "logistics",
  },
  // Compensation
  {
    id: "lt_comp_expectation",
    prompt: "What hourly or annual compensation are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Lab tech comp varies widely with digital skill + product mix — get the ask up front.",
    category: "compensation",
  },
  // Fit
  {
    id: "lt_quality_story",
    prompt:
      "Walk us through how you handle a case that comes back for a remake.",
    kind: "long_text",
    required: false,
    rationale:
      "Remake handling reveals craftsmanship standards, ego, and how they work with doctors.",
    category: "fit",
  },
];

const TREATMENT_COORDINATOR_QUESTIONS: RecommendedQuestion[] = [
  // Experience
  {
    id: "tc_years_experience",
    prompt:
      "How many years have you worked as a treatment coordinator (or presented treatment plans)?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Front-desk staff who 'also presented treatment' and dedicated TCs are different hires — this sorts them.",
    category: "experience",
  },
  {
    id: "tc_case_size",
    prompt:
      "What's the largest treatment plan value you've regularly presented?",
    kind: "single_select",
    options: [
      { id: "tc_case_1k", label: "Under $1,000" },
      { id: "tc_case_5k", label: "$1,000–5,000" },
      { id: "tc_case_15k", label: "$5,000–15,000" },
      { id: "tc_case_30k", label: "$15,000–30,000 (full-arch territory)" },
      { id: "tc_case_30kp", label: "$30,000+" },
    ],
    required: false,
    rationale:
      "Presenting a $15K implant plan is a different skill than a $800 crown — match to your case mix.",
    category: "experience",
  },
  // Skills
  {
    id: "tc_financing_tools",
    prompt: "Which patient-financing tools have you presented?",
    kind: "multi_select",
    options: [
      { id: "tc_fin_carecredit", label: "CareCredit" },
      { id: "tc_fin_sunbit", label: "Sunbit" },
      { id: "tc_fin_cherry", label: "Cherry" },
      { id: "tc_fin_proceed", label: "Proceed / other third-party" },
      { id: "tc_fin_inhouse", label: "In-house membership / payment plans" },
    ],
    required: false,
    rationale:
      "Financing fluency directly moves case acceptance on larger plans.",
    category: "skills",
  },
  {
    id: "tc_insurance_fluency",
    prompt:
      "Are you comfortable explaining insurance coverage, downgrades, and out-of-pocket estimates to patients?",
    kind: "yes_no",
    required: false,
    rationale:
      "The hardest TC conversations are coverage-gap conversations — confirm they've owned them.",
    category: "skills",
  },
  {
    id: "tc_pms_experience",
    prompt: "Which practice management software have you used?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "TCs live in the ledger and treatment-plan modules — same-PMS hires ramp dramatically faster.",
    category: "skills",
  },
  // Logistics
  {
    id: "tc_schedule",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Schedule mismatch is the #1 reason interviews go nowhere — surface it first.",
    category: "logistics",
  },
  // Fit
  {
    id: "tc_objection_story",
    prompt:
      "Tell us about a time a patient declined a treatment plan — what did you do next?",
    kind: "long_text",
    required: false,
    rationale:
      "Follow-up behavior after a 'no' is the strongest predictor of TC performance.",
    category: "fit",
  },
];

const FINANCIAL_COORDINATOR_QUESTIONS: RecommendedQuestion[] = [
  // Experience
  {
    id: "fc_years_experience",
    prompt:
      "How many years of dental billing / financial coordination experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Dental billing is its own world (CDT codes, downgrades, frequencies) — general medical billing only partly transfers.",
    category: "experience",
  },
  // Skills
  {
    id: "fc_claims_lifecycle",
    prompt: "Which parts of the claims lifecycle have you owned?",
    kind: "multi_select",
    options: [
      { id: "fc_cl_verify", label: "Benefits verification" },
      { id: "fc_cl_submit", label: "Claims submission" },
      { id: "fc_cl_attach", label: "Attachments / narratives" },
      { id: "fc_cl_denials", label: "Denials & appeals" },
      { id: "fc_cl_eob", label: "EOB posting & reconciliation" },
      { id: "fc_cl_preauth", label: "Pre-authorizations" },
    ],
    required: false,
    rationale:
      "Denial-and-appeal experience is the high-value end of the lifecycle — many candidates stop at submission.",
    category: "skills",
  },
  {
    id: "fc_ar_experience",
    prompt:
      "Have you owned an accounts-receivable aging report (insurance + patient AR)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Owning AR — not just posting payments — is what separates a financial coordinator from a biller.",
    category: "skills",
  },
  {
    id: "fc_insurance_types",
    prompt: "Which insurance types have you regularly worked with?",
    kind: "multi_select",
    options: [
      { id: "fc_ins_ppo", label: "PPO" },
      { id: "fc_ins_hmo", label: "HMO / DHMO" },
      { id: "fc_ins_medicaid", label: "Medicaid / state programs" },
      { id: "fc_ins_medicare", label: "Medicare Advantage dental" },
      { id: "fc_ins_inhouse", label: "In-house membership plans" },
    ],
    required: false,
    rationale:
      "Medicaid billing fluency is rare and valuable; PPO-only backgrounds need ramp on state programs.",
    category: "skills",
  },
  {
    id: "fc_collections_comfort",
    prompt:
      "Are you comfortable having balance-due conversations directly with patients?",
    kind: "yes_no",
    required: false,
    rationale:
      "Patient collections is the part of the job people quietly avoid — ask directly.",
    category: "skills",
  },
  {
    id: "fc_pms_experience",
    prompt: "Which practice management software have you used for billing?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Ledger + claims modules differ sharply across PMS platforms — same-system hires ramp fastest.",
    category: "skills",
  },
  // Logistics
  {
    id: "fc_schedule",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Schedule mismatch is the #1 reason interviews go nowhere — surface it first.",
    category: "logistics",
  },
  // Fit
  {
    id: "fc_denial_story",
    prompt:
      "Describe a stubborn denied claim you eventually got paid — what did it take?",
    kind: "long_text",
    required: false,
    rationale:
      "Appeal persistence is the single best signal for this seat.",
    category: "fit",
  },
];

const SCHEDULING_COORDINATOR_QUESTIONS: RecommendedQuestion[] = [
  // Experience
  {
    id: "sc_years_experience",
    prompt:
      "How many years of dental scheduling experience do you have?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Dental schedules have provider-specific rhythms (hygiene columns, doctor blocks) — dental years count double.",
    category: "experience",
  },
  {
    id: "sc_provider_count",
    prompt:
      "What's the most providers you've scheduled for at once (doctors + hygienists)?",
    kind: "single_select",
    options: [
      { id: "sc_prov_1_2", label: "1–2 providers" },
      { id: "sc_prov_3_5", label: "3–5 providers" },
      { id: "sc_prov_6_10", label: "6–10 providers" },
      { id: "sc_prov_10p", label: "10+ / multi-location" },
    ],
    required: false,
    rationale:
      "A six-provider book is a logistics puzzle — calibrate to your practice's size.",
    category: "experience",
  },
  // Skills
  {
    id: "sc_recall_systems",
    prompt:
      "Have you owned a hygiene recall / reactivation program (not just booked appointments)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Recall ownership is the revenue lever in this seat — booking alone is table stakes.",
    category: "skills",
  },
  {
    id: "sc_no_show_strategies",
    prompt:
      "What tactics have you used to reduce no-shows and short-notice cancellations?",
    kind: "multi_select",
    options: [
      { id: "sc_ns_confirm", label: "Multi-channel confirmations" },
      { id: "sc_ns_deposits", label: "Deposits / reservation fees" },
      { id: "sc_ns_waitlist", label: "ASAP / waitlist backfill" },
      { id: "sc_ns_policy", label: "Written cancellation policy" },
      { id: "sc_ns_relationship", label: "Personal outreach to repeat offenders" },
    ],
    required: false,
    rationale:
      "No-show management is where good schedulers prove out — tactics tell you their toolkit.",
    category: "skills",
  },
  {
    id: "sc_pms_experience",
    prompt: "Which practice management software have you scheduled in?",
    kind: "multi_select",
    options: PMS_OPTIONS,
    required: false,
    rationale:
      "Scheduler modules differ sharply by PMS — same-system hires ramp fastest.",
    category: "skills",
  },
  // Logistics
  {
    id: "sc_schedule",
    prompt: "What schedule are you targeting?",
    kind: "single_select",
    options: SCHEDULE_OPTIONS,
    required: false,
    rationale:
      "Schedule mismatch is the #1 reason interviews go nowhere — surface it first.",
    category: "logistics",
  },
  // Fit
  {
    id: "sc_full_book_story",
    prompt:
      "A doctor's day falls apart at 8am — two cancellations and an emergency walk-in. Walk us through your next 30 minutes.",
    kind: "long_text",
    required: false,
    rationale:
      "Live triage under pressure IS the job — this scenario shows their instincts.",
    category: "fit",
  },
];

const PRACTICE_ADMINISTRATOR_QUESTIONS: RecommendedQuestion[] = [
  // Experience
  {
    id: "pa_years_experience",
    prompt:
      "How many years have you managed or administered a dental practice?",
    kind: "single_select",
    options: YEARS_OPTIONS,
    required: false,
    rationale:
      "Practice administration is the senior single-site seat — most strong candidates grew out of office management.",
    category: "experience",
  },
  {
    id: "pa_team_size",
    prompt: "What's the largest team you've directly managed?",
    kind: "single_select",
    options: [
      { id: "pa_team_1_5", label: "1–5 people" },
      { id: "pa_team_6_15", label: "6–15 people" },
      { id: "pa_team_16_30", label: "16–30 people" },
      { id: "pa_team_30p", label: "30+ people" },
    ],
    required: false,
    rationale:
      "Team scale changes the job — a 25-person practice needs real management infrastructure.",
    category: "experience",
  },
  // Skills
  {
    id: "pa_pl_ownership",
    prompt:
      "Have you owned a practice P&L or operating budget (not just reported on it)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Budget OWNERSHIP separates administrators from senior office managers.",
    category: "skills",
  },
  {
    id: "pa_kpis",
    prompt: "Which practice KPIs have you actively managed?",
    kind: "multi_select",
    options: KPI_OPTIONS,
    required: false,
    rationale:
      "KPI fluency shows which levers they've actually pulled — production, collections, recare.",
    category: "skills",
  },
  {
    id: "pa_hr_scope",
    prompt: "Which HR functions have you owned?",
    kind: "multi_select",
    options: [
      { id: "pa_hr_hiring", label: "Hiring & onboarding" },
      { id: "pa_hr_payroll", label: "Payroll" },
      { id: "pa_hr_reviews", label: "Performance reviews" },
      { id: "pa_hr_discipline", label: "Corrective action / terminations" },
      { id: "pa_hr_benefits", label: "Benefits administration" },
    ],
    required: false,
    rationale:
      "The uncomfortable HR work (corrective action) is where administrators earn the title.",
    category: "skills",
  },
  {
    id: "pa_compliance",
    prompt:
      "Have you owned a practice's OSHA / HIPAA compliance program (training, documentation, audits)?",
    kind: "yes_no",
    required: false,
    rationale:
      "Compliance program ownership — not just personal training — is a core administrator duty.",
    category: "skills",
  },
  // Compensation
  {
    id: "pa_comp_expectation",
    prompt: "What annual compensation are you targeting?",
    kind: "short_text",
    required: false,
    rationale:
      "Administrator comp often includes a performance bonus — get the full ask early.",
    category: "compensation",
  },
  // Fit
  {
    id: "pa_turnaround_story",
    prompt:
      "Tell us about a practice problem you inherited (turnover, AR, schedule chaos) and how you turned it around.",
    kind: "long_text",
    required: false,
    rationale:
      "Turnaround stories reveal both diagnostic skill and follow-through — the administrator's core loop.",
    category: "fit",
  },
];

/* ─────────────────────────────────────────────────────────────────
 * Public map
 * ────────────────────────────────────────────────────────────────*/

/**
 * Keys match `role_category` values from ROLE_OPTIONS in
 * src/app/employer/jobs/job-wizard.tsx. `other` and unknown values
 * fall through to UNIVERSAL_RECOMMENDATIONS.
 */
export const ROLE_RECOMMENDATIONS: Record<string, RoleCategoryRecommendation> = {
  dentist: {
    label: "Dentist",
    questions: DENTIST_QUESTIONS,
  },
  specialist: {
    label: "Specialist Dentist",
    questions: SPECIALIST_QUESTIONS,
  },
  dental_hygienist: {
    label: "Dental Hygienist",
    questions: HYGIENIST_QUESTIONS,
  },
  // #77 (2026-06-12) — expanded practice-level roles.
  dental_therapist: {
    label: "Dental Therapist",
    questions: DENTAL_THERAPIST_QUESTIONS,
  },
  dental_assistant: {
    label: "Dental Assistant",
    questions: DENTAL_ASSISTANT_QUESTIONS,
  },
  sterilization_tech: {
    label: "Sterilization Technician",
    questions: STERILIZATION_TECH_QUESTIONS,
  },
  lab_tech: {
    label: "Dental Lab Technician",
    questions: LAB_TECH_QUESTIONS,
  },
  front_office: {
    label: "Front Desk",
    questions: FRONT_OFFICE_QUESTIONS,
  },
  treatment_coordinator: {
    label: "Treatment Coordinator",
    questions: TREATMENT_COORDINATOR_QUESTIONS,
  },
  financial_coordinator: {
    label: "Financial / Insurance Coordinator",
    questions: FINANCIAL_COORDINATOR_QUESTIONS,
  },
  scheduling_coordinator: {
    label: "Scheduling Coordinator",
    questions: SCHEDULING_COORDINATOR_QUESTIONS,
  },
  office_manager: {
    label: "Office Manager",
    questions: OFFICE_MANAGER_QUESTIONS,
  },
  practice_administrator: {
    label: "Practice Administrator",
    questions: PRACTICE_ADMINISTRATOR_QUESTIONS,
  },
  regional_manager: {
    label: "Regional Manager",
    questions: REGIONAL_MANAGER_QUESTIONS,
  },
};

export const UNIVERSAL_RECOMMENDATIONS: RoleCategoryRecommendation = {
  label: "this role",
  questions: UNIVERSAL_QUESTIONS,
};

/**
 * Returns the recommended set for a role_category, falling back to the
 * universal set when the category isn't curated (e.g. `other`).
 */
export function getRecommendationsForRole(
  roleCategory: string | null | undefined
): RoleCategoryRecommendation {
  if (!roleCategory) return UNIVERSAL_RECOMMENDATIONS;
  return ROLE_RECOMMENDATIONS[roleCategory] ?? UNIVERSAL_RECOMMENDATIONS;
}
