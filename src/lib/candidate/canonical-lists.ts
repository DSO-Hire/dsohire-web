/**
 * Canonical reference lists for candidate profile inputs (Phase 4.2.b).
 *
 * Every field on the candidate profile that participates in a
 * matching/discovery query (employer search, Talent Pool browse, job
 * recommendation, future Practice Fit scoring) uses one of these lists.
 * Free text on these fields is the bug Cam flagged in
 * `feedback_input_safety_rails.md` — a typo silently excludes the
 * candidate from search results forever.
 *
 * The schema columns stay `text[]` so we never DROP data the parser
 * surfaces from a resume. The UI restricts new entries to these lists
 * via combobox/chip inputs; resume-imported values that don't match
 * land as free-text but show with a "needs canonical mapping" hint.
 */

export interface CanonicalOption {
  /** Stable ID used as the stored text[] value. */
  value: string;
  /** Human-readable label rendered in chips + comboboxes. */
  label: string;
}

// ─────────────────────────────────────────────────────────────────────
// Role categories — map to existing ROLE_OPTIONS in screening library
// ─────────────────────────────────────────────────────────────────────

export const ROLE_CATEGORIES: ReadonlyArray<CanonicalOption> = [
  { value: "associate_dentist", label: "Associate Dentist" },
  { value: "specialist_dentist", label: "Specialist Dentist" },
  { value: "hygienist", label: "Dental Hygienist" },
  { value: "assistant", label: "Dental Assistant" },
  { value: "front_desk", label: "Front Desk / Receptionist" },
  { value: "office_manager", label: "Office Manager" },
  { value: "regional_manager", label: "Regional Manager" },
  { value: "dso_corporate", label: "DSO Corporate / HQ" },
];

// ─────────────────────────────────────────────────────────────────────
// Specialties
// ─────────────────────────────────────────────────────────────────────

export const SPECIALTIES: ReadonlyArray<CanonicalOption> = [
  { value: "general_dentistry", label: "General Dentistry" },
  { value: "pediatric_dentistry", label: "Pediatric Dentistry" },
  { value: "orthodontics", label: "Orthodontics" },
  { value: "endodontics", label: "Endodontics" },
  { value: "periodontics", label: "Periodontics" },
  { value: "prosthodontics", label: "Prosthodontics" },
  { value: "oral_surgery", label: "Oral & Maxillofacial Surgery" },
  { value: "oral_medicine", label: "Oral Medicine" },
  { value: "dental_anesthesiology", label: "Dental Anesthesiology" },
  { value: "public_health_dentistry", label: "Public Health Dentistry" },
];

// ─────────────────────────────────────────────────────────────────────
// License types — extend as new types surface
// ─────────────────────────────────────────────────────────────────────

export const LICENSE_TYPES: ReadonlyArray<CanonicalOption> = [
  { value: "DDS", label: "DDS — Doctor of Dental Surgery" },
  { value: "DMD", label: "DMD — Doctor of Medicine in Dentistry" },
  { value: "RDH", label: "RDH — Registered Dental Hygienist" },
  { value: "CDA", label: "CDA — Certified Dental Assistant" },
  { value: "RDA", label: "RDA — Registered Dental Assistant" },
  { value: "EFDA", label: "EFDA — Expanded Functions Dental Assistant" },
  { value: "EFODA", label: "EFODA — Expanded Functions Orthodontic" },
  { value: "RDAEF", label: "RDAEF — RDA Extended Functions" },
  { value: "OMS", label: "OMS — Oral & Maxillofacial Surgery" },
];

// ─────────────────────────────────────────────────────────────────────
// PMS systems
// ─────────────────────────────────────────────────────────────────────

export const PMS_SYSTEMS: ReadonlyArray<CanonicalOption> = [
  { value: "Dentrix", label: "Dentrix" },
  { value: "Eaglesoft", label: "Eaglesoft" },
  { value: "Open Dental", label: "Open Dental" },
  { value: "Curve Dental", label: "Curve Dental" },
  { value: "Carestream Soft Dent", label: "Carestream Soft Dent" },
  { value: "Practice-Web", label: "Practice-Web" },
  { value: "ABELDent", label: "ABELDent" },
  { value: "Denticon", label: "Denticon" },
  { value: "MOGO", label: "MOGO" },
  { value: "Tab32", label: "Tab32" },
  { value: "Adit", label: "Adit" },
];

