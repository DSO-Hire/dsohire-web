/**
 * PracticeFit weekly drip — inclusion logic (Phase B.2).
 *
 * Pure, side-effect-free decision function so the cadence rules are unit-
 * testable without a database. The cron (/api/cron/practice-fit-digest) fetches
 * each candidate's role-gated fits + their send history and calls decideDigest()
 * to choose what (if anything) to send this week.
 *
 * Rules (locked with Cam 2026-06-04):
 *   • Top 5 NEW high-fit roles  — "Strong"+ (score ≥ 60) AND not previously
 *     emailed to this candidate. This is the primary, high-signal send.
 *   • Empty week → skip          — no email when nothing new qualifies …
 *   • … BUT never go silent >1mo — if skipping would leave the candidate with
 *     no drip for more than 30 days, fall back to their best current applicable
 *     roles (any bucket, still role-gated), even if seen before.
 */

// Type-only import — erased at compile time, so this module stays free of the
// server-only runtime in roles-that-fit.ts and can be unit-tested in isolation.
import type { RoleThatFits } from "./roles-that-fit";

/** "Strong" bucket floor (see buckets.ts: 60-74 Strong, 75+ Excellent). */
export const HIGH_FIT_MIN_SCORE = 60;
/** Never let a consenting candidate go longer than this without a drip. */
export const MAX_SILENCE_DAYS = 30;
/** Cap roles per email (Cam: top 5). */
export const MAX_JOBS_PER_DIGEST = 5;

const MS_PER_DAY = 86_400_000;

export type DigestVariant = "new" | "fallback" | "skip";

export interface DigestDecisionInput {
  /** Role-gated fits for the candidate, score-desc (from getTopFitJobsForCandidate). */
  fits: RoleThatFits[];
  /** Job ids already emailed to this candidate in prior digests (dedup). */
  previouslySentJobIds: ReadonlySet<string>;
  /** When the candidate last received ANY digest, or null if never. */
  lastSentAt: Date | null;
  /** "Now" — injected for deterministic testing. */
  now: Date;
}

export interface DigestDecision {
  variant: DigestVariant;
  /** Roles to include in the email. Empty when variant === "skip". */
  jobs: RoleThatFits[];
}

export function decideDigest(input: DigestDecisionInput): DigestDecision {
  const { fits, previouslySentJobIds, lastSentAt, now } = input;

  // 1. New high-fit roles: Strong+ AND not previously emailed.
  const newHighFit = fits
    .filter(
      (f) =>
        f.fit.score >= HIGH_FIT_MIN_SCORE &&
        !previouslySentJobIds.has(f.job_id)
    )
    .slice(0, MAX_JOBS_PER_DIGEST);
  if (newHighFit.length > 0) {
    return { variant: "new", jobs: newHighFit };
  }

  // 2. Nothing new qualifies. Skip — UNLESS doing so would leave the candidate
  //    with no drip for more than a month. Then send their best current
  //    applicable roles (any bucket), even if previously seen.
  const daysSinceLast =
    lastSentAt === null
      ? Number.POSITIVE_INFINITY
      : (now.getTime() - lastSentAt.getTime()) / MS_PER_DAY;

  if (daysSinceLast > MAX_SILENCE_DAYS) {
    const fallback = fits.slice(0, MAX_JOBS_PER_DIGEST);
    if (fallback.length > 0) return { variant: "fallback", jobs: fallback };
  }

  return { variant: "skip", jobs: [] };
}
