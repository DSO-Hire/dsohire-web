/**
 * Static demo content catalogs — all fictional. No real people, no real
 * company names/trademarks. Consumed by seed.ts, which turns these into rows.
 *
 * Naming: DSOs are neutral place/nature brands (the hero is "Bridgeway Dental
 * Partners"; "Eslinger" is intentionally NOT used anywhere). Candidate names
 * are generic fictional combinations; the ~20 candidates that carry a headshot
 * reuse the (fictional) name encoded in the committed image filename so face
 * and name align.
 */

import type { MetroKey } from "./geo";

/* ──────────────────────────────────────────────────────────────
 * DSOs — the tier ladder
 * ─────────────────────────────────────────────────────────── */

export interface DemoLocationDef {
  metro: MetroKey;
  name: string;
}

export interface DemoUserDef {
  firstName: string;
  lastName: string;
  title: string;
  role: "owner" | "recruiter";
  emailLocal: string; // <local>@demo.dsohire.com
  bio?: string;
}

export type DemoTier = "solo" | "growth" | "scale" | "enterprise";

export interface DemoDsoDef {
  slug: string;
  name: string;
  legalName: string;
  tier: DemoTier;
  hqMetro: MetroKey;
  practiceCount: number;
  description: string;
  mission: string;
  brandColor: string;
  cultureChips: string[];
  patientPopulations: string[];
  practice: {
    // Shared PracticeFit vocabulary (compute.ts PACE/AUTONOMY/MENTORSHIP/FEEL
    // scales) — candidate signals and DSO profile must use the SAME tokens or
    // the culture dims score 0.
    practice_pace: "high_volume" | "steady" | "thorough";
    autonomy_level: "autonomy" | "balance" | "structure";
    mentorship_offered: "strong" | "occasional" | "independent";
    practice_feel: "private" | "midsize" | "large";
    ce_support: number; // 1-5
    work_life_balance: number; // 1-5
  };
  locations: DemoLocationDef[];
  jobCount: number;
  /** Which job archetype keys to draw from for this DSO. */
  jobPalette: "clinical_heavy" | "balanced" | "enterprise";
  owner: DemoUserDef;
  recruiter?: DemoUserDef;
  /** true for the flagship hero DSO. */
  hero?: boolean;
}