// ─────────────────────────────────────────────────────────────────────
// Certification kinds
// ─────────────────────────────────────────────────────────────────────

export const CERTIFICATION_KINDS: ReadonlyArray<CanonicalOption> = [
  { value: "cpr_bls", label: "CPR / BLS" },
  { value: "anesthesia_local", label: "Local Anesthesia" },
  { value: "anesthesia_general", label: "General Anesthesia" },
  { value: "nitrous", label: "Nitrous Oxide Sedation" },
  { value: "sedation_oral", label: "Oral Sedation" },
  { value: "sedation_iv", label: "IV Sedation" },
  { value: "radiology", label: "Radiology / X-ray" },
  { value: "osha", label: "OSHA" },
  { value: "hipaa", label: "HIPAA" },
  { value: "infection_control", label: "Infection Control" },
  { value: "malpractice", label: "Malpractice Insurance" },
];

// ─────────────────────────────────────────────────────────────────────
// Skills — role-aware suggestions
//
// `getSkillSuggestions(desiredRoles)` returns a deduped, ordered list:
// role-specific skills first (in role order), then universal dental
// skills as the tail. Candidates can still type free-form values; the
// canonical list is just for quick-add prompts.
//
// Curated from real dental hiring listings + role-specific skill
// taxonomies. Conservative — we'd rather have a small list of recognized
// terms than a sprawling list of niche jargon.
// ─────────────────────────────────────────────────────────────────────

const ASSOCIATE_DENTIST_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Crown & bridge", label: "Crown & bridge" },
  { value: "Root canal therapy", label: "Root canal therapy" },
  { value: "Restorative dentistry", label: "Restorative dentistry" },
  { value: "Cosmetic dentistry", label: "Cosmetic dentistry" },
  { value: "Veneers", label: "Veneers" },
  { value: "Inlays/onlays", label: "Inlays/onlays" },
  { value: "Implant restorations", label: "Implant restorations" },
  { value: "Implant placement", label: "Implant placement" },
  { value: "Surgical extractions", label: "Surgical extractions" },
  { value: "Endodontics", label: "Endodontics" },
  { value: "Periodontal therapy", label: "Periodontal therapy" },
  { value: "Pediatric procedures", label: "Pediatric procedures" },
  { value: "IV sedation", label: "IV sedation" },
  { value: "Nitrous oxide", label: "Nitrous oxide" },
  { value: "Invisalign", label: "Invisalign" },
  { value: "TMJ treatment", label: "TMJ treatment" },
  { value: "Digital impressions", label: "Digital impressions" },
  { value: "CAD/CAM (CEREC)", label: "CAD/CAM (CEREC)" },
  { value: "CBCT imaging", label: "CBCT imaging" },
];

const SPECIALIST_DENTIST_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Endodontic microsurgery", label: "Endodontic microsurgery" },
  { value: "Apicoectomy", label: "Apicoectomy" },
  { value: "Bone grafting", label: "Bone grafting" },
  { value: "Sinus lifts", label: "Sinus lifts" },
  { value: "Orthognathic surgery", label: "Orthognathic surgery" },
  { value: "Clear aligners", label: "Clear aligners" },
  { value: "Traditional braces", label: "Traditional braces" },
  { value: "Temporary anchorage devices (TADs)", label: "Temporary anchorage devices (TADs)" },
  { value: "Pediatric sedation", label: "Pediatric sedation" },
  { value: "Soft tissue grafting", label: "Soft tissue grafting" },
  { value: "Crown lengthening", label: "Crown lengthening" },
];

const HYGIENIST_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Prophylaxis", label: "Prophylaxis" },
  { value: "Scaling & root planing", label: "Scaling & root planing" },
  { value: "Periodontal charting", label: "Periodontal charting" },
  { value: "Local anesthesia administration", label: "Local anesthesia administration" },
  { value: "Nitrous oxide monitoring", label: "Nitrous oxide monitoring" },
  { value: "Fluoride treatments", label: "Fluoride treatments" },
  { value: "Sealants", label: "Sealants" },
  { value: "Digital x-rays", label: "Digital x-rays" },
  { value: "Intraoral cameras", label: "Intraoral cameras" },
  { value: "Cavitron", label: "Cavitron" },
  { value: "Patient education", label: "Patient education" },
  { value: "Oral cancer screening", label: "Oral cancer screening" },
  { value: "Whitening treatments", label: "Whitening treatments" },
  { value: "Laser-assisted therapy", label: "Laser-assisted therapy" },
];

