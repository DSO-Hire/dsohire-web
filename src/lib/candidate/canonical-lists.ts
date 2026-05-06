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
// Visibility / temp_or_perm / salary_unit (CHECK-constraint allowed values)
// ─────────────────────────────────────────────────────────────────────

export const CV_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: "open_to_work" | "recruiters_only" | "hidden";
  label: string;
  description: string;
}> = [
  {
    value: "open_to_work",
    label: "Open to work",
    description:
      "Prioritized in employer searches. Best when actively job hunting.",
  },
  {
    value: "recruiters_only",
    label: "Recruiters only",
    description:
      "Visible to verified DSO members only. Most candidates land here — privacy-positive but still discoverable.",
  },
  {
    value: "hidden",
    label: "Hidden",
    description:
      "Only employers you apply to can see your profile. You won't appear in any browse or search.",
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
