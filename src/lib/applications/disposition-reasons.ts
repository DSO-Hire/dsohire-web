/**
 * Structured disposition (non-selection) reason codes — #8.
 *
 * EEOC / OFCCP "Internet Applicant" compliance wants every closed applicant
 * tagged with a standardized, *job-related* reason for non-selection so the
 * DSO can run adverse-impact analysis and defend hiring decisions. This is the
 * single source of truth for that taxonomy.
 *
 * Design rules (locked Day 35):
 *  - Codes are INTERNAL/compliance-only. They are NEVER shown to the candidate.
 *    The candidate-facing message stays the free-text `note` (and the Growth+
 *    AI suggester drafts that, not this).
 *  - Every code is tied to a job-relevant criterion. NOTHING here references a
 *    protected attribute. Keep it that way — see
 *    feedback_fit_models_moat_and_compliance / the AI suggester guardrails.
 *  - Required on employer REJECTIONS (matches Greenhouse/Lever/Ashby, which
 *    force a reason at reject). Offered-but-optional on candidate WITHDRAWALS.
 *  - `requiresNote` codes ("Other …") force a free-text note so a vague code
 *    can't hide an undocumented decision.
 *
 * Evolving the list: edit this file only. No DB enum / CHECK constraint backs
 * it (we validate in app code) so adding a code never needs a migration — same
 * lesson as the screening-kind churn.
 */

import type { StageKind } from "@/lib/applications/stages";

export type DispositionKind = Extract<StageKind, "rejected" | "withdrawn">;

export interface DispositionReason {
  /** Stable machine code stored in application_status_events.disposition_code. */
  code: string;
  /** Recruiter-facing label (internal). */
  label: string;
  /** Which terminal transition(s) this code is valid for. */
  appliesTo: DispositionKind[];
  /** When true, the recruiter must also supply a free-text note. */
  requiresNote?: boolean;
}

export const DISPOSITION_REASONS: readonly DispositionReason[] = [
  // ── Employer rejection — candidate qualifications / fit ──
  {
    code: "credentials_licensure",
    label: "Missing or insufficient license / certification",
    appliesTo: ["rejected"],
  },
  {
    code: "experience_insufficient",
    label: "Insufficient relevant experience",
    appliesTo: ["rejected"],
  },
  {
    code: "skills_gap",
    label: "Skills or clinical competency gap",
    appliesTo: ["rejected"],
  },
  {
    code: "screening_knockout",
    label: "Did not meet required screening criteria",
    appliesTo: ["rejected"],
  },
  {
    code: "schedule_availability",
    label: "Availability / schedule mismatch",
    appliesTo: ["rejected"],
  },
  {
    code: "location_commute",
    label: "Location / commute not workable",
    appliesTo: ["rejected"],
  },
  {
    code: "compensation_misaligned",
    label: "Compensation expectations misaligned",
    appliesTo: ["rejected"],
  },
  {
    code: "stronger_candidate",
    label: "Stronger candidate(s) selected",
    appliesTo: ["rejected"],
  },
  {
    code: "incomplete_unresponsive",
    label: "Incomplete application / unresponsive",
    appliesTo: ["rejected"],
  },
  // ── Employer rejection — position-side ──
  {
    code: "position_filled",
    label: "Position filled",
    appliesTo: ["rejected"],
  },
  {
    code: "position_closed",
    label: "Position closed or cancelled",
    appliesTo: ["rejected"],
  },
  {
    code: "other_job_related",
    label: "Other job-related reason",
    appliesTo: ["rejected"],
    requiresNote: true,
  },

  // ── Candidate withdrawal ──
  {
    code: "candidate_withdrew",
    label: "Candidate withdrew",
    appliesTo: ["withdrawn"],
  },
  {
    code: "declined_offer",
    label: "Candidate declined offer",
    appliesTo: ["withdrawn"],
  },
  {
    code: "accepted_other",
    label: "Accepted another offer",
    appliesTo: ["withdrawn"],
  },
  {
    code: "unresponsive_lapsed",
    label: "Lapsed / unresponsive",
    appliesTo: ["withdrawn"],
  },
  {
    code: "other_withdrawal",
    label: "Other",
    appliesTo: ["withdrawn"],
    requiresNote: true,
  },
];

const BY_CODE: ReadonlyMap<string, DispositionReason> = new Map(
  DISPOSITION_REASONS.map((r) => [r.code, r])
);

/** Codes valid for a given terminal kind, in display order. */
export function dispositionsFor(kind: DispositionKind): DispositionReason[] {
  return DISPOSITION_REASONS.filter((r) => r.appliesTo.includes(kind));
}

export function getDisposition(code: string | null | undefined): DispositionReason | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}

/** Human label for a stored code (falls back to the raw code). */
export function dispositionLabel(code: string | null | undefined): string {
  return getDisposition(code)?.label ?? (code ?? "");
}

export function isValidDisposition(
  code: string | null | undefined,
  kind: DispositionKind
): boolean {
  const r = getDisposition(code);
  return r != null && r.appliesTo.includes(kind);
}

/**
 * Server-side gate shared by every close path. Returns an error string when
 * the (code, note) pair is not acceptable for `kind`, else null.
 *
 *  - rejected  → a valid code is REQUIRED.
 *  - withdrawn → code optional, but if present it must be valid for withdrawn.
 *  - requiresNote codes → a non-empty note is mandatory.
 */
export function validateDisposition(
  kind: DispositionKind,
  code: string | null | undefined,
  note: string | null | undefined
): string | null {
  const trimmedNote = (note ?? "").trim();

  if (!code) {
    if (kind === "rejected") {
      return "Choose a rejection reason to continue.";
    }
    return null; // withdrawn: code optional
  }

  if (!isValidDisposition(code, kind)) {
    return "That reason isn't valid for this action.";
  }

  const reason = getDisposition(code);
  if (reason?.requiresNote && !trimmedNote) {
    return "This reason requires a short note for your audit log.";
  }

  return null;
}