const ASSISTANT_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Four-handed dentistry", label: "Four-handed dentistry" },
  { value: "Sterilization", label: "Sterilization" },
  { value: "Tray setups", label: "Tray setups" },
  { value: "Alginate impressions", label: "Alginate impressions" },
  { value: "Digital impressions", label: "Digital impressions" },
  { value: "Temporary crowns", label: "Temporary crowns" },
  { value: "Coronal polishing", label: "Coronal polishing" },
  { value: "Sealant placement", label: "Sealant placement" },
  { value: "Radiography", label: "Radiography" },
  { value: "Patient prep", label: "Patient prep" },
  { value: "Inventory management", label: "Inventory management" },
];

const FRONT_DESK_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Insurance verification", label: "Insurance verification" },
  { value: "Insurance billing", label: "Insurance billing" },
  { value: "CDT coding", label: "CDT coding" },
  { value: "ICD-10 coding", label: "ICD-10 coding" },
  { value: "Patient scheduling", label: "Patient scheduling" },
  { value: "Recall management", label: "Recall management" },
  { value: "Phone screening", label: "Phone screening" },
  { value: "Treatment plan presentation", label: "Treatment plan presentation" },
  { value: "Payment collection", label: "Payment collection" },
  { value: "Patient intake", label: "Patient intake" },
  { value: "Multi-line phone systems", label: "Multi-line phone systems" },
];

const OFFICE_MANAGER_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Staff scheduling", label: "Staff scheduling" },
  { value: "Hiring & onboarding", label: "Hiring & onboarding" },
  { value: "Payroll", label: "Payroll" },
  { value: "Production reporting", label: "Production reporting" },
  { value: "Collections management", label: "Collections management" },
  { value: "AR/AP", label: "AR/AP" },
  { value: "Insurance contracting", label: "Insurance contracting" },
  { value: "Vendor management", label: "Vendor management" },
  { value: "KPI tracking", label: "KPI tracking" },
  { value: "OSHA training", label: "OSHA training" },
  { value: "HIPAA training", label: "HIPAA training" },
  { value: "Conflict resolution", label: "Conflict resolution" },
];

const REGIONAL_MANAGER_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Multi-location operations", label: "Multi-location operations" },
  { value: "P&L management", label: "P&L management" },
  { value: "Office manager development", label: "Office manager development" },
  { value: "Provider recruitment", label: "Provider recruitment" },
  { value: "Standard operating procedures", label: "Standard operating procedures" },
  { value: "Acquisition integration", label: "Acquisition integration" },
  { value: "EBITDA optimization", label: "EBITDA optimization" },
  { value: "Staff retention strategy", label: "Staff retention strategy" },
  { value: "Performance reviews", label: "Performance reviews" },
];

const DSO_CORPORATE_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Corporate strategy", label: "Corporate strategy" },
  { value: "M&A integration", label: "M&A integration" },
  { value: "Revenue cycle management", label: "Revenue cycle management" },
  { value: "Compliance program", label: "Compliance program" },
  { value: "Vendor negotiations", label: "Vendor negotiations" },
  { value: "Multi-state operations", label: "Multi-state operations" },
];

/** Skills universally relevant across every dental role. Always appended
 *  to the role-specific suggestions so the tail of the quick-add list
 *  has them, and they're the full fallback when no roles are set. */
export const UNIVERSAL_DENTAL_SKILLS: ReadonlyArray<CanonicalOption> = [
  { value: "Patient communication", label: "Patient communication" },
  { value: "Anxious patient management", label: "Anxious patient management" },
  { value: "Treatment planning", label: "Treatment planning" },
  { value: "Pediatric patients", label: "Pediatric patients" },
  { value: "Spanish-speaking patients", label: "Spanish-speaking patients" },
  { value: "OSHA compliance", label: "OSHA compliance" },
  { value: "HIPAA compliance", label: "HIPAA compliance" },
  { value: "Infection control", label: "Infection control" },
  { value: "Team leadership", label: "Team leadership" },
];

/** Map keyed by ROLE_CATEGORIES.value. */
export const SKILLS_BY_ROLE: Record<string, ReadonlyArray<CanonicalOption>> = {
  associate_dentist: ASSOCIATE_DENTIST_SKILLS,
  specialist_dentist: SPECIALIST_DENTIST_SKILLS,
  hygienist: HYGIENIST_SKILLS,
  assistant: ASSISTANT_SKILLS,
  front_desk: FRONT_DESK_SKILLS,
  office_manager: OFFICE_MANAGER_SKILLS,
  regional_manager: REGIONAL_MANAGER_SKILLS,
  dso_corporate: DSO_CORPORATE_SKILLS,
};

