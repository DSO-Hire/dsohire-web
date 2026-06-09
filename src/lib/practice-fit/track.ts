/**
 * Role TRACKS for Practice Fit (#110, 2026-06-09).
 *
 * The pre-#110 engine had one role ladder (clinical roles + the admin rungs +
 * a dead dso_corporate node) and a hole: corporate postings store
 * role_category="other", which the gate let through unfiltered. This module
 * introduces three hard-walled tracks so a candidate is only ever scored
 * against jobs in their own world:
 *
 *   • clinical — dentists, specialists, hygienists, assistants
 *   • admin    — front desk, office manager, regional manager
 *   • corporate— DSO HQ / non-clinical functions (finance, IT, legal, BD, …)
 *
 * Cross-track pairs are dropped (a dentist never matches a Corporate Counsel
 * req; an office manager never matches a VP of Business Development req).
 * Within a track, the finer relation (clinical role-adjacency or corporate
 * function-adjacency) decides exact / adjacent / unrelated.
 *
 * The module also declares which DIMENSIONS are applicable per track, so the
 * dental-specific signals (specialty, license, certifications, PMS,
 * patient-population) can never leak into a corporate or (mostly) admin score —
 * the leak that let a fully-assessed dentist score 85 on a corporate req
 * because the culture/benefits/patient dims fired.
 */

import { canonicalizeRoleCategory } from "./role-canonicalize";
import { canonicalizeCorporateFunction, hasCorporateSignal } from "./corporate-function";
import type { CandidateFitInputs, JobFitInputs, FitDimensionKey } from "./types";

export type Track = "clinical" | "admin" | "corporate";

/** Canonical role → track, or null for "other"/unmappable. */
function trackOfCanonRole(canon: string): Track | null {
  switch (canon) {
    case "associate_dentist":
    case "specialist_dentist":
    case "hygienist":
    case "assistant":
      return "clinical";
    case "front_desk":
    case "office_manager":
    case "regional_manager":
      return "admin";
    case "dso_corporate":
      return "corporate";
    default:
      return null;
  }
}

/**
 * The job's track. Corporate jobs almost always arrive as role_category="other"
 * (categorized by corporate_function), so an "other" job WITH a resolvable
 * corporate_function is corporate. "other" with nothing → "unknown" (rare
 * legacy/edge); the caller leaves those ungated but the coverage damp keeps
 * them honest.
 */
export function jobTrack(job: JobFitInputs): Track | "unknown" {
  const canon = canonicalizeRoleCategory(job.role_category);
  const t = trackOfCanonRole(canon);
  if (t) return t;
  if (canonicalizeCorporateFunction(job.corporate_function)) return "corporate";
  return "unknown";
}

/**
 * The candidate's track(s). Derived from desired_roles first (mirroring
 * deriveCandidateRoles' preference), falling back to the resume-derived
 * current_title for the clinical/admin signal, plus a corporate signal from
 * title-keyword derivation or an explicit dso_corporate desired role. A
 * candidate can legitimately span tracks (e.g. office_manager + dso_corporate).
 * Empty set = genuinely no signal ("open to anything") → caller leaves ungated.
 */
export function candidateTracks(candidate: CandidateFitInputs): Set<Track> {
  const tracks = new Set<Track>();

  const fromDesired = (candidate.desired_roles ?? [])
    .map(canonicalizeRoleCategory)
    .map(trackOfCanonRole)
    .filter((t): t is Track => t !== null);
  for (const t of fromDesired) tracks.add(t);

  // Fall back to the title only when desired_roles yielded no clinical/admin
  // signal (matches the role-adjacency fallback contract).
  if (fromDesired.length === 0) {
    const fromTitle = trackOfCanonRole(
      canonicalizeRoleCategory(candidate.current_title)
    );
    if (fromTitle) tracks.add(fromTitle);
  }

  if (hasCorporateSignal(candidate.desired_roles, candidate.current_title)) {
    tracks.add("corporate");
  }
  return tracks;
}

const CLINICAL_CANON = new Set<string>([
  "associate_dentist",
  "specialist_dentist",
  "hygienist",
  "assistant",
]);

/**
 * #48 — does the candidate hold a clinical credential / background? Used by the
 * clinical→DSOFit bridge so a DDS/DMD (or hygienist) is welcomed into the
 * clinical-welcoming corporate functions (clinical leadership, BD, training).
 * A state license is the strongest signal; a clinical desired-role or title
 * also counts.
 */
export function isClinicallyCredentialed(candidate: CandidateFitInputs): boolean {
  if ((candidate.license_states ?? []).length > 0) return true;
  const fromDesired = (candidate.desired_roles ?? []).map(canonicalizeRoleCategory);
  if (fromDesired.some((c) => CLINICAL_CANON.has(c))) return true;
  return CLINICAL_CANON.has(canonicalizeRoleCategory(candidate.current_title));
}

/* ──────────────────────────────────────────────────────────────
 * Dimension applicability by track.
 *
 * Dental-specific signals are clinical-only. PMS fluency also matters for the
 * front office (Dentrix/Open Dental run the front desk), so it's allowed for
 * admin — but never corporate. Everything else (comp, location, skills,
 * employment, dso size, schedule, the work-style culture dims, benefits,
 * role/function fit) is universal.
 * ─────────────────────────────────────────────────────────── */

const CLINICAL_ONLY: FitDimensionKey[] = [
  "specialty",
  "license_state",
  "certifications",
  "patient_population",
];

const UNIVERSAL: FitDimensionKey[] = [
  "role_fit",
  "compensation",
  "location",
  "skills",
  "years_experience",
  "employment_type",
  "dso_size",
  "schedule_overlap",
  "work_pace",
  "autonomy",
  "mentorship",
  "ce_growth",
  "practice_feel",
  "work_life",
  "benefits",
];

export const APPLICABLE_DIMS: Record<Track, Set<FitDimensionKey>> = {
  clinical: new Set<FitDimensionKey>([
    ...UNIVERSAL,
    ...CLINICAL_ONLY,
    "pms_fluency",
  ]),
  // Front office uses the PMS; the other dental signals don't apply.
  admin: new Set<FitDimensionKey>([...UNIVERSAL, "pms_fluency"]),
  // Corporate: universal signals only — no dental dims, no PMS.
  corporate: new Set<FitDimensionKey>([...UNIVERSAL]),
};

/** Applicable-dim set for a job's track. "unknown" → universal (conservative). */
export function applicableDimsForJob(job: JobFitInputs): Set<FitDimensionKey> {
  const t = jobTrack(job);
  if (t === "unknown") return new Set<FitDimensionKey>([...UNIVERSAL, "pms_fluency"]);
  return APPLICABLE_DIMS[t];
}