export const DEMO_DSOS: DemoDsoDef[] = [
  {
    slug: "cedarwood-dental",
    name: "Cedarwood Dental",
    legalName: "Cedarwood Dental PLLC",
    tier: "solo",
    hqMetro: "boise",
    practiceCount: 1,
    description:
      "A single-location family and cosmetic practice in Boise built around unhurried, relationship-first care.",
    mission: "Treat every patient the way we'd treat our own family — and give our team room to do their best work.",
    brandColor: "#2F855A",
    cultureChips: ["Family-owned", "Unhurried visits", "Modern tech"],
    patientPopulations: ["all", "cosmetic", "anxious"],
    practice: {
      practice_pace: "thorough",
      autonomy_level: "autonomy",
      mentorship_offered: "occasional",
      practice_feel: "private",
      ce_support: 4,
      work_life_balance: 5,
    },
    locations: [{ metro: "boise", name: "Cedarwood Dental — Boise" }],
    jobCount: 3,
    jobPalette: "clinical_heavy",
    owner: {
      firstName: "Dana",
      lastName: "Albright",
      title: "Practice Owner",
      role: "owner",
      emailLocal: "cedarwood.owner",
      bio: "Owner-dentist at Cedarwood. Building a calm, modern practice one patient at a time.",
    },
  },
  {
    slug: "lakeshore-dental-group",
    name: "Lakeshore Dental Group",
    legalName: "Lakeshore Dental Group LLC",
    tier: "growth",
    hqMetro: "madison",
    practiceCount: 4,
    description:
      "A four-location group across southern Wisconsin focused on general and pediatric care with a strong hygiene program.",
    mission: "Grow thoughtfully, keep the small-practice feel, and invest in our clinicians.",
    brandColor: "#2B6CB0",
    cultureChips: ["Clinician-led", "Pediatric strength", "Growing team"],
    patientPopulations: ["all", "pediatric", "underserved"],
    practice: {
      practice_pace: "steady",
      autonomy_level: "autonomy",
      mentorship_offered: "strong",
      practice_feel: "midsize",
      ce_support: 4,
      work_life_balance: 4,
    },
    locations: [
      { metro: "madison", name: "Lakeshore Dental — Madison Central" },
      { metro: "milwaukee", name: "Lakeshore Dental — Milwaukee East" },
      { metro: "greenbay", name: "Lakeshore Dental — Green Bay" },
      { metro: "appleton", name: "Lakeshore Dental — Appleton" },
    ],
    jobCount: 6,
    jobPalette: "balanced",
    owner: {
      firstName: "Marcus",
      lastName: "Hale",
      title: "Managing Partner",
      role: "owner",
      emailLocal: "lakeshore.owner",
      bio: "Managing partner at Lakeshore. Former associate who bought in and never looked back.",
    },
  },
  {
    slug: "bridgeway-dental-partners",
    name: "Bridgeway Dental Partners",
    legalName: "Bridgeway Dental Partners, Inc.",
    tier: "scale",
    hero: true,
    hqMetro: "denver",
    practiceCount: 18,
    description:
      "An 18-location DSO across Colorado's Front Range pairing clinician autonomy with real operational support — central RCM, in-house credentialing, and a dedicated talent team.",
    mission: "Give great clinicians the support of a group without taking away what made them great.",
    brandColor: "#1F6FEB",
    cultureChips: ["Clinician autonomy", "Central support", "CE & mentorship", "Modern tech stack"],
    patientPopulations: ["all", "pediatric", "geriatric", "cosmetic", "underserved"],
    practice: {
      practice_pace: "steady",
      autonomy_level: "autonomy",
      mentorship_offered: "strong",
      practice_feel: "midsize",
      ce_support: 5,
      work_life_balance: 4,
    },
    locations: [
      { metro: "denver", name: "Bridgeway Dental — Downtown Denver" },
      { metro: "denver", name: "Bridgeway Dental — Cherry Creek" },
      { metro: "aurora", name: "Bridgeway Dental — Aurora" },
      { metro: "lakewood", name: "Bridgeway Dental — Lakewood" },
      { metro: "boulder", name: "Bridgeway Dental — Boulder" },
      { metro: "fortcollins", name: "Bridgeway Dental — Fort Collins" },
      { metro: "coloradosprings", name: "Bridgeway Dental — Colorado Springs North" },
      { metro: "coloradosprings", name: "Bridgeway Dental — Colorado Springs South" },
      { metro: "arvada", name: "Bridgeway Dental — Arvada" },
      { metro: "centennial", name: "Bridgeway Dental — Centennial" },
      { metro: "thornton", name: "Bridgeway Dental — Thornton" },
      { metro: "westminster", name: "Bridgeway Dental — Westminster" },
      { metro: "longmont", name: "Bridgeway Dental — Longmont" },
      { metro: "loveland", name: "Bridgeway Dental — Loveland" },
      { metro: "castlerock", name: "Bridgeway Dental — Castle Rock" },
      { metro: "parker", name: "Bridgeway Dental — Parker" },
      { metro: "littleton", name: "Bridgeway Dental — Littleton" },
      { metro: "broomfield", name: "Bridgeway Dental — Broomfield" },
    ],
    jobCount: 19,
    jobPalette: "balanced",
    owner: {
      firstName: "Olivia",
      lastName: "Brandt",
      title: "Chief Executive Officer",
      role: "owner",
      emailLocal: "bridgeway.owner",
      bio: "CEO of Bridgeway Dental Partners. Operator-first; obsessed with keeping clinicians clinical.",
    },
    recruiter: {
      firstName: "Devin",
      lastName: "Park",
      title: "Director of Talent Acquisition",
      role: "recruiter",
      emailLocal: "bridgeway.recruiter",
      bio: "Leads talent for Bridgeway across the Front Range. Ex-clinical, now full-time matchmaker.",
    },
  },
  {
    slug: "summit-dental-group",
    name: "Summit Dental Group",
    legalName: "Summit Dental Group Holdings, LLC",
    tier: "enterprise",
    hqMetro: "phoenix",
    practiceCount: 46,
    description:
      "A 46-location, multi-state group across the Southwest (AZ, NV, NM, TX) with centralized operations, RCM, and a corporate services team.",
    mission: "Scale access to quality dentistry across the Southwest without losing the local feel.",
    brandColor: "#9C4221",
    cultureChips: ["Multi-state", "Career ladders", "Centralized ops", "DE&I"],
    patientPopulations: ["all", "underserved", "geriatric", "pediatric"],
    practice: {
      practice_pace: "high_volume",
      autonomy_level: "balance",
      mentorship_offered: "occasional",
      practice_feel: "large",
      ce_support: 4,
      work_life_balance: 3,
    },
    locations: [
      { metro: "phoenix", name: "Summit Dental — Phoenix Central" },
      { metro: "phoenix", name: "Summit Dental — Phoenix West" },
      { metro: "mesa", name: "Summit Dental — Mesa" },
      { metro: "scottsdale", name: "Summit Dental — Scottsdale" },
      { metro: "tucson", name: "Summit Dental — Tucson" },
      { metro: "lasvegas", name: "Summit Dental — Las Vegas Summerlin" },
      { metro: "reno", name: "Summit Dental — Reno" },
      { metro: "albuquerque", name: "Summit Dental — Albuquerque" },
      { metro: "elpaso", name: "Summit Dental — El Paso" },
      { metro: "austin", name: "Summit Dental — Austin" },
      { metro: "sanantonio", name: "Summit Dental — San Antonio" },
    ],
    jobCount: 8,
    jobPalette: "enterprise",
    owner: {
      firstName: "Renée",
      lastName: "Castellano",
      title: "VP, Talent & People",
      role: "owner",
      emailLocal: "summit.owner",
      bio: "Runs people & talent for Summit across four states.",
    },
  },
  {
    slug: "riverstone-dental-partners",
    name: "Riverstone Dental Partners",
    legalName: "Riverstone Dental Partners LLC",
    tier: "scale",
    hqMetro: "portland",
    practiceCount: 12,
    description:
      "A 12-location group across Oregon and SW Washington known for a strong hygiene model and a clinician partnership track.",
    mission: "Build the Pacific Northwest's most clinician-friendly group.",
    brandColor: "#2C7A7B",
    cultureChips: ["Partnership track", "Hygiene-driven", "PNW roots"],
    patientPopulations: ["all", "cosmetic", "geriatric"],
    practice: {
      practice_pace: "steady",
      autonomy_level: "autonomy",
      mentorship_offered: "occasional",
      practice_feel: "midsize",
      ce_support: 4,
      work_life_balance: 4,
    },
    locations: [
      { metro: "portland", name: "Riverstone Dental — Portland Pearl" },
      { metro: "gresham", name: "Riverstone Dental — Gresham" },
      { metro: "hillsboro", name: "Riverstone Dental — Hillsboro" },
      { metro: "salem", name: "Riverstone Dental — Salem" },
      { metro: "eugene", name: "Riverstone Dental — Eugene" },
      { metro: "vancouverwa", name: "Riverstone Dental — Vancouver" },
    ],
    jobCount: 6,
    jobPalette: "balanced",
    owner: {
      firstName: "Priya",
      lastName: "Nayar",
      title: "Director of Operations",
      role: "owner",
      emailLocal: "riverstone.owner",
      bio: "Operations lead at Riverstone; hygiene-program nerd.",
    },
  },
];