/**
 * Build a deduped, ordered skill suggestion list for a candidate.
 * Order: skills from each desired role in order → universal skills.
 * Returns the universal list when no desired roles are set.
 */
export function getSkillSuggestions(
  desiredRoles: ReadonlyArray<string>
): ReadonlyArray<CanonicalOption> {
  const seen = new Set<string>();
  const out: CanonicalOption[] = [];

  const append = (list: ReadonlyArray<CanonicalOption>) => {
    for (const opt of list) {
      if (!seen.has(opt.value)) {
        seen.add(opt.value);
        out.push(opt);
      }
    }
  };

  if (desiredRoles.length === 0) {
    append(UNIVERSAL_DENTAL_SKILLS);
    return out;
  }

  for (const role of desiredRoles) {
    const list = SKILLS_BY_ROLE[role];
    if (list) append(list);
  }
  append(UNIVERSAL_DENTAL_SKILLS);
  return out;
}

/**
 * Flat, deduped, sorted list of every canonical dental skill across all
 * roles + universals. Used by the JOB-side picker (where the employer
 * doesn't have a "desired role" context to scope to) so both sides
 * draw from the same pool. v1.6.
 */
export function getAllDentalSkills(): ReadonlyArray<CanonicalOption> {
  const seen = new Set<string>();
  const out: CanonicalOption[] = [];
  const append = (list: ReadonlyArray<CanonicalOption>) => {
    for (const opt of list) {
      if (!seen.has(opt.value)) {
        seen.add(opt.value);
        out.push(opt);
      }
    }
  };
  for (const list of Object.values(SKILLS_BY_ROLE)) append(list);
  append(UNIVERSAL_DENTAL_SKILLS);
  // Sort alphabetically so the picker's quick-add list scans cleanly.
  return [...out].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Maps a job `role_category` enum value to its SKILLS_BY_ROLE key. The two
 * vocabularies diverged (e.g. role_category "dentist" vs skills key
 * "associate_dentist"), which silently dropped role prioritization for most
 * roles — the picker fell back to the full alphabetical pool. Fixed 2026-05-22.
 */
export const ROLE_CATEGORY_TO_SKILLS_KEY: Record<string, string> = {
  dentist: "associate_dentist",
  specialist: "specialist_dentist",
  dental_hygienist: "hygienist",
  dental_assistant: "assistant",
  front_office: "front_desk",
  office_manager: "office_manager",
  regional_manager: "regional_manager",
  other: "dso_corporate", // corporate-scope jobs carry role_category="other"
};

/**
 * Role-aware skill suggestions for the JD wizard's Preferred-skills picker.
 * Returns role-specific skills first (declaration order — typically ordered
 * most-essential first by the canonical-list author), then
 * UNIVERSAL_DENTAL_SKILLS.
 *
 * Strict scoping (2026-05-26 fix): we DELIBERATELY do NOT append other
 * roles' skills. Previously the tail appended every other role's skills
 * alphabetically, which surfaced things like "Office manager development"
 * (a Regional Manager skill) on every other role's picker — confusing and
 * off-spec. This now mirrors `getJobRequirementsPrioritized` which has
 * always been strict-scoped for the same reason. Custom typing (Enter to
 * add) remains the escape hatch for any cross-role skill a recruiter wants.
 *
 * If `role` is null/undefined or unknown, falls back to getAllDentalSkills
 * (full alphabetical pool) so the picker still works when role isn't set yet.
 */
export function getAllDentalSkillsPrioritized(
  role: string | null | undefined
): ReadonlyArray<CanonicalOption> {
  // Normalize role_category → skills key; also accept a direct skills key.
  const skillsKey = role
    ? (ROLE_CATEGORY_TO_SKILLS_KEY[role] ?? role)
    : undefined;
  const roleList = skillsKey ? SKILLS_BY_ROLE[skillsKey] : undefined;
  if (!roleList) return getAllDentalSkills();

  const seen = new Set<string>();
  const out: CanonicalOption[] = [];

  const append = (list: ReadonlyArray<CanonicalOption>) => {
    for (const opt of list) {
      if (!seen.has(opt.value)) {
        seen.add(opt.value);
        out.push(opt);
      }
    }
  };

  // 1. Role-specific skills first (declaration order — typically ordered
  //    most-essential first by the canonical-list author)
  append(roleList);
  // 2. Universal skills next — relevant across roles
  append(UNIVERSAL_DENTAL_SKILLS);

  return out;
}

// ─────────────────────────────────────────────────────────────────────
// Job requirements (employer JD wizard) — role-specific curated lists
// ─────────────────────────────────────────────────────────────────────
// Note 6 (Dave call 2026-05-21): the wizard's Requirements field was a raw
// free-text textarea. Cam wants a role-specific chooser (chips) with custom
// typing still allowed — "the less we have free type for them, the cleaner
// everything will be." These mirror SKILLS_BY_ROLE: keyed by the same role
// keys, normalized from a job's role_category via ROLE_CATEGORY_TO_SKILLS_KEY.
// The wizard joins selected chips with newlines so jobs.requirements stays a
// plain text column (no migration; the listing already renders it as
// whitespace-pre-wrap, so newline-joined chips display one-per-line exactly
// as the old textarea did). For requirements the canonical value IS the full
// sentence (it's shown verbatim on the listing), so value === label.

const req = (s: string): CanonicalOption => ({ value: s, label: s });

/** Requirements that apply across essentially every dental role. */
export const UNIVERSAL_JOB_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("Authorized to work in the United States"),
  req("Reliable, punctual, and team-oriented"),
  req("Strong communication and patient-service skills"),
  req("Commitment to patient-centered, compassionate care"),
  req("Background check upon offer"),
];

