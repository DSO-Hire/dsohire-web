/**
 * Role canonicalization for Practice Fit (Phase 5D v1.2).
 *
 * Two parallel role vocabularies live in the codebase by the time v1.1
 * shipped:
 *   • Candidate-side `desired_roles` text[] uses the canonical-lists
 *     vocabulary: associate_dentist, specialist_dentist, hygienist,
 *     assistant, front_desk, office_manager, regional_manager,
 *     dso_corporate.
 *   • Jobs `role_category` Postgres enum uses the legacy job-wizard
 *     vocabulary: dentist, dental_hygienist, dental_assistant,
 *     front_office, office_manager, regional_manager, specialist,
 *     other.
 *
 * Until v1.1 the role filter compared the two vocabularies as raw
 * strings, which meant a candidate listing `assistant` as a desired
 * role looking at a `dental_assistant` posting got NO Practice Fit
 * chip — the filter zero'd them out as if they were a hygienist
 * applying to a dentist role. That was the "Practice Fit not
 * available" bug Cam saw on Jordan Bailey's application.
 *
 * v1.2 fix: canonicalize both sides through this function before
 * comparing. Storage stays unchanged (no enum migration risk; both
 * vocabularies persist), but every code path that needs to compare
 * roles uses canonicalizeRoleCategory() first.
 *
 * Dropping the enum's legacy values into Postgres requires recreating
 * the type — high blast radius. v1.3+ may consolidate; for now the
 * application-layer canonicalization gives us the bug fix without the
 * migration.
 */

/**
 * Canonical internal keys. Mirrors the candidate-side vocabulary
 * because it's strictly more granular (separates Associate vs
 * Specialist Dentist; the job side just had `dentist` + `specialist`).
 */
export type CanonicalRole =
  | "associate_dentist"
  | "specialist_dentist"
  | "hygienist"
  | "assistant"
  | "front_desk"
  | "office_manager"
  | "regional_manager"
  | "dso_corporate"
  // #77 (2026-06-12) — practice-level expansion. New values are
  // IDENTICAL on the candidate side and the jobs enum (no drift).
  | "dental_therapist"
  | "sterilization_tech"
  | "lab_tech"
  | "treatment_coordinator"
  | "financial_coordinator"
  | "scheduling_coordinator"
  | "practice_administrator"
  | "other";

/**
 * Map ANY role string (legacy job vocab, candidate vocab, casing
 * variants, hand-typed entries) into a CanonicalRole.
 *
 * Returns "other" for unknown values rather than throwing — a typo or
 * legacy value should not blow up the score path.
 *
 * Empty / null inputs return "other" so callers can treat them
 * uniformly (the score path's role filter treats "other" as
 * non-applicable when the candidate has explicit non-"other"
 * preferences, which is the right behavior).
 */
export function canonicalizeRoleCategory(raw: string | null | undefined): CanonicalRole {
  if (!raw) return "other";
  const k = raw.trim().toLowerCase();

  // Direct canonical hits.
  switch (k) {
    case "associate_dentist":
    case "specialist_dentist":
    case "hygienist":
    case "assistant":
    case "front_desk":
    case "office_manager":
    case "regional_manager":
    case "dso_corporate":
    case "dental_therapist":
    case "sterilization_tech":
    case "lab_tech":
    case "treatment_coordinator":
    case "financial_coordinator":
    case "scheduling_coordinator":
    case "practice_administrator":
    case "other":
      return k as CanonicalRole;
  }

  // Legacy job-side enum values → canonical mapping.
  switch (k) {
    case "dentist":
      // Non-specialist dentist = Associate Dentist by default.
      // Employers posting a generic "Dentist" role typically mean
      // an associate; specialty roles use "specialist" or are
      // labeled in the title.
      return "associate_dentist";
    case "dental_hygienist":
      return "hygienist";
    case "dental_assistant":
      return "assistant";
    case "front_office":
      return "front_desk";
    case "specialist":
      return "specialist_dentist";
  }

  // #77 new-role synonyms — checked BEFORE the legacy loose chain so a
  // "Treatment Coordinator" resume title can't fall through to a
  // broader rule. Most-specific first.
  if (k.includes("therapist")) return "dental_therapist";
  if (k.includes("steril")) return "sterilization_tech";
  if (k.includes("lab tech") || k.includes("laboratory") || k === "cdt") {
    return "lab_tech";
  }
  if (k.includes("treatment coord")) return "treatment_coordinator";
  if (
    k.includes("financial coord") ||
    k.includes("insurance coord") ||
    k.includes("billing coord") ||
    k.includes("insurance billing")
  ) {
    return "financial_coordinator";
  }
  if (k.includes("scheduling coord") || k.includes("schedule coord")) {
    return "scheduling_coordinator";
  }
  if (k.includes("practice admin")) return "practice_administrator";

  // Common synonyms that surface from resume parsing or hand entry.
  if (k.includes("hygien")) return "hygienist";
  if (k.includes("assistant") || k === "rda" || k === "cda" || k === "efda") {
    return "assistant";
  }
  if (k.includes("specialist") || k.includes("ortho") || k.includes("perio")
      || k.includes("endo") || k.includes("pedo") || k.includes("oral surg")) {
    return "specialist_dentist";
  }
  if (k.includes("dentist") || k === "dds" || k === "dmd") {
    return "associate_dentist";
  }
  if (k.includes("front") || k.includes("reception")) return "front_desk";
  if (k.includes("office manager") || k.includes("om")) return "office_manager";
  if (k.includes("regional") || k.includes("director of operations")) {
    return "regional_manager";
  }
  if (k.includes("corporate") || k.includes("hq") || k.includes("c-suite")) {
    return "dso_corporate";
  }

  return "other";
}

/**
 * Returns true when the canonical role category is genuinely "other"
 * (and therefore should not block matching, per the role-as-filter
 * philosophy — we never filter pairs out for being unmappable).
 */
export function isOtherRole(raw: string | null | undefined): boolean {
  return canonicalizeRoleCategory(raw) === "other";
}

/**
 * Display label for a canonical role. Used by surfaces that render the
 * canonical key directly (debug UI, future filter dropdowns). Kept in
 * sync with canonical-lists.ts ROLE_CATEGORIES labels.
 */
export const CANONICAL_ROLE_LABELS: Record<CanonicalRole, string> = {
  associate_dentist: "Dentist",
  specialist_dentist: "Specialist Dentist",
  hygienist: "Dental Hygienist",
  dental_therapist: "Dental Therapist",
  assistant: "Dental Assistant (RDA/CDA/EFDA)",
  sterilization_tech: "Sterilization Technician",
  lab_tech: "Dental Lab Technician",
  front_desk: "Front Desk / Patient Coordinator",
  treatment_coordinator: "Treatment Coordinator",
  financial_coordinator: "Financial / Insurance Coordinator",
  scheduling_coordinator: "Scheduling Coordinator",
  office_manager: "Office Manager",
  practice_administrator: "Practice Administrator",
  regional_manager: "Regional Manager",
  dso_corporate: "DSO Corporate / HQ",
  other: "Other",
};
