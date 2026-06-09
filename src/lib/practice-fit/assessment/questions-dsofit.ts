/**
 * DSOFit — the corporate-side assessment question bank (config, not schema).
 *
 * Parallel to the PracticeFit assessment (`questions.ts`) but role-true for DSO
 * corporate candidates: function, level, scope, multi-site scale, domain, work
 * mode — never clinical/patient questions. The DSOFit wizard renders these; the
 * save action (`actions-dsofit.ts`) maps answers onto the candidate signal
 * columns the engine reads (seniority_level, org_scale_experience, etc.).
 *
 * Design rules (same posture as PracticeFit + the moat/compliance rule):
 *   • Every question optional → a blank excludes that dimension, never a penalty
 *     and never a fabricated signal.
 *   • Seniority/leadership are about LEVEL + SCOPE, never age/tenure.
 *   • Domain is "transferable" framed — outside-industry talent isn't dinged.
 * Spec: Business Plan & Strategy/DSOFit_Assessment_and_Schema_2026-06-09.md.
 */

import type { AnswerType, AssessmentOption } from "./questions";
import { CORPORATE_FUNCTIONS } from "@/lib/corporate/functions";

export type DsoFitSection =
  | "target"
  | "scope"
  | "scale_domain"
  | "work_prefs"
  | "skills"
  | "work_style"
  | "clinicians";

export interface DsoFitQuestion {
  /** Stored answer key (maps to a candidate signal column in the save action). */
  key: string;
  section: DsoFitSection;
  /** DSOFit dimension this feeds (for reference/UI). */
  dimension: string;
  prompt: string;
  help?: string;
  type: AnswerType;
  options?: AssessmentOption[];
  sliderLabels?: { low: string; high: string };
  /** True when the résumé parser can pre-fill this (confirm step). */
  resumePrefill?: boolean;
  /** Never required (everything here is optional; this is for explicit UI hints). */
  optional?: boolean;
}

export const DSOFIT_SECTION_ORDER: DsoFitSection[] = [
  "target",
  "scope",
  "scale_domain",
  "work_prefs",
  "skills",
  "work_style",
  "clinicians",
];

export const DSOFIT_SECTION_LABEL: Record<DsoFitSection, string> = {
  target: "Your target role",
  scope: "Level & scope",
  scale_domain: "Scale & background",
  work_prefs: "Work preferences",
  skills: "Your strengths",
  work_style: "How you like to work",
  clinicians: "For clinicians",
};

/* ── Option sets ─────────────────────────────────────────────────────────── */

const FUNCTION_TARGET_OPTIONS: AssessmentOption[] = CORPORATE_FUNCTIONS.map(
  (f) => ({ value: f.slug, label: f.label })
);

const SENIORITY_OPTIONS: AssessmentOption[] = [
  { value: "ic", label: "Individual contributor" },
  { value: "lead", label: "Lead / senior" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "vp", label: "VP / SVP" },
  { value: "c_suite", label: "C-suite" },
];

const MGMT_SPAN_OPTIONS: AssessmentOption[] = [
  { value: "none", label: "No direct reports" },
  { value: "1-5", label: "1–5 people" },
  { value: "6-20", label: "6–20 people" },
  { value: "21-100", label: "21–100 people" },
  { value: "100+", label: "100+ people" },
];

const PL_SCOPE_OPTIONS: AssessmentOption[] = [
  { value: "none", label: "No P&L / budget ownership" },
  { value: "departmental", label: "A department budget" },
  { value: "multi_site", label: "Multi-site / regional P&L" },
  { value: "org_wide", label: "Org-wide P&L" },
];

const ORG_SCALE_OPTIONS: AssessmentOption[] = [
  { value: "solo", label: "A single location" },
  { value: "small", label: "A small group (2–9)" },
  { value: "mid", label: "A mid-size DSO (10–49)" },
  { value: "large", label: "A large DSO (50–99)" },
  { value: "enterprise", label: "An enterprise DSO (100+)" },
];

const DOMAIN_BG_OPTIONS: AssessmentOption[] = [
  { value: "dental_dso", label: "Dental / DSO" },
  { value: "adjacent_healthcare", label: "Other healthcare" },
  { value: "none", label: "Outside healthcare (new to it)" },
];

// Buckets → representative years int in the save action.
const DOMAIN_YEARS_OPTIONS: AssessmentOption[] = [
  { value: "lt2", label: "Under 2 years" },
  { value: "2_5", label: "2–5 years" },
  { value: "6_10", label: "6–10 years" },
  { value: "10_plus", label: "10+ years" },
];

const WORK_MODE_OPTIONS: AssessmentOption[] = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
  { value: "open", label: "Open to any" },
];

const TRAVEL_OPTIONS: AssessmentOption[] = [
  { value: "none", label: "None / minimal" },
  { value: "occasional", label: "Occasional (up to ~25%)" },
  { value: "frequent", label: "Frequent (50%+)" },
];

const COMP_INTEREST_OPTIONS: AssessmentOption[] = [
  { value: "bonus", label: "Performance bonus" },
  { value: "equity", label: "Equity" },
  { value: "partnership", label: "Partnership / ownership track" },
];