const ASSOCIATE_DENTIST_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("DDS or DMD from an accredited dental school"),
  req("Active state dental license (or license-eligible)"),
  req("Current DEA registration (or eligibility to obtain)"),
  req("BLS / CPR certification"),
  req("Malpractice insurance (or eligibility to obtain)"),
  req("Comfortable with restorative, crown & bridge, and extractions"),
  req("1+ years of clinical experience (new graduates welcome)"),
];

const SPECIALIST_DENTIST_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("DDS or DMD plus an accredited specialty residency"),
  req("Active state dental license"),
  req("Board-certified or board-eligible in specialty"),
  req("Current DEA registration"),
  req("BLS / CPR certification (ACLS for sedation cases)"),
  req("Malpractice insurance (or eligibility to obtain)"),
  req("Demonstrated experience with specialty case load"),
];

const HYGIENIST_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("Associate or Bachelor's degree in Dental Hygiene"),
  req("Active state dental hygiene license (RDH)"),
  req("Local anesthesia / nitrous certification (state-dependent)"),
  req("BLS / CPR certification"),
  req("Experience with scaling, root planing, and periodontal therapy"),
  req("Comfortable with digital radiography and intraoral imaging"),
  req("1+ years of clinical hygiene experience (new graduates welcome)"),
];

const ASSISTANT_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("High school diploma or equivalent"),
  req("Dental Assisting certificate or equivalent on-the-job training"),
  req("Radiology / X-ray certification (state-dependent)"),
  req("Expanded Functions certification a plus (state-dependent)"),
  req("BLS / CPR certification"),
  req("Chairside assisting experience"),
  req("Familiar with sterilization and OSHA protocols"),
];

const FRONT_DESK_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("High school diploma or equivalent"),
  req("1+ years front office or customer service experience"),
  req("Experience with dental practice management software"),
  req("Insurance verification and claims familiarity"),
  req("Strong phone, scheduling, and organizational skills"),
  req("Professional, welcoming demeanor"),
];

const OFFICE_MANAGER_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("3+ years dental office experience, including a lead role"),
  req("Proficiency with practice management software"),
  req("Experience with insurance, billing, and AR management"),
  req("Team scheduling and staff supervision experience"),
  req("Strong organizational and conflict-resolution skills"),
  req("Working knowledge of OSHA / HIPAA compliance"),
];

const REGIONAL_MANAGER_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("5+ years multi-site dental or healthcare operations experience"),
  req("Proven P&L and budget management"),
  req("Experience developing office managers across locations"),
  req("Willingness to travel between practices"),
  req("Strong analytical and reporting skills"),
  req("Bachelor's degree preferred"),
];