export const HERO_SLUG = "bridgeway-dental-partners";

/* ──────────────────────────────────────────────────────────────
 * Compensation specs — partial `jobs` column objects spread at insert.
 * ─────────────────────────────────────────────────────────── */

export type CompSpec = Record<string, unknown>;

/** Associate-dentist deal: daily guarantee → % of collections (percent model). */
export function dentistComp(estMin: number, estMax: number): CompSpec {
  return {
    compensation_type: "range",
    compensation_visible: true,
    compensation_period: "annual",
    compensation_min: estMin,
    compensation_max: estMax,
    comp_model: "guarantee_plus_percent",
    guarantee_kind: "daily",
    guarantee_amount: 750,
    guarantee_duration: "intro_90d",
    percent_rate_min: 30,
    percent_rate_max: 32,
    percent_basis: "collections",
    percent_tiers_note: "Steps to 33% above $85k/mo collections.",
    hygiene_exam_credited: true,
    hygienist_work_credited: false,
    lab_fee_policy: "practice_paid",
    reconciliation: "greater_of",
    pay_cadence: "biweekly",
    est_annual_min: estMin,
    est_annual_max: estMax,
    worker_classification: "w2",
  };
}

/** Specialist deal: straight % of production, higher band. */
export function specialistComp(estMin: number, estMax: number): CompSpec {
  return {
    compensation_type: "range",
    compensation_visible: true,
    compensation_period: "annual",
    compensation_min: estMin,
    compensation_max: estMax,
    comp_model: "percent_only",
    percent_rate_min: 35,
    percent_rate_max: 40,
    percent_basis: "adjusted_production",
    lab_fee_policy: "split_50",
    reconciliation: "additive",
    pay_cadence: "biweekly",
    est_annual_min: estMin,
    est_annual_max: estMax,
    worker_classification: "either_negotiable",
  };
}

/** Simple hourly (hygiene / assistant / front office). */
export function hourlyComp(min: number, max: number): CompSpec {
  return {
    compensation_type: "range",
    compensation_visible: true,
    compensation_period: "hourly",
    compensation_min: min,
    compensation_max: max,
    comp_model: "simple",
    worker_classification: "w2",
  };
}

/** Simple salaried (office manager / corporate), annual band + optional bonus. */
export function salaryComp(min: number, max: number, bonusTarget?: number): CompSpec {
  return {
    compensation_type: "range",
    compensation_visible: true,
    compensation_period: "annual",
    compensation_min: min,
    compensation_max: max,
    comp_model: "simple",
    worker_classification: "w2",
    ...(bonusTarget
      ? { bonus_enabled: true, bonus_target: bonusTarget, bonus_structure: "Annual performance bonus." }
      : {}),
  };
}

/* ──────────────────────────────────────────────────────────────
 * Job archetypes
 * ─────────────────────────────────────────────────────────── */

export interface ScreeningQ {
  prompt: string;
  kind: "short_text" | "long_text" | "yes_no" | "single_select" | "multi_select" | "number" | "scale";
  required: boolean;
  knockout?: boolean;
  options?: { label: string; value: string }[];
  knockout_correct_answer?: unknown;
}