// Cross-functional DSO corporate strengths. Curated for v1; a function-aware
// filtered list is a later enhancement.
const DSOFIT_SKILLS_OPTIONS: AssessmentOption[] = [
  { value: "multi_site_ops", label: "Multi-site operations" },
  { value: "pl_management", label: "P&L management" },
  { value: "team_leadership", label: "Team leadership" },
  { value: "fpa", label: "FP&A / financial modeling" },
  { value: "revenue_cycle", label: "Revenue cycle / billing" },
  { value: "payer_relations", label: "Payer / managed-care relations" },
  { value: "credentialing", label: "Credentialing / provider enrollment" },
  { value: "ma_integration", label: "M&A / integration" },
  { value: "talent_acquisition", label: "Talent acquisition" },
  { value: "people_ops", label: "People ops / HR" },
  { value: "marketing_growth", label: "Marketing / patient growth" },
  { value: "data_analytics", label: "Data & analytics / BI" },
  { value: "it_systems", label: "IT systems / PMS" },
  { value: "compliance", label: "Compliance / regulatory" },
  { value: "real_estate", label: "Real estate / de novo" },
  { value: "supply_chain", label: "Supply chain / procurement" },
  { value: "project_management", label: "Project / program management" },
  { value: "vendor_management", label: "Vendor management" },
];

const PACE_OPTIONS: AssessmentOption[] = [
  { value: "high_volume", label: "Fast-moving, high-output" },
  { value: "steady", label: "Steady and balanced" },
  { value: "thorough", label: "Deliberate and thorough" },
];

const AUTONOMY_OPTIONS: AssessmentOption[] = [
  { value: "autonomy", label: "High autonomy — point me at the goal" },
  { value: "balance", label: "A balance of autonomy and support" },
  { value: "structure", label: "Clear structure and direction" },
];

const CLINICIAN_OPTIONS: AssessmentOption[] = [
  { value: "yes", label: "Yes — I'm a clinician moving into corporate/DSO roles" },
  { value: "no", label: "No — I'm a non-clinical corporate candidate" },
];

/* ── The question list ───────────────────────────────────────────────────── */

export const DSOFIT_QUESTIONS: DsoFitQuestion[] = [
  // Target & function
  {
    key: "dsofit_function_targets",
    section: "target",
    dimension: "function_fit",
    prompt: "Which DSO / corporate functions are you targeting?",
    help: "Pick all that fit — this is the single biggest driver of your matches.",
    type: "multi",
    options: FUNCTION_TARGET_OPTIONS,
  },
  {
    key: "current_title",
    section: "target",
    dimension: "function_fit",
    prompt: "Your current or most recent title",
    help: "We pre-fill this from your résumé when we can — just confirm or edit.",
    type: "text",
    resumePrefill: true,
    optional: true,
  },

  // Level & scope
  {
    key: "seniority_level",
    section: "scope",
    dimension: "seniority",
    prompt: "What level best describes you?",
    type: "single",
    options: SENIORITY_OPTIONS,
  },
  {
    key: "mgmt_span",
    section: "scope",
    dimension: "leadership_scope",
    prompt: "How many people have you managed?",
    help: "Direct + indirect reports at your largest.",
    type: "single",
    options: MGMT_SPAN_OPTIONS,
  },
  {
    key: "pl_scope",
    section: "scope",
    dimension: "leadership_scope",
    prompt: "Have you owned a P&L or budget?",
    type: "single",
    options: PL_SCOPE_OPTIONS,
  },

  // Scale & domain (the moat)
  {
    key: "org_scale_experience",
    section: "scale_domain",
    dimension: "org_scale",
    prompt: "What's the largest organization you've operated at?",
    help: "By number of locations / practices — your multi-site experience.",
    type: "single",
    options: ORG_SCALE_OPTIONS,
  },
  {
    key: "domain_background",
    section: "scale_domain",
    dimension: "domain_fit",
    prompt: "Where's your industry experience?",
    help: "Outside-healthcare experience still counts — many corporate roles are open to it.",
    type: "single",
    options: DOMAIN_BG_OPTIONS,
  },
  {
    key: "domain_years",
    section: "scale_domain",
    dimension: "domain_fit",
    prompt: "How long in that industry?",
    type: "single",
    options: DOMAIN_YEARS_OPTIONS,
    optional: true,
  },

  // Work preferences
  {
    key: "work_mode_pref",
    section: "work_prefs",
    dimension: "work_mode",
    prompt: "Preferred work mode?",
    type: "single",
    options: WORK_MODE_OPTIONS,
  },
  {
    key: "travel_tolerance",
    section: "work_prefs",
    dimension: "work_mode",
    prompt: "How much travel works for you?",
    type: "single",
    options: TRAVEL_OPTIONS,
  },
  {
    key: "min_salary",
    section: "work_prefs",
    dimension: "compensation",
    prompt: "Target base compensation",
    help: "A floor we use to match — never shown to employers.",
    type: "salary",
    optional: true,
  },
  {
    key: "corporate_comp_interests",
    section: "work_prefs",
    dimension: "compensation",
    prompt: "Beyond base, what matters to you?",
    type: "multi",
    options: COMP_INTEREST_OPTIONS,
    optional: true,
  },

  // Strengths
  {
    key: "dsofit_skills",
    section: "skills",
    dimension: "skills",
    prompt: "Pick your strongest areas",
    help: "Choose the ones you'd put on a résumé without hesitation.",
    type: "multi",
    options: DSOFIT_SKILLS_OPTIONS,
  },

  // Work style (light)
  {
    key: "work_pace",
    section: "work_style",
    dimension: "work_pace",
    prompt: "What pace suits you best?",
    type: "single",
    options: PACE_OPTIONS,
    optional: true,
  },
  {
    key: "autonomy_pref",
    section: "work_style",
    dimension: "autonomy",
    prompt: "How much autonomy do you want?",
    type: "single",
    options: AUTONOMY_OPTIONS,
    optional: true,
  },

  // Clinicians (intent bridge — #48)
  {
    key: "clinician_exploring_corporate",
    section: "clinicians",
    dimension: "clinical_bridge",
    prompt: "Are you a licensed clinician exploring corporate/DSO leadership?",
    help: "If yes, your clinical background counts toward clinical-leadership, BD, and training roles.",
    type: "single",
    options: CLINICIAN_OPTIONS,
    optional: true,
  },
];