const DSO_CORPORATE_REQUIREMENTS: ReadonlyArray<CanonicalOption> = [
  req("Bachelor's degree or equivalent experience in a relevant field"),
  req("Experience in a DSO, healthcare, or multi-site environment"),
  req("Strong cross-functional collaboration skills"),
  req("Comfort with data, reporting, and KPIs"),
  req("Excellent written and verbal communication"),
];

/** Map keyed by the same role keys as SKILLS_BY_ROLE. */
export const REQUIREMENTS_BY_ROLE: Record<
  string,
  ReadonlyArray<CanonicalOption>
> = {
  associate_dentist: ASSOCIATE_DENTIST_REQUIREMENTS,
  specialist_dentist: SPECIALIST_DENTIST_REQUIREMENTS,
  hygienist: HYGIENIST_REQUIREMENTS,
  assistant: ASSISTANT_REQUIREMENTS,
  front_desk: FRONT_DESK_REQUIREMENTS,
  office_manager: OFFICE_MANAGER_REQUIREMENTS,
  regional_manager: REGIONAL_MANAGER_REQUIREMENTS,
  dso_corporate: DSO_CORPORATE_REQUIREMENTS,
};

/**
 * Flat, deduped list of every canonical requirement + universals,
 * alphabetical. Used when the job's role is unknown so the picker still
 * has a sensible quick-add pool. Custom typing always remains available.
 */