export interface JobArchetype {
  key: string;
  title: string;
  role_category: string;
  employment_type: string;
  scope: "location" | "regional" | "corporate";
  corporate_function?: string;
  specialty: string[];
  skills: string[];
  benefits: string[];
  requirements: string;
  /** Description MUST name the PMS so detectJobPms picks it up for fit. */
  pms: string;
  description: string;
  comp: CompSpec;
  minYears: number;
  scheduleDays: string[];
  evenings: boolean;
  weekends: boolean;
  screening: ScreeningQ[];
  verifications: string[];
  /** corporate-track signal columns for DSOFit. */
  authority_level?: string;
  work_mode?: string;
  travel_expectation?: string;
  direct_reports_band?: string;
  indirect_reports_band?: string;
  industry_experience?: string;
  domain_preference?: string;
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri"];

const COMMON_BENEFITS = ["Health insurance", "401(k) match", "PTO", "CE allowance", "Malpractice coverage"];

const STD_SCREENING: ScreeningQ[] = [
  {
    prompt: "Are you currently licensed (or license-eligible) to practice in this state?",
    kind: "yes_no",
    required: true,
    knockout: true,
    knockout_correct_answer: true,
  },
  {
    prompt: "What's your earliest available start date?",
    kind: "single_select",
    required: true,
    options: [
      { label: "Immediately", value: "immediate" },
      { label: "Within 2 weeks", value: "2_weeks" },
      { label: "Within a month", value: "1_month" },
      { label: "Just exploring", value: "passive" },
    ],
  },
  {
    prompt: "Briefly, what are you looking for in your next role?",
    kind: "long_text",
    required: false,
  },
];

export const JOB_ARCHETYPES: JobArchetype[] = [
  {
    key: "associate_dentist",
    title: "Associate Dentist",
    role_category: "dentist",
    employment_type: "full_time",
    scope: "location",
    specialty: ["general_dentistry"],
    skills: ["Crown & bridge", "Molar endo", "Clear aligners", "Same-day crowns"],
    benefits: [...COMMON_BENEFITS, "Partnership track"],
    requirements: "DDS/DMD, active state license, comfort with bread-and-butter restorative and basic endo.",
    pms: "Dentrix",
    description:
      "Join a clinician-led practice with full schedules from day one. We run Dentrix and CEREC, keep labs in-house-paid, and protect doctor autonomy on treatment planning. Strong hygiene support and a real mentorship bench.",
    comp: dentistComp(175000, 260000),
    minYears: 2,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: ["professional_license", "certification", "background_check_consent"],
  },
  {
    key: "associate_dentist_new_grad",
    title: "Associate Dentist (New Grad Friendly)",
    role_category: "dentist",
    employment_type: "full_time",
    scope: "location",
    specialty: ["general_dentistry"],
    skills: ["Restorative", "Extractions", "Clear aligners"],
    benefits: [...COMMON_BENEFITS, "New-grad mentorship", "Loan repayment assistance"],
    requirements: "DDS/DMD, active or pending state license. New graduates encouraged to apply.",
    pms: "Open Dental",
    description:
      "A mentorship-first associate role for early-career dentists. Shadow senior doctors, ramp at your pace, and grow into a full schedule. We run Open Dental and provide a dedicated CE budget.",
    comp: dentistComp(160000, 220000),
    minYears: 0,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: ["professional_license"],
  },
  {
    key: "hygienist",
    title: "Dental Hygienist",
    role_category: "dental_hygienist",
    employment_type: "full_time",
    scope: "location",
    specialty: ["general_dentistry"],
    skills: ["Scaling & root planing", "Periodontal therapy", "Local anesthesia", "Intraoral imaging"],
    benefits: COMMON_BENEFITS,
    requirements: "RDH with active state license; local anesthesia certification preferred.",
    pms: "Eaglesoft",
    description:
      "Hygiene-driven practice with assisted hygiene and modern perio protocols. We run Eaglesoft and Dexis sensors. Predictable schedule, supportive doctors.",
    comp: hourlyComp(45, 62),
    minYears: 1,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: ["professional_license", "certification"],
  },
  {
    key: "dental_assistant",
    title: "Dental Assistant",
    role_category: "dental_assistant",
    employment_type: "full_time",
    scope: "location",
    specialty: ["general_dentistry"],
    skills: ["Four-handed dentistry", "Sterilization", "Radiographs", "CEREC milling"],
    benefits: COMMON_BENEFITS,
    requirements: "Expanded functions certification and radiology certification preferred.",
    pms: "Dentrix",
    description:
      "Busy restorative practice seeking a steady, detail-oriented assistant. We run Dentrix and CEREC; radiology and EFDA certs are a plus.",
    comp: hourlyComp(22, 32),
    minYears: 1,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: true,
    screening: STD_SCREENING,
    verifications: ["certification"],
  },
  {
    key: "office_manager",
    title: "Dental Office Manager",
    role_category: "office_manager",
    employment_type: "full_time",
    scope: "location",
    specialty: [],
    skills: ["Scheduling optimization", "Insurance verification", "Team leadership", "KPIs & reporting"],
    benefits: [...COMMON_BENEFITS, "Quarterly bonus"],
    requirements: "3+ years dental front-office leadership; PMS administration experience.",
    pms: "Denticon",
    description:
      "Lead the front office of a high-volume practice. Own scheduling, insurance, collections, and team development. We run Denticon across the group.",
    comp: salaryComp(62000, 82000, 8000),
    minYears: 3,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: [],
  },
  {
    key: "treatment_coordinator",
    title: "Treatment Coordinator",
    role_category: "treatment_coordinator",
    employment_type: "full_time",
    scope: "location",
    specialty: [],
    skills: ["Case presentation", "Financial arrangements", "Patient communication"],
    benefits: COMMON_BENEFITS,
    requirements: "Dental front-office or assisting background; strong case-acceptance track record.",
    pms: "Dentrix",
    description:
      "Own the patient journey from diagnosis to scheduled treatment. Present cases, arrange financing, and drive case acceptance. Dentrix shop.",
    comp: hourlyComp(24, 34),
    minYears: 2,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: [],
  },
  {
    key: "endodontist",
    title: "Endodontist",
    role_category: "specialist",
    employment_type: "part_time",
    scope: "regional",
    specialty: ["endodontics"],
    skills: ["Microsurgery", "Rotary endo", "CBCT interpretation", "Retreatment"],
    benefits: [...COMMON_BENEFITS, "Travel stipend"],
    requirements: "Endodontics residency; active state license; CBCT experience.",
    pms: "Carestream Soft Dent",
    description:
      "Traveling endodontist role covering several Front Range offices. Modern microscopes, CBCT at every site. We run Carestream.",
    comp: specialistComp(280000, 420000),
    minYears: 3,
    scheduleDays: ["mon", "wed", "fri"],
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: ["professional_license", "certification"],
  },
  {
    key: "pediatric_dentist",
    title: "Pediatric Dentist",
    role_category: "specialist",
    employment_type: "full_time",
    scope: "location",
    specialty: ["pediatric_dentistry"],
    skills: ["Behavior guidance", "Pulpotomies", "Stainless steel crowns", "Nitrous sedation"],
    benefits: [...COMMON_BENEFITS, "Sign-on bonus"],
    requirements: "Pediatric dentistry residency; active state license.",
    pms: "Open Dental",
    description:
      "Kid-focused practice with a play-based operatory design. Nitrous available; strong assisting support. Open Dental shop.",
    comp: specialistComp(260000, 380000),
    minYears: 2,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: ["professional_license", "certification"],
  },
  {
    key: "rcm_specialist",
    title: "Revenue Cycle Specialist",
    role_category: "other",
    employment_type: "full_time",
    scope: "corporate",
    // jobs.corporate_function CHECK has no RCM value; RCM sits under finance.
    corporate_function: "finance-accounting",
    specialty: [],
    skills: ["Dental claims", "Insurance AR", "Denial management", "Denticon", "EOB posting"],
    benefits: [...COMMON_BENEFITS, "Remote-friendly"],
    requirements: "2+ years dental billing/RCM; payer-mix and denial-management experience.",
    pms: "Denticon",
    description:
      "Own a book of AR across multiple offices: claims, denials, appeals, posting. Dental RCM experience required; we run Denticon centrally. Hybrid/remote.",
    comp: salaryComp(52000, 68000, 5000),
    minYears: 2,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: [],
    authority_level: "ic",
    work_mode: "hybrid",
    travel_expectation: "under_10",
    direct_reports_band: "zero",
    indirect_reports_band: "zero",
    industry_experience: "dso_required",
    domain_preference: "dental_preferred",
  },
  {
    key: "regional_manager",
    title: "Regional Operations Manager",
    role_category: "regional_manager",
    employment_type: "full_time",
    scope: "regional",
    corporate_function: "operations",
    specialty: [],
    skills: ["Multi-site operations", "P&L management", "Team leadership", "KPIs", "Change management"],
    benefits: [...COMMON_BENEFITS, "Annual bonus", "Vehicle allowance"],
    requirements: "5+ years multi-site healthcare/dental operations; P&L ownership across locations.",
    pms: "Denticon",
    description:
      "Own operations and P&L for a cluster of offices: staffing, KPIs, provider productivity, and patient experience. Multi-site DSO operations experience required.",
    comp: salaryComp(105000, 140000, 25000),
    minYears: 5,
    scheduleDays: WEEKDAYS,
    evenings: false,
    weekends: false,
    screening: STD_SCREENING,
    verifications: [],
    authority_level: "director",
    work_mode: "onsite",
    travel_expectation: "25_to_50",
    direct_reports_band: "10_plus",
    indirect_reports_band: "50_plus",
    industry_experience: "dso_required",
    domain_preference: "dental_preferred",
  },
];

/* ──────────────────────────────────────────────────────────────
 * Candidate personas
 *
 * HEADSHOT_PERSONAS reuse the (fictional) name encoded in the committed
 * image filenames so face↔name align. The rest are generated.
 * ─────────────────────────────────────────────────────────── */

export type Visibility = "anonymous" | "named" | "private";

export interface HeadshotPersona {
  first: string;
  last: string;
  file: string; // filename under scripts/demo-assets/headshots/
  archetype: string; // candidate archetype key
  metro: MetroKey;
  visibility: Visibility;
}

/**
 * Curated headshot personas. `file` must exist in
 * scripts/demo-assets/headshots/ (the BROKEN file is excluded by the script).
 */
export const HEADSHOT_PERSONAS: HeadshotPersona[] = [
  // The two-sided demo pair candidate — anonymous-discoverable, CO dentist.
  { first: "Maria", last: "Lopez", file: "01_maria_lopez_avatar.png", archetype: "dentist", metro: "denver", visibility: "anonymous" },
  // The named/applied demo candidate.
  { first: "Jordan", last: "Bailey", file: "02_jordan_bailey_avatar.png", archetype: "dentist", metro: "denver", visibility: "named" },
  { first: "Sarah", last: "Chen", file: "03_sarah_chen_avatar.png", archetype: "hygienist", metro: "boulder", visibility: "anonymous" },
  { first: "Michael", last: "Patel", file: "04_michael_patel_avatar.png", archetype: "dentist", metro: "aurora", visibility: "named" },
  { first: "Brittany", last: "Reyes", file: "05_brittany_reyes_avatar.png", archetype: "assistant", metro: "lakewood", visibility: "anonymous" },
  { first: "Robert", last: "Williams", file: "06_robert_williams_avatar.png", archetype: "office_manager", metro: "denver", visibility: "named" },
  { first: "Ashley", last: "Nguyen", file: "09_ashley_nguyen_avatar.png", archetype: "hygienist", metro: "fortcollins", visibility: "anonymous" },
  { first: "Destiny", last: "Carter", file: "10_destiny_carter_avatar.png", archetype: "treatment_coordinator", metro: "centennial", visibility: "named" },
  { first: "Aaron", last: "Whitfield", file: "11_aaron_whitfield_avatar.png", archetype: "rcm", metro: "denver", visibility: "anonymous" },
  { first: "Priya", last: "Raman", file: "12_priya_raman_avatar.png", archetype: "endodontist", metro: "boulder", visibility: "named" },
  { first: "Samuel", last: "Okafor", file: "13_samuel_okafor_avatar.png", archetype: "regional_manager", metro: "denver", visibility: "named" },
  { first: "Vanessa", last: "Ortiz", file: "14_vanessa_ortiz_avatar.png", archetype: "dentist", metro: "arvada", visibility: "anonymous" },
  { first: "Greg", last: "Donovan", file: "15_greg_donovan_avatar.png", archetype: "pediatric_dentist", metro: "littleton", visibility: "named" },
];

/** First/last name pools for the generated (photo-less) candidates. */
export const FIRST_NAMES = [
  "Ava", "Liam", "Sofia", "Noah", "Mia", "Ethan", "Isabella", "Mason", "Harper", "Lucas",
  "Amelia", "Elijah", "Camila", "Logan", "Layla", "Daniel", "Riley", "Gabriel", "Nora", "Henry",
  "Zoe", "Owen", "Lily", "Caleb", "Hannah", "Nathan", "Aria", "Isaac", "Ellie", "Julian",
  "Naomi", "Leo", "Paige", "Adrian", "Ruby", "Miles", "Jade", "Felix", "Iris", "Dominic",
  "Talia", "Wesley", "Simone", "Hugo", "Carmen", "Tobias", "Renata", "Marcus", "Yara", "Theo",
];

export const LAST_NAMES = [
  "Carter", "Bennett", "Russo", "Delgado", "Okonkwo", "Hayashi", "Marsh", "Solis", "Kowalski", "Abara",
  "Whitman", "Vasquez", "Lindqvist", "Mensah", "Romano", "Petrov", "Castillo", "Nakamura", "Friedman", "Osei",
  "Holloway", "Cabrera", "Andersen", "Dubois", "Saito", "Mwangi", "Ferraro", "Klein", "Navarro", "Ibrahim",
  "Sterling", "Quintero", "Larsson", "Adeyemi", "Bianchi", "Volkov", "Reyes", "Tanaka", "Goldberg", "Diallo",
];

/** Generated-candidate archetype mix (weighted by repetition). */
export const GENERATED_ARCHETYPE_MIX = [
  "dentist", "dentist", "dentist", "dentist",
  "hygienist", "hygienist", "hygienist",
  "assistant", "assistant", "assistant",
  "office_manager", "treatment_coordinator", "front_office",
  "endodontist", "pediatric_dentist",
  "rcm", "regional_manager", "finance",
];

/** Metros candidates are spread across (hero CO metros weighted heaviest). */
export const CANDIDATE_METROS: MetroKey[] = [
  "denver", "denver", "denver", "aurora", "lakewood", "boulder", "fortcollins",
  "coloradosprings", "arvada", "centennial", "thornton", "littleton",
  "madison", "milwaukee", "portland", "phoenix", "austin", "lasvegas",
];

/* ──────────────────────────────────────────────────────────────
 * Candidate archetype profiles. desired_roles use the canonical
 * candidate vocabulary so they EXACT-MATCH the job role_category they
 * target (verified against role-canonicalize.ts):
 *   dentist→associate_dentist, hygienist→hygienist, assistant→assistant,
 *   specialist→specialist_dentist, front_office→front_desk, etc.
 * Corporate archetypes leave the role to title-derived function fit.
 * ─────────────────────────────────────────────────────────── */

export type Track = "clinical" | "corporate";

export interface ArchetypeProfile {
  track: Track;
  currentTitle: string;
  headlineTpl: string;
  desiredRoles: string[];
  desiredSpecialty: string[];
  licenseType?: string; // candidate_licenses.license_type
  certKinds: string[]; // candidate_certifications.kind
  pms: string[];
  skills: string[];
  languages: string[];
  salaryUnit: "hourly" | "yearly";
  minSalary: [number, number]; // range; rng picks within
  years: [number, number];
  /** clinical practice-fit signal block (constant per archetype). */
  clinical?: {
    work_pace: string;
    autonomy_pref: string;
    mentorship_pref: string;
    patient_facing_energy: number;
    practice_feel: string;
    ce_growth_importance: number;
    work_life_priority: number;
    comp_priority: string;
    comp_priorities: string[];
    benefit_priorities: string[];
    patient_population_pref: string[];
    pms_proficiency: string;
    team_size_pref: string;
  };
  /** corporate DSOFit signal block. */
  corporate?: {
    seniority_level: string;
    mgmt_span: string;
    pl_scope: string;
    org_scale_experience: string;
    domain_background: string;
    domain_years: number;
    work_mode_pref: string;
    travel_tolerance: string;
    dsofit_function_targets: string[];
  };
}

const CLINICAL_DENTIST_SIGNALS = {
  work_pace: "steady",
  autonomy_pref: "autonomy",
  mentorship_pref: "strong",
  patient_facing_energy: 4,
  practice_feel: "midsize",
  ce_growth_importance: 5,
  work_life_priority: 4,
  comp_priority: "growth",
  comp_priorities: ["growth", "comp", "culture"],
  benefit_priorities: ["ce_allowance", "health", "partnership"],
  patient_population_pref: ["all", "cosmetic"],
  pms_proficiency: "power",
  team_size_pref: "large",
};

export const CANDIDATE_ARCHETYPES: Record<string, ArchetypeProfile> = {
  dentist: {
    track: "clinical",
    currentTitle: "Associate Dentist",
    headlineTpl: "Associate Dentist · restorative + clear aligners",
    desiredRoles: ["associate_dentist"],
    desiredSpecialty: ["general_dentistry"],
    licenseType: "DDS",
    certKinds: ["cpr_bls", "anesthesia_local", "radiology"],
    pms: ["Dentrix", "Open Dental"],
    skills: ["Crown & bridge", "Molar endo", "Clear aligners", "Same-day crowns", "Extractions"],
    languages: ["English"],
    salaryUnit: "yearly",
    minSalary: [165000, 200000],
    years: [3, 14],
    clinical: CLINICAL_DENTIST_SIGNALS,
  },
  hygienist: {
    track: "clinical",
    currentTitle: "Registered Dental Hygienist",
    headlineTpl: "RDH · perio therapy + local anesthesia",
    desiredRoles: ["hygienist"],
    desiredSpecialty: ["general_dentistry"],
    licenseType: "RDH",
    certKinds: ["cpr_bls", "anesthesia_local", "radiology"],
    pms: ["Eaglesoft", "Dentrix"],
    skills: ["Scaling & root planing", "Periodontal therapy", "Local anesthesia", "Intraoral imaging"],
    languages: ["English"],
    salaryUnit: "hourly",
    minSalary: [44, 58],
    years: [2, 16],
    clinical: {
      ...CLINICAL_DENTIST_SIGNALS,
      comp_priority: "schedule",
      comp_priorities: ["schedule", "culture", "comp"],
      pms_proficiency: "confident",
      team_size_pref: "small",
    },
  },
  assistant: {
    track: "clinical",
    currentTitle: "Dental Assistant (EFDA)",
    headlineTpl: "Expanded-functions dental assistant",
    desiredRoles: ["assistant"],
    desiredSpecialty: [],
    licenseType: "RDA",
    certKinds: ["cpr_bls", "radiology", "infection_control"],
    pms: ["Dentrix", "Eaglesoft"],
    skills: ["Four-handed dentistry", "Sterilization", "Radiographs", "CEREC milling"],
    languages: ["English", "Spanish"],
    salaryUnit: "hourly",
    minSalary: [21, 30],
    years: [1, 10],
    clinical: {
      ...CLINICAL_DENTIST_SIGNALS,
      comp_priority: "culture",
      comp_priorities: ["culture", "schedule", "comp"],
      pms_proficiency: "confident",
      team_size_pref: "small",
      ce_growth_importance: 4,
    },
  },
  office_manager: {
    track: "clinical",
    currentTitle: "Dental Office Manager",
    headlineTpl: "Dental office manager · ops + insurance",
    desiredRoles: ["office_manager"],
    desiredSpecialty: [],
    certKinds: ["hipaa", "osha"],
    pms: ["Denticon", "Dentrix"],
    skills: ["Scheduling optimization", "Insurance verification", "Team leadership", "KPIs & reporting"],
    languages: ["English"],
    salaryUnit: "yearly",
    minSalary: [60000, 80000],
    years: [4, 18],
    clinical: {
      ...CLINICAL_DENTIST_SIGNALS,
      comp_priority: "comp",
      comp_priorities: ["comp", "growth", "culture"],
      patient_facing_energy: 3,
      pms_proficiency: "power",
      team_size_pref: "large",
    },
  },
  treatment_coordinator: {
    track: "clinical",
    currentTitle: "Treatment Coordinator",
    headlineTpl: "Treatment coordinator · case acceptance",
    desiredRoles: ["treatment_coordinator"],
    desiredSpecialty: [],
    certKinds: ["hipaa"],
    pms: ["Dentrix"],
    skills: ["Case presentation", "Financial arrangements", "Patient communication"],
    languages: ["English"],
    salaryUnit: "hourly",
    minSalary: [23, 33],
    years: [2, 12],
    clinical: {
      ...CLINICAL_DENTIST_SIGNALS,
      comp_priority: "culture",
      comp_priorities: ["culture", "comp", "schedule"],
      patient_facing_energy: 5,
      pms_proficiency: "confident",
      team_size_pref: "small",
    },
  },
  front_office: {
    track: "clinical",
    currentTitle: "Front Desk Coordinator",
    headlineTpl: "Front office · scheduling + patient experience",
    desiredRoles: ["front_desk"],
    desiredSpecialty: [],
    certKinds: ["hipaa"],
    pms: ["Dentrix", "Eaglesoft"],
    skills: ["Scheduling", "Insurance verification", "Patient communication"],
    languages: ["English", "Spanish"],
    salaryUnit: "hourly",
    minSalary: [19, 27],
    years: [1, 9],
    clinical: {
      ...CLINICAL_DENTIST_SIGNALS,
      comp_priority: "schedule",
      comp_priorities: ["schedule", "culture", "location"],
      patient_facing_energy: 4,
      pms_proficiency: "adaptable",
      team_size_pref: "small",
    },
  },
  endodontist: {
    track: "clinical",
    currentTitle: "Endodontist",
    headlineTpl: "Endodontist · microsurgery + CBCT",
    desiredRoles: ["specialist_dentist"],
    desiredSpecialty: ["endodontics"],
    licenseType: "DDS",
    certKinds: ["cpr_bls", "anesthesia_local", "radiology"],
    pms: ["Carestream Soft Dent", "Dentrix"],
    skills: ["Microsurgery", "Rotary endo", "CBCT interpretation", "Retreatment"],
    languages: ["English"],
    salaryUnit: "yearly",
    minSalary: [280000, 360000],
    years: [4, 18],
    clinical: {
      ...CLINICAL_DENTIST_SIGNALS,
      comp_priority: "comp",
      comp_priorities: ["comp", "growth", "schedule"],
    },
  },
  pediatric_dentist: {
    track: "clinical",
    currentTitle: "Pediatric Dentist",
    headlineTpl: "Pediatric dentist · behavior guidance",
    desiredRoles: ["specialist_dentist"],
    desiredSpecialty: ["pediatric_dentistry"],
    licenseType: "DMD",
    certKinds: ["cpr_bls", "nitrous", "radiology"],
    pms: ["Open Dental", "Dentrix"],
    skills: ["Behavior guidance", "Pulpotomies", "Stainless steel crowns", "Nitrous sedation"],
    languages: ["English"],
    salaryUnit: "yearly",
    minSalary: [255000, 330000],
    years: [3, 15],
    clinical: {
      ...CLINICAL_DENTIST_SIGNALS,
      patient_population_pref: ["pediatric", "special_needs"],
      comp_priority: "culture",
      comp_priorities: ["culture", "comp", "schedule"],
    },
  },
  rcm: {
    track: "corporate",
    currentTitle: "Revenue Cycle Specialist",
    headlineTpl: "Dental RCM · claims, denials, AR",
    desiredRoles: ["dso_corporate"],
    desiredSpecialty: [],
    certKinds: ["hipaa"],
    pms: ["Denticon", "Dentrix"],
    skills: ["Dental claims", "Insurance AR", "Denial management", "EOB posting", "Denticon"],
    languages: ["English"],
    salaryUnit: "yearly",
    minSalary: [50000, 66000],
    years: [2, 12],
    corporate: {
      seniority_level: "ic",
      mgmt_span: "none",
      pl_scope: "none",
      org_scale_experience: "mid",
      domain_background: "dental_dso",
      domain_years: 5,
      work_mode_pref: "hybrid",
      travel_tolerance: "none",
      dsofit_function_targets: ["revenue-cycle-management"],
    },
  },
  regional_manager: {
    track: "corporate",
    currentTitle: "Regional Operations Manager",
    headlineTpl: "Multi-site dental operations leader",
    desiredRoles: ["regional_manager"],
    desiredSpecialty: [],
    certKinds: [],
    pms: ["Denticon"],
    skills: ["Multi-site operations", "P&L management", "Team leadership", "KPIs", "Change management"],
    languages: ["English"],
    salaryUnit: "yearly",
    minSalary: [105000, 145000],
    years: [7, 20],
    corporate: {
      seniority_level: "director",
      mgmt_span: "21-100",
      pl_scope: "multi_site",
      org_scale_experience: "large",
      domain_background: "dental_dso",
      domain_years: 9,
      work_mode_pref: "onsite",
      travel_tolerance: "occasional",
      dsofit_function_targets: ["operations"],
    },
  },
  finance: {
    track: "corporate",
    currentTitle: "Finance Manager",
    headlineTpl: "Healthcare finance · FP&A",
    desiredRoles: ["dso_corporate"],
    desiredSpecialty: [],
    certKinds: [],
    pms: [],
    skills: ["FP&A", "Budgeting", "Financial modeling", "Month-end close"],
    languages: ["English"],
    salaryUnit: "yearly",
    minSalary: [95000, 135000],
    years: [5, 16],
    corporate: {
      seniority_level: "manager",
      mgmt_span: "1-5",
      pl_scope: "departmental",
      org_scale_experience: "mid",
      domain_background: "adjacent_healthcare",
      domain_years: 4,
      work_mode_pref: "hybrid",
      travel_tolerance: "none",
      dsofit_function_targets: ["finance-accounting"],
    },
  },
};
