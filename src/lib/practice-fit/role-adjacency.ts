/**
 * Role-adjacency matrix for Practice Fit v2 (Phase A.1, 2026-06-03).
 *
 * v1 treated role as a binary hard filter: a candidate's `desired_roles`
 * had to *contain* the job's role or the pair was dropped. That left two
 * holes:
 *   1. Candidates with EMPTY desired_roles ("open to anything") were
 *      scored against *every* role — so a Front-Desk candidate could
 *      show "Solid fit" on a Chief Legal Officer / DSO-corporate req
 *      (the CLO bug Cam flagged). v1 had no notion of the candidate's
 *      ACTUAL role.
 *   2. An exact role match and a merely-adjacent one (hygienist viewing
 *      an assistant req) scored identically — no credit for being spot-on.
 *
 * v2 replaces the binary filter with a three-way relation:
 *   • exact     — same canonical role          → full role credit (100)
 *   • adjacent  — a neighbouring role          → partial credit (60)
 *   • unrelated — different track entirely      → pair is dropped (null)
 *
 * Candidate role signal is derived from `desired_roles` first; when that's
 * empty we fall back to the resume-derived `current_title`. Only when we
 * have NO role signal at all do we leave the pair ungated (genuinely
 * "open"), and the role_fit dimension is excluded rather than guessed.
 *
 * Adjacency is defined as explicit, symmetric neighbour pairs — NOT
 * transitive. Front-desk neighbours Office-Manager, Office-Manager
 * neighbours Regional-Manager, Regional neighbours DSO-Corporate — but
 * Front-desk is two hops from DSO-Corporate, so they're unrelated. That
 * non-transitivity is exactly what kills the CLO bug.
 */

import {
  canonicalizeRoleCategory,
  type CanonicalRole,
} from "./role-canonicalize";

export type RoleRelation = "exact" | "adjacent" | "unrelated";

/**
 * Symmetric neighbour map. Every pair listed here is mutual (if A lists B,
 * B lists A) — there's a unit test that asserts symmetry so the table can't
 * drift. Clinical and administrative tracks never touch.
 */
export const ROLE_ADJACENCY: Record<CanonicalRole, CanonicalRole[]> = {
  // Doctors — an associate and a specialist are clinically neighbouring.
  associate_dentist: ["specialist_dentist"],
  specialist_dentist: ["associate_dentist"],
  // Clinical support — hygienist and assistant (incl. EFDA) overlap
  // chairside. #77: dental therapist neighbours the hygienist (licensed
  // preventive provider with overlapping scope) but deliberately NOT the
  // dentist — symmetric adjacency would credit a therapist 60% on a
  // dentist req they can't legally hold. Sterilization tech neighbours
  // the assistant (sterile processing IS an assistant duty and the
  // common entry path) and the lab tech (non-chairside technical
  // support cluster). Lab tech stays two hops from the assistant — its
  // bench craft doesn't transfer chairside.
  hygienist: ["assistant", "dental_therapist"],
  dental_therapist: ["hygienist"],
  assistant: ["hygienist", "sterilization_tech"],
  sterilization_tech: ["assistant", "lab_tech"],
  lab_tech: ["sterilization_tech"],
  // Administrative ladder — each rung neighbours the next, not across
  // gaps. #77 expansion: the coordinator family sits beside the front
  // desk (treatment/financing intertwine; scheduling is front-desk
  // scope); practice administrator is the office manager's senior
  // sibling. Cam 2026-06-12: regional manager MOVED to the corporate
  // (DSOFit) track — its only neighbour now is dso_corporate (the
  // track gate kills cross-track pairs regardless; the matrix stays
  // track-pure so the symmetry test reads true to the model).
  front_desk: ["office_manager", "treatment_coordinator", "scheduling_coordinator"],
  treatment_coordinator: ["front_desk", "financial_coordinator"],
  financial_coordinator: ["treatment_coordinator", "office_manager"],
  scheduling_coordinator: ["front_desk"],
  office_manager: ["front_desk", "financial_coordinator", "practice_administrator"],
  practice_administrator: ["office_manager"],
  regional_manager: ["dso_corporate"],
  dso_corporate: ["regional_manager"],
  // Unmappable — never a neighbour of anything.
  other: [],
};

/**
 * Derive the candidate's role signal as canonical roles.
 * Prefers explicit `desired_roles`; falls back to the resume-derived
 * `current_title` when no preferences are set. Drops "other" (unmappable)
 * and de-dupes. Empty result = "no role signal" → caller leaves the pair
 * ungated and excludes the role dimension.
 */
export function deriveCandidateRoles(
  desiredRoles: string[] | null | undefined,
  currentTitle: string | null | undefined
): CanonicalRole[] {
  const fromDesired = uniqueNonOther(
    (desiredRoles ?? []).map(canonicalizeRoleCategory)
  );
  if (fromDesired.length > 0) return fromDesired;

  const fromTitle = canonicalizeRoleCategory(currentTitle);
  return fromTitle === "other" ? [] : [fromTitle];
}

/**
 * Best relation between a set of candidate roles and a single job role.
 * Exact beats adjacent beats unrelated.
 */
export function roleRelation(
  candidateRoles: CanonicalRole[],
  jobRole: CanonicalRole
): RoleRelation {
  if (candidateRoles.includes(jobRole)) return "exact";
  const neighbours = new Set<CanonicalRole>(
    candidateRoles.flatMap((r) => ROLE_ADJACENCY[r] ?? [])
  );
  if (neighbours.has(jobRole)) return "adjacent";
  return "unrelated";
}

/**
 * When the relation is "adjacent", return the candidate role that's the
 * nearest neighbour of the job role (for narrative copy: "you're a
 * Hygienist, this is an Assistant role"). Returns null for exact/unrelated.
 */
export function nearestAdjacentRole(
  candidateRoles: CanonicalRole[],
  jobRole: CanonicalRole
): CanonicalRole | null {
  for (const r of candidateRoles) {
    if ((ROLE_ADJACENCY[r] ?? []).includes(jobRole)) return r;
  }
  return null;
}

function uniqueNonOther(roles: CanonicalRole[]): CanonicalRole[] {
  const seen = new Set<CanonicalRole>();
  const out: CanonicalRole[] = [];
  for (const r of roles) {
    if (r === "other" || seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}