export function getAllJobRequirements(): ReadonlyArray<CanonicalOption> {
  const seen = new Set<string>();
  const out: CanonicalOption[] = [];
  const append = (list: ReadonlyArray<CanonicalOption>) => {
    for (const opt of list) {
      if (!seen.has(opt.value)) {
        seen.add(opt.value);
        out.push(opt);
      }
    }
  };
  for (const list of Object.values(REQUIREMENTS_BY_ROLE)) append(list);
  append(UNIVERSAL_JOB_REQUIREMENTS);
  return [...out].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Role-aware requirement suggestions for the JD wizard's Requirements
 * picker. Returns role-specific requirements first (declaration order —
 * authored most-essential first: license, education, then competencies),
 * then UNIVERSAL_JOB_REQUIREMENTS. Unlike skills, requirements are
 * role-bound (a hygienist license has no business surfacing on a front-desk
 * job), so we deliberately DON'T append other roles' requirements — the
 * custom-type escape hatch covers anything missing.
 *
 * Accepts a job role_category enum value (normalized via
 * ROLE_CATEGORY_TO_SKILLS_KEY) or a direct REQUIREMENTS_BY_ROLE key.
 * Falls back to the full alphabetical pool when role is unknown.
 */
export function getJobRequirementsPrioritized(
  role: string | null | undefined
): ReadonlyArray<CanonicalOption> {
  const key = role ? (ROLE_CATEGORY_TO_SKILLS_KEY[role] ?? role) : undefined;
  const roleList = key ? REQUIREMENTS_BY_ROLE[key] : undefined;
  if (!roleList) return getAllJobRequirements();

  const seen = new Set<string>();
  const out: CanonicalOption[] = [];
  const append = (list: ReadonlyArray<CanonicalOption>) => {
    for (const opt of list) {
      if (!seen.has(opt.value)) {
        seen.add(opt.value);
        out.push(opt);
      }
    }
  };
  append(roleList);
  append(UNIVERSAL_JOB_REQUIREMENTS);
  return out;
}

/**
 * Canonical synonym → canonical-value table for skill normalization
 * (resume parser + free-text fallbacks). Lowercase keys, canonical
 * value matches the canonical SKILLS list exactly.
 *
 * Conservative — only obvious synonyms. We'd rather miss a match than
 * silently re-tag a skill the candidate meant differently.
 */
export const SKILL_SYNONYMS: Readonly<Record<string, string>> = {
  // Hygiene
  "prophy": "Prophylaxis",
  "scaling": "Scaling & root planing",
  "srp": "Scaling & root planing",
  "perio charting": "Periodontal charting",
  // Restorative
  "fillings": "Restorative dentistry",
  "restorations": "Restorative dentistry",
  "crowns": "Crown & bridge",
  "bridges": "Crown & bridge",
  "rct": "Root canal therapy",
  "root canals": "Root canal therapy",
  "endo": "Endodontics",
  "perio": "Periodontal therapy",
  // Imaging
  "x-rays": "Digital x-rays",
  "xrays": "Digital x-rays",
  "pano": "CBCT imaging",
  "panoramic": "CBCT imaging",
  // Sedation / pain
  "n2o": "Nitrous oxide",
  "laughing gas": "Nitrous oxide",
  "iv": "IV sedation",
  // CAD/CAM
  "cerec": "CAD/CAM (CEREC)",
  "itero": "Digital impressions",
  "trios": "Digital impressions",
  // Clinical assistant
  "4-handed": "Four-handed dentistry",
  "four handed": "Four-handed dentistry",
  "sterile": "Sterilization",
  "autoclave": "Sterilization",
  // Front desk
  "billing": "Insurance billing",
  "scheduling": "Patient scheduling",
  "intake": "Patient intake",
  "cdt": "CDT coding",
  "icd-10": "ICD-10 coding",
  "icd 10": "ICD-10 coding",
  // Soft / universal
  "communication": "Patient communication",
  "spanish": "Spanish-speaking patients",
  "se habla espanol": "Spanish-speaking patients",
  "bilingual": "Spanish-speaking patients",
  "osha": "OSHA compliance",
  "hipaa": "HIPAA compliance",
  "infection": "Infection control",
};

/**
 * Map a free-text skill string to its canonical value when possible.
 * Falls back to the trimmed input. v1.6.
 */
export function canonicalizeSkill(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();

  // 1. Direct hit on the canonical-value casing-insensitive lookup.
  for (const opt of getAllDentalSkills()) {
    if (opt.value.toLowerCase() === lower) return opt.value;
  }

  // 2. Known synonym table (lowercase keys).
  if (SKILL_SYNONYMS[lower]) return SKILL_SYNONYMS[lower];

  // 3. Substring fallback — the input contains a canonical label.
  // Conservative: only if the input is reasonably close to the label
  // length, to avoid "patient education materials specialist" matching
  // "Patient education".
  for (const opt of getAllDentalSkills()) {
    const optLower = opt.value.toLowerCase();
    if (lower === optLower) return opt.value;
    // Substring match within 30% length tolerance
    if (optLower.length >= 6 && lower.includes(optLower)
        && lower.length <= optLower.length * 1.3) {
      return opt.value;
    }
  }

  // 4. No match — return the trimmed original. The candidate keeps
  // their custom language and we don't silently retag.
  return trimmed;
}

// ─────────────────────────────────────────────────────────────────────
// Benefits — canonical list of common DSO perks. Job-side chip-picker
// (v1.6) draws from this so employers don't type "401k", "401(k)",
// "401-K" inconsistently. Candidates don't have a "desired benefits"
// field today, but the canonical vocab makes future filtering /
// matching feasible without re-typing.
// ─────────────────────────────────────────────────────────────────────

export const BENEFITS: ReadonlyArray<CanonicalOption> = [
  // Insurance
  { value: "Health insurance", label: "Health insurance" },
  { value: "Dental insurance", label: "Dental insurance" },
  { value: "Vision insurance", label: "Vision insurance" },
  { value: "Life insurance", label: "Life insurance" },
  { value: "Short-term disability", label: "Short-term disability" },
  { value: "Long-term disability", label: "Long-term disability" },
  // Retirement
  { value: "401(k)", label: "401(k)" },
  { value: "401(k) match", label: "401(k) match" },
  // Time off
  { value: "Paid time off (PTO)", label: "Paid time off (PTO)" },
  { value: "Paid holidays", label: "Paid holidays" },
  { value: "Paid sick leave", label: "Paid sick leave" },
  { value: "Paid maternity / paternity leave", label: "Paid maternity / paternity leave" },
  // Professional development
  { value: "CE allowance", label: "CE allowance" },
  { value: "License renewal reimbursement", label: "License renewal reimbursement" },
  { value: "Mentorship program", label: "Mentorship program" },
  { value: "Professional dues / membership", label: "Professional dues / membership" },
  // Financial
  { value: "Sign-on bonus", label: "Sign-on bonus" },
  { value: "Production bonus", label: "Production bonus" },
  { value: "Relocation assistance", label: "Relocation assistance" },
  { value: "Student loan repayment", label: "Student loan repayment" },
  { value: "Equity / partnership track", label: "Equity / partnership track" },
  // Wellness / lifestyle
  { value: "Free dental for staff + family", label: "Free dental for staff + family" },
  { value: "Discounted dental for friends", label: "Discounted dental for friends" },
  { value: "Mental health support", label: "Mental health support" },
  { value: "Gym / wellness stipend", label: "Gym / wellness stipend" },
  // Schedule
  { value: "Flexible schedule", label: "Flexible schedule" },
  { value: "4-day work week", label: "4-day work week" },
  { value: "No nights / weekends", label: "No nights / weekends" },
  { value: "Remote / hybrid (eligible roles)", label: "Remote / hybrid (eligible roles)" },
];

// ─────────────────────────────────────────────────────────────────────
// Languages — minimal seed; the chip input lets candidates add free-form
// for less common languages, since there's no matching impact.
// ─────────────────────────────────────────────────────────────────────

export const COMMON_LANGUAGES: ReadonlyArray<CanonicalOption> = [
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "Mandarin", label: "Mandarin" },
  { value: "Vietnamese", label: "Vietnamese" },
  { value: "French", label: "French" },
  { value: "Portuguese", label: "Portuguese" },
  { value: "Arabic", label: "Arabic" },
  { value: "Korean", label: "Korean" },
  { value: "Tagalog", label: "Tagalog" },
  { value: "Russian", label: "Russian" },
  { value: "Hindi", label: "Hindi" },
  { value: "ASL (American Sign Language)", label: "ASL (American Sign Language)" },
];

// ─────────────────────────────────────────────────────────────────────
// Patient populations (PracticeFit v3.1)
//
// Shared vocab for both sides of the patient-population match: the candidate
// assessment ("which patients do you most enjoy caring for?") and the employer
// practice profile ("which patient populations you serve"). Values MUST match
// the candidate PATIENT_POPULATION_OPTIONS in the assessment config so the
// engine compares tokens directly. The candidate side additionally offers an
// "all" option ("I enjoy all populations") — a no-penalty universal answer,
// not a discriminating population, so it's not listed here.
// ─────────────────────────────────────────────────────────────────────

export const PATIENT_POPULATIONS: ReadonlyArray<CanonicalOption> = [
  { value: "pediatric", label: "Children / pediatric" },
  { value: "geriatric", label: "Older adults" },
  { value: "special_needs", label: "Special-needs patients" },
  { value: "anxious", label: "Anxious / phobic patients" },
  { value: "cosmetic", label: "Cosmetic-focused" },
  { value: "underserved", label: "Underserved / community health" },
];

// ─────────────────────────────────────────────────────────────────────
// Visibility / temp_or_perm / salary_unit (CHECK-constraint allowed values)
// ─────────────────────────────────────────────────────────────────────

export const CV_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: "open_to_work" | "recruiters_only" | "hidden";
  label: string;
  description: string;
}> = [
  // Cam 2026-05-07: tightened so each option names a concrete behavior
  // the other two don't have. The original copy overlapped — every
  // option said "discoverable to DSOs" in different words.
  {
    value: "open_to_work",
    label: "Open to work",
    description:
      "Boosted in DSO searches with a green badge. Pick this when you're actively interviewing.",
  },
  {
    value: "recruiters_only",
    label: "Recruiters only",
    description:
      "Discoverable by signed-in DSOs but not boosted. The default for working professionals who want to be findable without flagging an active search.",
  },
  {
    value: "hidden",
    label: "Hidden",
    description:
      "Invisible to every DSO except those you've applied to. You won't show up in any browse or search.",
  },
];

export const TEMP_OR_PERM_OPTIONS: ReadonlyArray<{
  value: "temp" | "perm" | "either";
  label: string;
}> = [
  { value: "perm", label: "Permanent / W-2" },
  { value: "temp", label: "Temp / Contract" },
  { value: "either", label: "Either" },
];

export const SALARY_UNIT_OPTIONS: ReadonlyArray<{
  value: "hourly" | "yearly" | "per_visit" | "per_day";
  label: string;
}> = [
  { value: "hourly", label: "Per hour" },
  { value: "yearly", label: "Per year" },
  { value: "per_day", label: "Per day" },
  { value: "per_visit", label: "Per visit" },
];

// ─────────────────────────────────────────────────────────────────────
// Schedule preferences keys (jsonb shape)
// ─────────────────────────────────────────────────────────────────────

export interface SchedulePreferences {
  mon?: boolean;
  tue?: boolean;
  wed?: boolean;
  thu?: boolean;
  fri?: boolean;
  sat?: boolean;
  sun?: boolean;
  evenings?: boolean;
  willing_to_relocate?: boolean;
}

export const WEEKDAY_KEYS: ReadonlyArray<{
  key: keyof SchedulePreferences;
  label: string;
}> = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];
