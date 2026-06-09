/**
 * Practice Fit scoring engine (Phase 5D v1.1).
 *
 * Architecture changes vs v0:
 *   • Role is a HARD FILTER — computePracticeFit returns null when the
 *     candidate has non-empty `desired_roles` that don't include the
 *     job's `role_category`. The chip never renders for filtered pairs.
 *   • Each dimension reports `scored: boolean`. Dimensions with missing
 *     data on either side are emitted as `scored: false` so the UI can
 *     show "Add X to factor this in" — but they DO NOT drag the score
 *     down. Final score is normalized over scored dimensions only.
 *   • Two new dimensions: `specialty` (15) and `years_experience` (10).
 *   • Reweighted: comp 25, location 20, specialty 15, skills 15, years 10,
 *     employment 10, dso 5  (sums to 100).
 *
 * Determinism: the same inputs always produce the same hash + score.
 * The cache layer (get-or-compute.ts) uses `input_hash` to decide
 * whether a stored score is still valid.
 */

import { createHash } from "crypto";
import { scoreToBucket } from "./buckets";
import {
  canonicalizeRoleCategory,
  CANONICAL_ROLE_LABELS,
} from "./role-canonicalize";
import {
  deriveCandidateRoles,
  nearestAdjacentRole,
  roleRelation,
} from "./role-adjacency";
import {
  jobTrack,
  candidateTracks,
  applicableDimsForJob,
  isClinicallyCredentialed,
} from "./track";
import {
  canonicalizeCorporateFunction,
  deriveCandidateCorporateFunctions,
  corporateFunctionRelation,
  isClinicalWelcomingFunction,
  CORPORATE_FUNCTION_LABELS,
} from "./corporate-function";
import { CERTIFICATION_KINDS } from "@/lib/candidate/canonical-lists";

/** value → display label for certification kinds. */
const CERT_LABELS: Record<string, string> = CERTIFICATION_KINDS.reduce(
  (acc, c) => {
    acc[c.value] = c.label;
    return acc;
  },
  {} as Record<string, string>
);
import type {
  CandidateFitInputs,
  FitAdjustment,
  FitDimension,
  FitDimensionKey,
  FitInputs,
  FitResult,
} from "./types";

/**
 * Model version — bump on any change to scoring LOGIC that doesn't change a
 * hashed input field (e.g. the A.4 caps/boosters). It's folded into the
 * input hash so a logic-only change still invalidates the read-through cache.
 */
const MODEL_VERSION = "2026-06-09-v5-dsofit-dims";

/* ──────────────────────────────────────────────────────────────
 * v3 Phase B.2 — comp_priority re-weighting ("what matters MOST").
 *
 * A per-candidate tilt, NOT a new dimension. When a candidate says what matters
 * most, we scale the effective weight of the dimensions that express it, so the
 * normalized score leans toward their stated priority. Deterministic (the
 * priority is a hashed candidate input) and back-compatible (null = no tilt).
 *
 * Cam flagged this as "powerful but opinionated — keep it?"; shipped behind the
 * explicit comp_priority signal so it only ever fires for candidates who took
 * the assessment and chose a priority.
 * ─────────────────────────────────────────────────────────── */

/** Per-rank weight multipliers — #1 priority tilts hardest, #3 lightest. */
const PRIORITY_RANK_MULT = [1.6, 1.35, 1.15];

const PRIORITY_DIMS: Record<string, FitDimensionKey[]> = {
  // "Compensation matters most" tilts the whole money picture — salary AND
  // benefits. Groups stay disjoint (benefits appears here only), so no dim is
  // scaled twice.
  comp: ["compensation", "benefits"],
  schedule: ["schedule_overlap", "work_life"],
  culture: ["practice_feel", "work_pace", "autonomy", "mentorship"],
  growth: ["ce_growth", "years_experience"],
  location: ["location"],
};

/**
 * Scale the effective weight (and recompute contribution) of the dimensions
 * tied to the candidate's stated priorities. Reads the RANKED list first
 * (rank 1 heaviest, via PRIORITY_RANK_MULT), falling back to the single
 * `comp_priority` (treated as a sole rank-1). Mutates the dims in place BEFORE
 * normalization, so the score and the displayed weights/top-factors reflect
 * the tilt. Unscored boosted dims still contribute 0 — the tilt only bites
 * when the dim has data on both sides. The five priority groups map to
 * disjoint dimensions, so no dim is scaled twice.
 */
function applyCompPriority(
  dims: Record<FitDimensionKey, FitDimension>,
  ranked: string[] | null | undefined,
  single: string | null
): void {
  const list =
    ranked && ranked.length > 0 ? ranked.slice(0, 3) : single ? [single] : [];
  list.forEach((priority, i) => {
    const boosted = PRIORITY_DIMS[priority];
    if (!boosted) return;
    const mult = PRIORITY_RANK_MULT[i] ?? PRIORITY_RANK_MULT[PRIORITY_RANK_MULT.length - 1];
    for (const key of boosted) {
      const d = dims[key];
      if (!d) continue;
      d.weight = Math.round(d.weight * mult);
      d.contribution = (d.weight * d.raw) / 100;
    }
  });
}

/* ──────────────────────────────────────────────────────────────
 * Weights (must sum to 100). v0's role weight (25) is reallocated
 * to specialty (15) + years_experience (10).
 * ─────────────────────────────────────────────────────────── */

// Track F (2026-05-12) — skills 15→10 to make room for schedule_overlap (5).
// Skills was already softened in v1.8 (preferred not required), so trimming
// 5 points keeps it directionally weighted while freeing budget for the
// new dim. Schedule_overlap is intentionally light: most candidates don't
// fill schedule preferences and most jobs leave schedule_days empty, so
// it'll fall out of the denominator on most pairs — but when both sides
// have data, it's a strong day-1-friction signal.
// Phase A.1 (2026-06-03) — role_fit added (exact 100 vs adjacent 60).
// Phase A.3 (2026-06-03) — dental signals added + reweight so clinical /
// logistical dimensions dominate (the dental moat). pms_fluency (12) and
// license_state (10) are the new dental signals; compensation trimmed
// (20→12) and the generic dims (specialty/skills/years/employment/dso/
// schedule) shaved so "speaks dental" leads. Missing dims drop OUT of the
// denominator (normalized over scored only), so PMS/license simply fall
// away on postings/roles where they don't apply — they never dilute.
// Phase A.3b (2026-06-03) — certifications (6) added (dental credential
// readiness: certs named in the posting vs the candidate's furnished certs).
// The 6 points come from specialty (9→7), skills (9→7), years (7→6) and
// employment (4→3).
// v3 Phase B.1 (2026-06-04) — six culture/work-style dims added (combined 22)
// carved proportionally from the hard dims so the table still sums to 100.
// These dims stay UNSCORED until BOTH the candidate took the assessment AND
// the practice filled its profile, so live scores for today's data don't move;
// the weight only bites once both sides have data.
const WEIGHTS: Record<FitDimensionKey, number> = {
  role_fit: 12,
  location: 14,
  pms_fluency: 9,
  compensation: 10,
  license_state: 8,
  certifications: 5,
  specialty: 5,
  skills: 5,
  years_experience: 4,
  employment_type: 3,
  dso_size: 2,
  schedule_overlap: 1,
  // culture / work-style (v3)
  work_pace: 4,
  autonomy: 4,
  mentorship: 4,
  ce_growth: 4,
  practice_feel: 3,
  work_life: 3,
  // v3.1 (2026-06-05) — benefits is ADDITIVE (the table now sums to 104, not
  // 100). The final score normalizes over SCORED weights only, so a dimension
  // that's unscored on a pair (here: no candidate priorities or no job
  // benefits) drops cleanly out of the denominator and leaves every existing
  // scored pair's number unchanged. Adding it on top — rather than re-carving
  // the other dims — was the minimal-disturbance choice: live scores only move
  // on pairs where benefits actually scores. Weight 4 ≈ the culture dims.
  benefits: 4,
  // v3.1 — patient-population fit (also additive; table now sums to 107). Same
  // normalization rationale: unscored until the candidate picks populations
  // AND the practice lists the ones it serves, so existing pairs don't move.
  patient_population: 3,
  // #52 DSOFit corporate moat dims. Corporate-track-applicable ONLY (excluded
  // for clinical/admin → contribute nothing there). Additive to the table; the
  // per-function weight profile (FUNCTION_WEIGHT_PROFILE) scales them so each
  // corporate function emphasizes the right ones. Unscored until the DSOFit
  // assessment supplies the signal, so no live score moves before it ships.
  seniority: 8,
  org_scale: 6,
};

/* ──────────────────────────────────────────────────────────────
 * Role filter — runs BEFORE compute. When this returns false the
 * caller (get-or-compute.ts) treats the pair as "no fit" and writes
 * no row.
 *
 * The filter ONLY fires when the candidate has expressed role
 * preferences — empty desired_roles means "open to anything," so the
 * pair stays in the scoring pool.
 * ─────────────────────────────────────────────────────────── */

export function isRoleApplicable(inputs: FitInputs): boolean {
  const { candidate, job } = inputs;

  // #110 — TRACK gate first. A candidate is only scored against jobs in their
  // own track (clinical / admin / corporate). This is what walls a dentist off
  // from a Corporate Counsel req and an office manager off from a VP-of-BD req.
  const jt = jobTrack(job);
  const cTracks = candidateTracks(candidate);

  // Genuinely "open to anything" (no role/title/corporate signal at all) →
  // stays in the pool; role_fit is excluded rather than guessed.
  if (cTracks.size === 0) return true;

  // Legacy uncategorized job (role_category="other" with no corporate_function)
  // → can't place it on a track; leave ungated (the coverage damp keeps it
  // honest) rather than silently dropping real postings.
  if (jt === "unknown") return true;

  // Cross-track → drop. THE leak fix.
  //
  // #48 NOTE: there is deliberately NO automatic clinical→corporate bridge here.
  // A clinically-credentialed candidate only reaches the corporate track when
  // THEY signal corporate intent (a dso_corporate desired role, a corporate/
  // leadership resume title, or — later — taking the DSOFit assessment). That
  // intent puts "corporate" in their candidateTracks() so they pass this gate
  // normally; their clinical background is then CREDITED in the welcoming
  // functions (see scoreCorporateFunctionFit). A chairside dentist with no such
  // signal is NOT extrapolated into a corporate "fit" — we don't assume.
  if (!cTracks.has(jt)) return false;

  // ── Same track: refine with the within-track relation. ──
  if (jt === "corporate") {
    const jobFn = canonicalizeCorporateFunction(job.corporate_function);
    if (!jobFn) return true; // corporate job, function unresolved → don't drop
    const candFns = deriveCandidateCorporateFunctions(candidate.current_title);
    if (candFns.length === 0) return true; // corporate track, function unknown → keep
    return corporateFunctionRelation(candFns, jobFn) !== "unrelated";
  }

  // Clinical / admin — existing canonical role adjacency.
  const jobRole = canonicalizeRoleCategory(job.role_category);
  const candidateRoles = deriveCandidateRoles(
    candidate.desired_roles,
    candidate.current_title
  );
  if (candidateRoles.length === 0) return true; // no clinical/admin role signal
  return roleRelation(candidateRoles, jobRole) !== "unrelated";
}

/* ──────────────────────────────────────────────────────────────
 * Compute — assumes role filter has already passed.
 * ─────────────────────────────────────────────────────────── */

export function computePracticeFit(inputs: FitInputs): FitResult | null {
  if (!isRoleApplicable(inputs)) return null;

  const dims: Record<FitDimensionKey, FitDimension> = {
    role_fit: scoreRoleFit(inputs),
    compensation: scoreCompensation(inputs),
    location: scoreLocation(inputs),
    pms_fluency: scorePmsFluency(inputs),
    license_state: scoreLicenseState(inputs),
    certifications: scoreCertifications(inputs),
    specialty: scoreSpecialty(inputs),
    skills: scoreSkills(inputs),
    years_experience: scoreYearsExperience(inputs),
    employment_type: scoreEmploymentType(inputs),
    dso_size: scoreDsoSize(inputs),
    schedule_overlap: scoreScheduleOverlap(inputs),
    // v3 Phase B.1 — culture / work-style.
    work_pace: scoreWorkPace(inputs),
    autonomy: scoreAutonomy(inputs),
    mentorship: scoreMentorship(inputs),
    ce_growth: scoreCeGrowth(inputs),
    practice_feel: scorePracticeFeel(inputs),
    work_life: scoreWorkLife(inputs),
    // v3.1 — benefits coverage (candidate priorities vs job's listed benefits).
    benefits: scoreBenefits(inputs),
    // v3.1 — patient-population fit (candidate's preferred populations vs the
    // practice's served populations).
    patient_population: scorePatientPopulation(inputs),
    // #52 DSOFit corporate moat dims (seniority/scope + multi-site scale).
    seniority: scoreSeniority(inputs),
    org_scale: scoreOrgScale(inputs),
  };

  // #110 — DIMENSION APPLICABILITY by track. Force-exclude any dimension that
  // doesn't belong to this job's track (e.g. the dental specialty / license /
  // certifications / patient-population dims on a corporate or admin req), so
  // dental signal can never leak into a non-clinical score. Excluded dims drop
  // from both numerator and denominator and surface no candidate-side CTA.
  const applicable = applicableDimsForJob(inputs.job);
  for (const key of Object.keys(dims) as FitDimensionKey[]) {
    if (!applicable.has(key)) {
      const d = dims[key];
      d.scored = false;
      d.raw = 0;
      d.contribution = 0;
      d.cta_href = null;
      d.cta_label = null;
      d.cta_inline = false;
      d.detail = "Not applicable to this kind of role.";
      d.detail_employer = "Not applicable to this kind of role.";
    }
  }
  // #52 — per-function weight profile (DSOFit). For corporate jobs, scale the
  // applicable dims' weights so each function emphasizes what matters for it
  // (Operations leans hard on multi-site scale + seniority; IT leans on
  // functional skills; Credentialing on skills + domain). No-op for
  // clinical/admin. This is what makes corporate roles score role-appropriately
  // instead of falling into one generic bucket.
  const fnProfile = functionWeightProfile(inputs.job);
  applyFunctionProfile(dims, fnProfile);

  // The maximum scored weight this pair COULD reach if every applicable dim had
  // data on both sides — the denominator for the coverage-confidence damp. Uses
  // the SAME profile multipliers so the damp stays calibrated under reweighting.
  let applicableWeight = 0;
  for (const key of applicable) {
    applicableWeight += Math.round(WEIGHTS[key] * (fnProfile[key] ?? 1));
  }

  // v3 Phase B.2 — tilt the weights toward what this candidate said matters
  // most (ranked top-3, or the single fallback; no-op when neither is set).
  // Runs before normalization.
  applyCompPriority(
    dims,
    inputs.candidate.comp_priorities,
    inputs.candidate.comp_priority
  );

  // Sum scored contributions and scored weights — missing-data dims
  // are EXCLUDED from both numerator and denominator.
  let scoredContribution = 0;
  let scoredWeight = 0;
  let totalWeight = 0;
  let scoredCount = 0;
  let totalCount = 0;
  for (const dim of Object.values(dims)) {
    totalWeight += dim.weight;
    totalCount += 1;
    if (dim.scored) {
      scoredContribution += dim.contribution;
      scoredWeight += dim.weight;
      scoredCount += 1;
    }
  }

  // Edge case: zero scored dims → score 0, "low" bucket. Should be
  // rare in practice (a candidate with NO data on any dim) but the
  // math has to be safe against divide-by-zero.
  let score: number;
  if (scoredWeight === 0) {
    score = 0;
  } else {
    // Normalize to 0-100. Each scored dim's contribution is already
    // in "weight * raw / 100" terms; rescale by total scored weight.
    score = Math.round((scoredContribution / scoredWeight) * 100);
    score = Math.max(0, Math.min(100, score));
  }

  // #110 — ANTI-SATURATION coverage damp. A pair scored on a thin slice of the
  // applicable dimensions can't claim a top score: with little signal we're not
  // confident enough to say "Excellent". This is what stops two maxed generic
  // dims (lives nearby + pay works) from normalizing straight to 100. It caps
  // the UPSIDE only — it never lifts a low score — so a genuine, well-covered
  // match is untouched (high coverage → confidence 1 → no cap).
  score = applyCoverageDamp(score, scoredWeight, applicableWeight);

  // Phase A.4 — deal-breaker caps + booster ceiling. Derived from the dims
  // so the cache path can reconstruct the same reasons; applied here to the
  // stored score.
  const adjustments = detectAdjustments(dims);
  score = applyAdjustments(score, adjustments);

  // Top 3 by contribution desc, only among SCORED dims. Excluded
  // dims are surfaced separately in the UI ("Add X to factor in").
  const top_factors = (Object.entries(dims) as Array<
    [FitDimensionKey, FitDimension]
  >)
    .filter(([, d]) => d.scored)
    .sort((a, b) => {
      if (b[1].contribution !== a[1].contribution) {
        return b[1].contribution - a[1].contribution;
      }
      if (b[1].weight !== a[1].weight) return b[1].weight - a[1].weight;
      return a[0].localeCompare(b[0]);
    })
    .slice(0, 3)
    .map(([key]) => key);

  return {
    score,
    bucket: scoreToBucket(score),
    dimensions: dims,
    adjustments,
    top_factors,
    coverage: {
      scored_weight: scoredWeight,
      total_weight: totalWeight,
      scored_count: scoredCount,
      total_count: totalCount,
    },
    input_hash: hashInputs(inputs),
  };
}

/* ──────────────────────────────────────────────────────────────
 * Caps + boosters (Phase A.4)
 *
 * detectAdjustments() is a pure function of the scored dimensions, so both
 * the live compute and the cache-rehydration path (rowToResult) derive the
 * SAME reasons. applyAdjustments() folds them into the number — boost first
 * (lifts a great match toward the ceiling), then caps (a deal-breaker always
 * wins). Caps are informational only; they never auto-screen a candidate.
 * ─────────────────────────────────────────────────────────── */

const BOOST_CEILING = 97; // leave honest headroom; never a synthetic 100
const BOOST_AMOUNT = 5;

export function detectAdjustments(
  dims: Record<FitDimensionKey, FitDimension>
): FitAdjustment[] {
  const out: FitAdjustment[] = [];

  // #110 — role/function fit is the load-bearing signal. If we couldn't score
  // it (the candidate gave no target role and we couldn't read one from their
  // title — i.e. "open to anything"), we don't know enough to call ANY pair
  // "Excellent". Cap at the top of Strong so an open candidate with two maxed
  // generic dims (lives nearby + pay works) can't read as a top match.
  if (!dims.role_fit?.scored) {
    out.push({
      kind: "cap",
      dimension: "role_fit",
      value: 74,
      reason:
        "Role fit couldn't be determined (no target role set) — capped below Excellent until the candidate names the role they want.",
    });
  }

  // Deal-breaker: wrong-state clinical license. raw<=20 = not licensed and
  // not relocating; 21-50 = the relocate case (raw 45).
  const lic = dims.license_state;
  if (lic && lic.scored) {
    if (lic.raw <= 20) {
      out.push({
        kind: "cap",
        dimension: "license_state",
        value: 38,
        reason:
          "Not licensed in this state — a hard requirement for this clinical role. Informational only; never auto-screened.",
      });
    } else if (lic.raw <= 50) {
      out.push({
        kind: "cap",
        dimension: "license_state",
        value: 60,
        reason:
          "Would need licensure in this state first (candidate is open to relocating).",
      });
    }
  }

  // Booster: the marquee dental signals all line up → let a great match soar.
  const maxed: string[] = [];
  if (dims.role_fit?.scored && dims.role_fit.raw >= 100) maxed.push("exact role");
  if (dims.pms_fluency?.scored && dims.pms_fluency.raw >= 88) maxed.push("PMS fluency");
  if (dims.location?.scored && dims.location.raw >= 85) maxed.push("short commute");
  if (dims.license_state?.scored && dims.license_state.raw >= 100)
    maxed.push("in-state license");
  if (maxed.length >= 3) {
    out.push({
      kind: "boost",
      dimension: null,
      value: BOOST_AMOUNT,
      reason: `${maxed.join(", ")} all line up.`,
    });
  }

  return out;
}

export function applyAdjustments(
  base: number,
  adjustments: FitAdjustment[]
): number {
  let s = base;
  const boost = adjustments
    .filter((a) => a.kind === "boost")
    .reduce((m, a) => Math.max(m, a.value), 0);
  // Boost lifts toward the ceiling but never reduces an already-higher base.
  if (boost > 0) s = Math.max(s, Math.min(BOOST_CEILING, s + boost));
  const caps = adjustments
    .filter((a) => a.kind === "cap")
    .map((a) => a.value);
  if (caps.length > 0) s = Math.min(s, Math.min(...caps));
  return Math.max(0, Math.min(100, Math.round(s)));
}

/* ──────────────────────────────────────────────────────────────
 * #110 — coverage-confidence damp (anti-saturation)
 *
 * confidence = how much of the APPLICABLE weight actually scored. At/above the
 * target fraction we're fully confident and the score is untouched; below it,
 * the achievable ceiling slides down toward an anchor so a pair with only a
 * sliver of signal can't read "Excellent". Upside-only: a low score is never
 * lifted (a thin-data pair shouldn't look better OR be falsely confident-high).
 * ─────────────────────────────────────────────────────────── */

const COVERAGE_TARGET_FRACTION = 0.55; // ≥55% of applicable weight = full confidence
const COVERAGE_ANCHOR = 45; // a near-zero-coverage pair tops out here (Solid)

export function applyCoverageDamp(
  score: number,
  scoredWeight: number,
  applicableWeight: number
): number {
  if (applicableWeight <= 0) return score;
  const confidence = Math.max(
    0,
    Math.min(1, scoredWeight / (applicableWeight * COVERAGE_TARGET_FRACTION))
  );
  const ceiling = COVERAGE_ANCHOR + (100 - COVERAGE_ANCHOR) * confidence;
  return Math.min(score, Math.round(ceiling));
}

/* ──────────────────────────────────────────────────────────────
 * Dimension scorers
 *
 * Each scorer returns a FitDimension. When data is missing on either
 * side, set `scored: false` and provide a CTA pointing at the relevant
 * profile or job-edit field. Excluded dims contribute 0 / 0 to the
 * score's numerator/denominator.
 * ─────────────────────────────────────────────────────────── */

interface UnscoredOpts {
  /** Candidate-voice detail ("You haven't set..."). */
  detail: string;
  /** Employer-voice detail ("Candidate hasn't set..."). */
  detail_employer: string;
  cta_label: string | null;
  cta_href: string | null;
  /** Inline editor on the candidate-side row instead of a link-out. */
  cta_inline?: boolean;
}

function makeUnscoredDim(
  key: FitDimensionKey,
  label: string,
  opts: UnscoredOpts
): FitDimension {
  return {
    weight: WEIGHTS[key],
    raw: 0,
    contribution: 0,
    scored: false,
    label,
    detail: opts.detail,
    detail_employer: opts.detail_employer,
    cta_label: opts.cta_label,
    cta_href: opts.cta_href,
    cta_inline: opts.cta_inline ?? false,
  };
}

/**
 * v1.3.1 (2026-05-13) — scored dims need DISTINCT employer-voice copy.
 * The original v1.1 assumption ("scored dims read identically to both
 * audiences") was wrong: candidate-side detail uses second-person
 * ("your minimum", "your preferences"), which leaks to recruiters
 * verbatim. Per-dim functions now supply both strings explicitly.
 * If a dim ever forgets, we derive a third-person fallback via simple
 * regex transforms (your→their, you're→they're, etc.) so the bug is
 * defense-in-depth-safe.
 */
function makeScoredDim(
  key: FitDimensionKey,
  label: string,
  raw: number,
  detail: string,
  detailEmployer?: string
): FitDimension {
  const clamped = Math.max(0, Math.min(100, Math.round(raw)));
  const weight = WEIGHTS[key];
  return {
    weight,
    raw: clamped,
    contribution: (weight * clamped) / 100,
    scored: true,
    label,
    detail,
    detail_employer: detailEmployer ?? derivedEmployerVoice(detail),
    cta_href: null,
    cta_label: null,
    cta_inline: false,
  };
}

/**
 * Mechanical second-person → third-person rewrite for scored-dim copy
 * when an explicit employer-voice string wasn't supplied. Word-boundary-
 * scoped to avoid e.g. "young" → "thereng". Not infallible, but the
 * dims that supply explicit strings don't depend on this; this is a
 * net for anything new that slips through.
 */
function derivedEmployerVoice(s: string): string {
  return s
    .replace(/\byou're\b/g, "they're")
    .replace(/\bYou're\b/g, "They're")
    .replace(/\byou've\b/g, "they've")
    .replace(/\bYou've\b/g, "They've")
    .replace(/\byou'd\b/g, "they'd")
    .replace(/\bYou'd\b/g, "They'd")
    .replace(/\byour\b/g, "their")
    .replace(/\bYour\b/g, "Their")
    .replace(/\byours\b/g, "theirs")
    .replace(/\bYours\b/g, "Theirs")
    .replace(/\byou\b/g, "they")
    .replace(/\bYou\b/g, "They");
}

/**
 * scoreRoleFit — Phase A.1. The adjacency gate has already dropped
 * unrelated pairs, so this scorer only ever sees exact or adjacent
 * relations (or "no signal", which it excludes). Exact = 100, adjacent
 * = 60 — enough spread that a spot-on candidate outranks a transferable
 * one without burying the adjacent match.
 */
function scoreRoleFit(inputs: FitInputs): FitDimension {
  const { candidate, job } = inputs;

  // #110 — corporate track scores FUNCTION fit (the gate has already dropped
  // cross-track + unrelated-function pairs, so this only sees exact/adjacent or
  // an unknown-function corporate candidate).
  if (jobTrack(job) === "corporate") {
    return scoreCorporateFunctionFit(inputs);
  }

  const jobRole = canonicalizeRoleCategory(job.role_category);
  if (jobRole === "other") {
    return makeUnscoredDim("role_fit", "Role", {
      detail:
        "This posting's role isn't categorized — role fit is excluded from the score.",
      detail_employer:
        "Job role isn't categorized — role fit excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  const candidateRoles = deriveCandidateRoles(
    candidate.desired_roles,
    candidate.current_title
  );
  if (candidateRoles.length === 0) {
    return makeUnscoredDim("role_fit", "Role", {
      detail:
        "Add your target role(s) to factor role fit into your match.",
      detail_employer:
        "Candidate hasn't set target roles and we couldn't read one from their title — role fit excluded from their score.",
      cta_label: "Set target roles",
      cta_href: "/candidate/practice-fit#preferences",
    });
  }

  const jobLabel = CANONICAL_ROLE_LABELS[jobRole];
  const relation = roleRelation(candidateRoles, jobRole);

  if (relation === "exact") {
    return makeScoredDim(
      "role_fit",
      "Role",
      100,
      `Exact role match — this is a ${jobLabel} role.`,
      `Exact role match — they're targeting ${jobLabel}.`
    );
  }

  // Adjacent — name the candidate's nearest neighbouring role for the copy.
  const near = nearestAdjacentRole(candidateRoles, jobRole);
  const nearLabel = near ? CANONICAL_ROLE_LABELS[near] : "a related role";
  return makeScoredDim(
    "role_fit",
    "Role",
    60,
    `Adjacent role — you're ${nearLabel}, this is ${jobLabel}: related and transferable, not identical.`,
    `Adjacent role — they're ${nearLabel}, this is ${jobLabel}: related and transferable, not identical.`
  );
}

/**
 * #110 — corporate function fit. Mirrors scoreRoleFit's exact/adjacent spread
 * (100 / 60) but over the corporate-function taxonomy. The corporate candidate
 * signal is derived from their resume title; when we can't resolve a function
 * (e.g. the candidate only said "DSO Corporate") the dim is excluded rather
 * than guessed — the gate already kept the pair in-track, and the coverage damp
 * keeps a low-signal corporate pair out of "Excellent".
 */
function scoreCorporateFunctionFit({ candidate, job }: FitInputs): FitDimension {
  const jobFn = canonicalizeCorporateFunction(job.corporate_function);
  if (!jobFn) {
    return makeUnscoredDim("role_fit", "Function", {
      detail:
        "This posting's corporate function isn't categorized — function fit is excluded.",
      detail_employer:
        "Job's corporate function isn't categorized — function fit excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  const jobLabel = CORPORATE_FUNCTION_LABELS[jobFn];
  const candFns = deriveCandidateCorporateFunctions(candidate.current_title);
  if (candFns.length === 0) {
    // #48 — clinical bridge: a candidate who has signalled corporate intent
    // (they're already on the corporate track to reach here) AND holds a
    // clinical credential gets PARTIAL, transferable credit on a
    // clinical-welcoming function (clinical leadership / BD / training) — their
    // clinical background is relevant, but it is NOT an exact function match.
    // Deliberately modest (60, "transferable"): we never preload a clinician to
    // "perfect fit" for a corporate role they haven't shown specific fit for.
    if (isClinicalWelcomingFunction(jobFn) && isClinicallyCredentialed(candidate)) {
      return makeScoredDim(
        "role_fit",
        "Function",
        60,
        `Your clinical background is relevant to this ${jobLabel} role — transferable, but tell us more about your corporate experience to strengthen the match.`,
        `Clinical background is relevant to this ${jobLabel} role — transferable, not a direct function match.`
      );
    }
    return makeUnscoredDim("role_fit", "Function", {
      detail:
        "Add your corporate function / current title so we can factor function fit into your match.",
      detail_employer:
        "Candidate's corporate function couldn't be read from their title — function fit excluded from their score.",
      cta_label: "Add your title",
      cta_href: "/candidate/profile#section-identity",
    });
  }
  const relation = corporateFunctionRelation(candFns, jobFn);
  if (relation === "exact") {
    return makeScoredDim(
      "role_fit",
      "Function",
      100,
      `Exact function match — this is a ${jobLabel} role.`,
      `Exact function match — they work in ${jobLabel}.`
    );
  }
  // Adjacent (unrelated was dropped at the gate).
  const candLabel = CORPORATE_FUNCTION_LABELS[candFns[0]] ?? "a related function";
  return makeScoredDim(
    "role_fit",
    "Function",
    60,
    `Adjacent function — you're in ${candLabel}, this is ${jobLabel}: transferable, not identical.`,
    `Adjacent function — they're in ${candLabel}, this is ${jobLabel}: transferable, not identical.`
  );
}

/* ──────────────────────────────────────────────────────────────
 * #52 DSOFit corporate moat dimensions + per-function weighting.
 * ─────────────────────────────────────────────────────────── */

/** Ordered seniority tiers (IC → C-suite). Distance drives the score. */
const SENIORITY_SCALE = ["ic", "lead", "manager", "director", "vp", "c_suite"] as const;
const SENIORITY_LABEL: Record<string, string> = {
  ic: "individual contributor",
  lead: "lead / senior",
  manager: "manager",
  director: "director",
  vp: "VP / SVP",
  c_suite: "C-suite",
};

/**
 * scoreSeniority — does the candidate's level match the role's target tier?
 * Same tier = 100; one off = 80/85; two off = 50/55; 3+ = 30. Slightly kinder
 * to over-qualification than under. COMPLIANCE: tier comes from role level +
 * scope, never age/graduation-year. Excluded when either side is blank.
 */
function scoreSeniority({ candidate, job }: FitInputs): FitDimension {
  const j = token(job.seniority_target);
  if (!j) {
    return makeUnscoredDim("seniority", "Seniority", {
      detail: "This role doesn't specify a target level — seniority is excluded from the score.",
      detail_employer: "Job has no target seniority set — seniority excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  const c = token(candidate.seniority_level);
  if (!c) {
    return makeUnscoredDim("seniority", "Seniority", {
      detail: "Tell us your level (in the DSOFit assessment) to factor seniority into your match.",
      detail_employer: "Candidate hasn't shared their level — seniority excluded from their score.",
      cta_label: "Take the DSOFit assessment",
      cta_href: "/candidate/assessment",
    });
  }
  const ic = SENIORITY_SCALE.indexOf(c as (typeof SENIORITY_SCALE)[number]);
  const ij = SENIORITY_SCALE.indexOf(j as (typeof SENIORITY_SCALE)[number]);
  if (ic < 0 || ij < 0) {
    return makeUnscoredDim("seniority", "Seniority", {
      detail: "Seniority level isn't recognized — excluded from the score.",
      detail_employer: "Seniority level isn't recognized — excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  const dist = Math.abs(ic - ij);
  const over = ic > ij;
  const raw =
    dist === 0 ? 100 : dist === 1 ? (over ? 85 : 80) : dist === 2 ? (over ? 55 : 50) : 30;
  const cl = SENIORITY_LABEL[c] ?? c;
  const jl = SENIORITY_LABEL[j] ?? j;
  const verdict = dist === 0 ? "matches" : dist === 1 ? "is one tier from" : "is a stretch from";
  return makeScoredDim(
    "seniority",
    "Seniority",
    raw,
    `Your level (${cl}) ${verdict} this role's (${jl}).`,
    `Candidate level (${cl}) ${verdict} the role's target (${jl}).`
  );
}

/** Ordered org-scale bands: 1 / 2–9 / 10–49 / 50–99 / 100+ locations. */
const SCALE_BANDS = ["solo", "small", "mid", "large", "enterprise"] as const;
const SCALE_LABEL: Record<string, string> = {
  solo: "a single location",
  small: "a small group (2–9)",
  mid: "a mid-size DSO (10–49)",
  large: "a large DSO (50–99)",
  enterprise: "an enterprise DSO (100+)",
};

/**
 * scoreOrgScale — the multi-site moat. Has the candidate operated at the scale
 * this role needs? Meeting OR exceeding the needed scale = 100 (running 80
 * practices covers a 30-practice role); each band short costs 25, floored at 30
 * (a learnable stretch, not a deal-breaker). Excluded when the role doesn't
 * specify a scale need or the candidate hasn't shared their experience.
 */
function scoreOrgScale({ candidate, job }: FitInputs): FitDimension {
  const need = token(job.org_scale_need);
  if (!need) {
    return makeUnscoredDim("org_scale", "Multi-site scale", {
      detail: "This role doesn't specify a multi-site scale — excluded from the score.",
      detail_employer: "Job has no multi-site scale requirement — excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  const exp = token(candidate.org_scale_experience);
  if (!exp) {
    return makeUnscoredDim("org_scale", "Multi-site scale", {
      detail: "Tell us the largest organization you've operated at (in the DSOFit assessment) to factor this in.",
      detail_employer: "Candidate hasn't shared the scale they've operated at — excluded from their score.",
      cta_label: "Take the DSOFit assessment",
      cta_href: "/candidate/assessment",
    });
  }
  const ie = SCALE_BANDS.indexOf(exp as (typeof SCALE_BANDS)[number]);
  const inb = SCALE_BANDS.indexOf(need as (typeof SCALE_BANDS)[number]);
  if (ie < 0 || inb < 0) {
    return makeUnscoredDim("org_scale", "Multi-site scale", {
      detail: "Scale isn't recognized — excluded from the score.",
      detail_employer: "Scale isn't recognized — excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  const raw = ie >= inb ? 100 : Math.max(30, 100 - (inb - ie) * 25);
  const el = SCALE_LABEL[exp] ?? exp;
  const nl = SCALE_LABEL[need] ?? need;
  const detail =
    ie >= inb
      ? `You've operated at ${el} — at or above the scale this role runs (${nl}).`
      : `You've operated at ${el}; this role runs at ${nl} — a step up.`;
  const detailEmployer =
    ie >= inb
      ? `Has operated at ${el} — at or above the role's scale (${nl}).`
      : `Has operated at ${el}; role runs at ${nl} — a step up.`;
  return makeScoredDim("org_scale", "Multi-site scale", raw, detail, detailEmployer);
}

/**
 * Per-function weight multipliers (DSOFit). Scales the APPLICABLE dims for a
 * corporate function so the score is role-appropriate. Only dims listed are
 * adjusted (default ×1). Derived from the spec's H/M/L matrix
 * (DSOFit_Dimension_Model_2026-06-09.md §4); tunable. Domain/leadership/
 * work-mode dims join here as they're built.
 */
const FUNCTION_WEIGHT_PROFILE: Partial<
  Record<string, Partial<Record<FitDimensionKey, number>>>
> = {
  operations: { org_scale: 1.7, seniority: 1.3, role_fit: 1.2 },
  "clinical-operations": { org_scale: 1.4, seniority: 1.3, role_fit: 1.2 },
  "finance-accounting": { seniority: 1.3, skills: 1.3, org_scale: 0.7 },
  "revenue-cycle-management": { skills: 1.4, org_scale: 0.8 },
  "credentialing-enrollment": { skills: 1.5, seniority: 0.8, org_scale: 0.7 },
  "it-engineering": { skills: 1.5, seniority: 0.9, org_scale: 0.5 },
  "data-analytics": { skills: 1.5, org_scale: 0.6 },
  "legal-compliance": { seniority: 1.3, skills: 1.2 },
  "ma-corporate-development": { seniority: 1.3, org_scale: 1.3, compensation: 1.3 },
  "business-development": { compensation: 1.2, org_scale: 0.9 },
  "hr-recruiting": { org_scale: 1.3, skills: 1.2 },
  marketing: { skills: 1.3 },
  "real-estate-facilities": { org_scale: 1.3, skills: 1.2 },
  "supply-chain-procurement": { org_scale: 1.4, skills: 1.2 },
  "training-development": { skills: 1.2 },
  "patient-contact-center": { org_scale: 1.3, skills: 1.2, seniority: 0.9 },
};

/** The weight-multiplier map for a job's corporate function, or {} otherwise. */
function functionWeightProfile(
  job: FitInputs["job"]
): Partial<Record<FitDimensionKey, number>> {
  if (jobTrack(job) !== "corporate") return {};
  const fn = canonicalizeCorporateFunction(job.corporate_function);
  if (!fn) return {};
  return FUNCTION_WEIGHT_PROFILE[fn] ?? {};
}

/** Apply the profile multipliers in place (weight + recomputed contribution). */
function applyFunctionProfile(
  dims: Record<FitDimensionKey, FitDimension>,
  profile: Partial<Record<FitDimensionKey, number>>
): void {
  for (const key of Object.keys(profile) as FitDimensionKey[]) {
    const mult = profile[key];
    const d = dims[key];
    if (!d || mult == null) continue;
    d.weight = Math.round(d.weight * mult);
    d.contribution = (d.weight * d.raw) / 100;
  }
}

function scoreCompensation({ candidate, job }: FitInputs): FitDimension {
  // v1.8 — DOE jobs don't expose a number for comparison. Excluded
  // from the score regardless of candidate side.
  if (job.compensation_type === "doe") {
    return makeUnscoredDim("compensation", "Compensation", {
      detail:
        "Compensation is discussed at the offer stage on this job — comp is excluded from the score.",
      detail_employer:
        "Job is set to 'Discussed at offer' — comp excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  // Either side missing → exclude from score, surface CTA to whichever
  // side could fix it (we point at the candidate's profile by default
  // since that's the surface they usually own).
  if (candidate.min_salary == null) {
    return makeUnscoredDim("compensation", "Compensation", {
      detail:
        "You haven't set a minimum salary — add one to factor compensation into your match.",
      detail_employer:
        "Candidate hasn't set a minimum salary — comp excluded from their score.",
      cta_label: "Set salary preference",
      cta_href: "/candidate/practice-fit#preferences",
      cta_inline: true,
    });
  }
  // v1.8 — pick the right comparison number based on the job's
  // compensation_type. starting_at uses min (the floor) as ceiling for
  // candidate's perspective; up_to uses max; exact compares against
  // the single number; range falls through to the existing logic.
  const jobMinForComparison =
    job.compensation_type === "up_to" ? null : job.compensation_min;
  if (jobMinForComparison == null && job.compensation_max == null) {
    return makeUnscoredDim("compensation", "Compensation", {
      detail:
        "This job didn't post compensation — comp is excluded from the score.",
      detail_employer:
        "Job has no compensation posted — comp excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  if (candidate.salary_unit !== job.compensation_period) {
    // Different units (hourly vs yearly) — hard to compare without
    // conversion. Lean neutral and disclose. A future sub-phase can
    // normalize.
    return makeScoredDim(
      "compensation",
      "Compensation",
      50,
      "Comp units don't match (hourly vs yearly) — score is approximate."
    );
  }

  // v1.8 — derive the right "ceiling" for the candidate's comparison.
  // For up_to jobs: max IS the ceiling. For starting_at: min IS the
  // ceiling we compare candidate's expectation against (since max is
  // unspecified, we treat the floor as the comparable number — they're
  // committing to at least that). For exact + range: legacy max-or-min.
  const jobTop =
    job.compensation_type === "starting_at"
      ? (job.compensation_min ?? 0)
      : (job.compensation_max ?? job.compensation_min ?? 0);
  let raw: number;
  let detail: string;
  let detailEmployer: string;
  const jobTopFmt = formatComp(jobTop, job.compensation_period);
  const candMinFmt = formatComp(candidate.min_salary, candidate.salary_unit);
  if (jobTop >= candidate.min_salary) {
    const ratio = jobTop / candidate.min_salary;
    raw = ratio >= 1.2 ? 100 : 80 + Math.round((ratio - 1) * 100);
    detail = `Job's range covers your minimum (${jobTopFmt}+).`;
    detailEmployer = `Job range covers their minimum (${jobTopFmt}+).`;
  } else {
    const shortfall = (candidate.min_salary - jobTop) / candidate.min_salary;
    raw = Math.max(0, Math.round(50 - shortfall * 100));
    detail = `Job ceiling (${jobTopFmt}) below your min (${candMinFmt}).`;
    detailEmployer = `Job ceiling (${jobTopFmt}) below their minimum (${candMinFmt}).`;
  }
  return makeScoredDim("compensation", "Compensation", raw, detail, detailEmployer);
}

function scoreLocation({ candidate, job }: FitInputs): FitDimension {
  const jobStates = new Set(
    (job.locations ?? [])
      .map((l) => (l.state ?? "").toUpperCase())
      .filter((s) => s.length > 0)
  );

  // No locations on the job → excluded entirely (the dim isn't
  // meaningful for fully-remote / spec-only postings yet).
  if (jobStates.size === 0) {
    return makeUnscoredDim("location", "Location", {
      detail: "Job has no locations on file — location is excluded from the score.",
      detail_employer:
        "Job has no locations on file — location excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  const candidateStates = new Set(
    (candidate.license_states ?? []).map((s) => s.toUpperCase())
  );

  // Candidate hasn't said where they're licensed AND hasn't picked
  // desired locations (string or geocoded) — exclude with a CTA.
  if (
    candidateStates.size === 0 &&
    (candidate.desired_locations ?? []).length === 0 &&
    (candidate.desired_location_points ?? []).length === 0
  ) {
    return makeUnscoredDim("location", "Location", {
      detail:
        "Add your license state(s) and desired locations to factor location into your match.",
      detail_employer:
        "Candidate hasn't listed license states or desired locations — location excluded from their score.",
      cta_label: "Add license + locations",
      cta_href: "/candidate/practice-fit#preferences",
    });
  }

  const stateMatch = [...jobStates].some((s) => candidateStates.has(s));

  // ── v2 (Phase A.2) distance path — preferred when both sides have coords.
  // Score on the candidate's DESIRED markets (relocation-aware), never a
  // home address. Min great-circle distance from any target market to any
  // job location, run through a gentle decay curve.
  const jobPoints = (job.locations ?? [])
    .filter((l) => l.latitude != null && l.longitude != null)
    .map((l) => ({ lat: l.latitude as number, lng: l.longitude as number }));
  const candPoints = candidate.desired_location_points ?? [];

  if (jobPoints.length > 0 && candPoints.length > 0) {
    let minMiles = Infinity;
    for (const c of candPoints) {
      for (const j of jobPoints) {
        const d = haversineMiles(c.lat, c.lng, j.lat, j.lng);
        if (d < minMiles) minMiles = d;
      }
    }
    const mi = Math.round(minMiles);
    // 0–10 mi → 100, then ~1 pt/mile, floored at 20.
    let raw = Math.max(20, Math.min(100, Math.round(100 - Math.max(0, minMiles - 10))));
    const relocate = Boolean(candidate.schedule_preferences?.willing_to_relocate);

    let detail: string;
    let detailEmployer: string;
    if (minMiles <= 15) {
      detail = `Right in a market you're targeting — about ${mi} mi out.`;
      detailEmployer = `In a market they're targeting — about ${mi} mi out.`;
    } else if (relocate) {
      raw = Math.max(raw, 55);
      detail = `About ${mi} mi from your nearest target market — and you're open to relocating.`;
      detailEmployer = `About ${mi} mi from their nearest target market; open to relocating.`;
    } else {
      detail = `About ${mi} mi from your nearest target market.`;
      detailEmployer = `About ${mi} mi from their nearest target market.`;
    }
    if (stateMatch) {
      detail += " You're licensed in this state.";
      detailEmployer += " Licensed in this state.";
    }
    return makeScoredDim("location", "Location", raw, detail, detailEmployer);
  }

  // ── Fallback: no coords on one side — keep the v1 string/state logic so
  // we never regress when geocoding is unavailable.
  const jobCityStateLabels = (job.locations ?? []).map((l) =>
    [l.city, l.state].filter(Boolean).join(", ").toLowerCase()
  );
  const cityMatch = (candidate.desired_locations ?? []).some((wanted) => {
    const w = wanted.toLowerCase();
    return jobCityStateLabels.some(
      (loc) => loc.includes(w) || w.includes(loc)
    );
  });

  let raw: number;
  let detail: string;
  let detailEmployer: string;

  if (stateMatch && cityMatch) {
    raw = 100;
    detail = "Licensed in this state and the city is on your wish list.";
    detailEmployer = "Licensed in this state and the city is on their wish list.";
  } else if (stateMatch) {
    raw = 80;
    detail = "Licensed in this state.";
    detailEmployer = "Licensed in this state.";
  } else if (cityMatch) {
    raw = 65;
    detail = "City is on your wish list — confirm licensure for this state.";
    detailEmployer = "City is on their wish list — licensure for this state not confirmed.";
  } else if (candidate.schedule_preferences?.willing_to_relocate) {
    raw = 40;
    detail = "Outside your states, but you're open to relocation.";
    detailEmployer = "Outside their licensed states — they're open to relocation.";
  } else {
    raw = 10;
    detail = "Outside your licensed states / desired locations.";
    detailEmployer = "Outside their licensed states / desired locations.";
  }
  return makeScoredDim("location", "Location", raw, detail, detailEmployer);
}

/**
 * scorePmsFluency — Phase A.3. The dental moat's headline signal. A hire
 * fluent in the practice's PMS ramps in days, not months — it's the first
 * thing operators ask in interviews and the first thing no horizontal job
 * board can score. Job PMS need is detected from the posting text in the
 * loader (the job side has no structured PMS field). A learnable gap, not a
 * deal-breaker, so a mismatch floors at 35 rather than zero.
 */
function scorePmsFluency({ candidate, job }: FitInputs): FitDimension {
  const jobPms = (job.pms_required ?? []).map((s) => s.toLowerCase());
  if (jobPms.length === 0) {
    return makeUnscoredDim("pms_fluency", "PMS fluency", {
      detail:
        "This posting doesn't name a practice-management system — PMS fluency is excluded from the score.",
      detail_employer:
        "Job text doesn't name a PMS — PMS fluency excluded. Name your system (e.g. Open Dental) to factor it in.",
      cta_label: null,
      cta_href: null,
    });
  }

  const candPms = (candidate.pms_systems ?? []).map((s) => s.toLowerCase());
  if (candPms.length === 0) {
    return makeUnscoredDim("pms_fluency", "PMS fluency", {
      detail:
        "Add the practice-management systems you know to factor PMS fluency into your match.",
      detail_employer:
        "Candidate hasn't listed any PMS experience — PMS fluency excluded from their score.",
      cta_label: "Add your PMS experience",
      cta_href: "/candidate/profile#section-skills",
    });
  }

  const overlap = jobPms.filter((p) => candPms.includes(p));
  const prettyJob = (job.pms_required ?? []).join(", ");
  if (overlap.length > 0) {
    const pretty = titleCasePms(job.pms_required ?? [], overlap);
    const raw = overlap.length >= jobPms.length ? 100 : 88;
    return makeScoredDim(
      "pms_fluency",
      "PMS fluency",
      raw,
      `Fluent in ${pretty} — the system this practice runs. You'd ramp in days.`,
      `Fluent in ${pretty} — the system this practice runs; minimal ramp-up.`
    );
  }

  const candPretty = (candidate.pms_systems ?? []).join(", ");
  return makeScoredDim(
    "pms_fluency",
    "PMS fluency",
    35,
    `This practice runs ${prettyJob}; you've listed ${candPretty}. Learnable, but a ramp-up.`,
    `Practice runs ${prettyJob}; they've listed ${candPretty}. Learnable, but a ramp-up.`
  );
}

/** Render the matched PMS names in their canonical casing for copy. */
function titleCasePms(jobPms: string[], overlapLower: string[]): string {
  const matched = jobPms.filter((p) => overlapLower.includes(p.toLowerCase()));
  return matched.join(", ");
}

/**
 * Roles that legally require a state clinical license. Assistants vary by
 * state (cert, not license) so they're handled by the certs signal (A.3b),
 * not here.
 */
const LICENSE_REQUIRED_ROLES = new Set([
  "associate_dentist",
  "specialist_dentist",
  "hygienist",
]);

/**
 * scoreLicenseState — Phase A.3. A clinician can't legally work without the
 * right state license, so a license-state mismatch is a near-deal-breaker
 * (the hard score cap lands in A.4; for now the raw reflects reality). Only
 * fires for license-required clinical roles — excluded for admin/front-office
 * roles, where it isn't meaningful.
 */
function scoreLicenseState({ candidate, job }: FitInputs): FitDimension {
  const jobRole = canonicalizeRoleCategory(job.role_category);
  if (!LICENSE_REQUIRED_ROLES.has(jobRole)) {
    return makeUnscoredDim("license_state", "State licensure", {
      detail:
        "This role doesn't require a state clinical license — licensure is excluded from the score.",
      detail_employer:
        "Role doesn't require a state clinical license — licensure excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  const jobStates = new Set(
    (job.locations ?? [])
      .map((l) => (l.state ?? "").toUpperCase())
      .filter((s) => s.length > 0)
  );
  if (jobStates.size === 0) {
    return makeUnscoredDim("license_state", "State licensure", {
      detail:
        "This posting has no location state on file — licensure is excluded from the score.",
      detail_employer:
        "Job has no location state on file — licensure excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  const candStates = (candidate.license_states ?? []).map((s) =>
    s.toUpperCase()
  );
  if (candStates.length === 0) {
    return makeUnscoredDim("license_state", "State licensure", {
      detail:
        "Add the state(s) you're licensed in to factor licensure into your match.",
      detail_employer:
        "Candidate hasn't listed any license states — licensure excluded from their score.",
      cta_label: "Add license states",
      cta_href: "/candidate/practice-fit#preferences",
    });
  }

  const jobStateList = [...jobStates];
  const matchState = jobStateList.find((s) => candStates.includes(s));
  if (matchState) {
    return makeScoredDim(
      "license_state",
      "State licensure",
      100,
      `Licensed in ${matchState} — cleared to practice at this location.`,
      `Licensed in ${matchState} — cleared to practice at this location.`
    );
  }

  const jobStateStr = jobStateList.join(" / ");
  const candStateStr = candStates.join(", ");
  if (candidate.schedule_preferences?.willing_to_relocate) {
    return makeScoredDim(
      "license_state",
      "State licensure",
      45,
      `Licensed in ${candStateStr}, not ${jobStateStr} — you'd need ${jobStateStr} licensure, and you're open to relocating.`,
      `Licensed in ${candStateStr}, not ${jobStateStr} — would need ${jobStateStr} licensure; open to relocating.`
    );
  }
  return makeScoredDim(
    "license_state",
    "State licensure",
    20,
    `Licensed in ${candStateStr}, not ${jobStateStr} — ${jobStateStr} licensure is required to work here.`,
    `Licensed in ${candStateStr}, not ${jobStateStr} — ${jobStateStr} licensure required to work here.`
  );
}

/**
 * scoreCertifications — Phase A.3b. Dental credential readiness. The certs a
 * posting calls out (CPR/BLS, radiology, nitrous, sedation, OSHA…) are
 * detected from the job text in the loader; here we match them against the
 * candidate's furnished certifications. Most certs are obtainable, so a gap
 * floors at 30 rather than zero — it's a readiness signal, not a deal-breaker.
 */
function scoreCertifications({ candidate, job }: FitInputs): FitDimension {
  const jobCerts = (job.certs_required ?? []).map((s) => s.toLowerCase());
  if (jobCerts.length === 0) {
    return makeUnscoredDim("certifications", "Certifications", {
      detail:
        "This posting doesn't call out specific certifications — excluded from the score.",
      detail_employer:
        "Job text doesn't name specific certifications — certifications excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  const candCerts = (candidate.certifications ?? []).map((s) =>
    s.toLowerCase()
  );
  if (candCerts.length === 0) {
    return makeUnscoredDim("certifications", "Certifications", {
      detail:
        "Add your certifications (radiology, nitrous, CPR/BLS…) to factor them into your match.",
      detail_employer:
        "Candidate hasn't listed certifications — certifications excluded from their score.",
      cta_label: "Add certifications",
      cta_href: "/candidate/profile#section-credentials",
    });
  }

  const matched = jobCerts.filter((c) => candCerts.includes(c));
  const label = (k: string) => CERT_LABELS[k] ?? k;
  const matchedLabels = (job.certs_required ?? [])
    .filter((c) => matched.includes(c.toLowerCase()))
    .map(label)
    .join(", ");
  const requiredLabels = (job.certs_required ?? []).map(label).join(", ");

  if (matched.length >= jobCerts.length) {
    return makeScoredDim(
      "certifications",
      "Certifications",
      100,
      `Holds every certification this role calls out (${matchedLabels}).`,
      `Holds every certification this role calls out (${matchedLabels}).`
    );
  }
  if (matched.length > 0) {
    const missingLabels = (job.certs_required ?? [])
      .filter((c) => !matched.includes(c.toLowerCase()))
      .map(label)
      .join(", ");
    const raw = Math.max(45, Math.round((matched.length / jobCerts.length) * 100));
    return makeScoredDim(
      "certifications",
      "Certifications",
      raw,
      `Holds ${matched.length} of ${jobCerts.length} certs (${matchedLabels}). Missing: ${missingLabels}.`,
      `Holds ${matched.length} of ${jobCerts.length} certs (${matchedLabels}). Missing: ${missingLabels}.`
    );
  }
  return makeScoredDim(
    "certifications",
    "Certifications",
    30,
    `This role calls out ${requiredLabels}; none on your profile yet — most are quick to obtain.`,
    `Role calls out ${requiredLabels}; none on their profile yet — most are quick to obtain.`
  );
}

function scoreSpecialty({ candidate, job }: FitInputs): FitDimension {
  const jobSpecs = (job.specialty ?? []).map((s) => s.toLowerCase());
  const candSpecs = (candidate.desired_specialty ?? []).map((s) =>
    s.toLowerCase()
  );

  // Job is specialty-agnostic (admin / front-desk roles) → exclude.
  if (jobSpecs.length === 0) {
    return makeUnscoredDim("specialty", "Specialty", {
      detail:
        "This posting doesn't specify a specialty — excluded from the score.",
      detail_employer:
        "Job has no specialty set — specialty excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  // Candidate hasn't picked specialties → exclude with CTA.
  if (candSpecs.length === 0) {
    return makeUnscoredDim("specialty", "Specialty", {
      detail: "Pick your specialties to factor specialty fit into your match.",
      detail_employer:
        "Candidate hasn't picked specialties — specialty excluded from their score.",
      cta_label: "Add specialties",
      cta_href: "/candidate/practice-fit#preferences",
    });
  }

  const overlap = jobSpecs.filter((s) => candSpecs.includes(s));
  let raw: number;
  let detail: string;
  let detailEmployer: string;
  if (overlap.length === jobSpecs.length) {
    raw = 100;
    detail = `Your specialties cover everything this posting calls for (${overlap.join(", ")}).`;
    detailEmployer = `Their specialties cover everything this posting calls for (${overlap.join(", ")}).`;
  } else if (overlap.length > 0) {
    raw = Math.round((overlap.length / jobSpecs.length) * 100);
    detail = `${overlap.length} of ${jobSpecs.length} specialties match (${overlap.join(", ")}).`;
    detailEmployer = detail;
  } else {
    raw = 15;
    detail = `Your specialties (${candSpecs.join(", ")}) don't overlap with this posting (${jobSpecs.join(", ")}).`;
    detailEmployer = `Their specialties (${candSpecs.join(", ")}) don't overlap with this posting (${jobSpecs.join(", ")}).`;
  }
  return makeScoredDim("specialty", "Specialty", raw, detail, detailEmployer);
}

function scoreSkills({ candidate, job }: FitInputs): FitDimension {
  const candidateSkills = new Set(
    (candidate.skills ?? []).map((s) => s.toLowerCase())
  );
  const jobSkills = (job.skills ?? []).map((s) => s.toLowerCase());

  // Job didn't list skills → exclude (not meaningful).
  if (jobSkills.length === 0) {
    return makeUnscoredDim("skills", "Skills", {
      detail: "Job didn't list specific skills — skills are excluded from the score.",
      detail_employer:
        "Job has no listed skills — skills excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  // Candidate hasn't listed skills → exclude with CTA.
  if (candidateSkills.size === 0) {
    return makeUnscoredDim("skills", "Skills", {
      detail: "Add your skills to factor skill match into your score.",
      detail_employer:
        "Candidate hasn't listed skills — skills excluded from their score.",
      cta_label: "Add skills",
      cta_href: "/candidate/profile#section-skills",
    });
  }

  const matched = jobSkills.filter((s) => candidateSkills.has(s));
  // v1.8 — "preferred" framing: we cap the denominator at 5 so jobs
  // listing many skills don't punish candidates who hit the most
  // important few. 3+ matches → strong; 5+ → effectively full credit.
  // Also boosts the "1 match" floor so a single relevant skill isn't
  // scored as 14/100 on a 7-skill posting.
  const denom = Math.min(jobSkills.length, 5);
  const baseRatio = matched.length / denom;
  const ratio = Math.min(1, baseRatio);
  // Floor at 30 when there's at least one match — single matches still
  // signal something. 0 matches → 0.
  const raw =
    matched.length === 0
      ? 0
      : Math.max(30, Math.round(ratio * 100));
  let detail: string;
  let detailEmployer: string;
  if (matched.length >= jobSkills.length) {
    detail = `Every skill on the posting matches yours (${matched.length} of ${jobSkills.length}).`;
    detailEmployer = `Every skill on the posting matches theirs (${matched.length} of ${jobSkills.length}).`;
  } else if (matched.length > 0) {
    detail = `${matched.length} of ${jobSkills.length} skills match — preferred, not required.`;
    detailEmployer = detail;
  } else {
    // Cam polish 2026-05-13 — pluralize "skill" so a 1-skill posting
    // reads "1 preferred skill" not "1 preferred skills".
    const noun = jobSkills.length === 1 ? "skill" : "skills";
    detail = `Posting lists ${jobSkills.length} preferred ${noun}; none match your profile yet.`;
    detailEmployer = `Posting lists ${jobSkills.length} preferred ${noun}; none match their profile yet.`;
  }
  return makeScoredDim("skills", "Skills", raw, detail, detailEmployer);
}

function scoreYearsExperience({
  candidate,
  job,
}: FitInputs): FitDimension {
  const min = job.min_years_experience;
  const cand = candidate.years_experience_dental;

  // Job has no minimum → exclude (most postings are like this).
  if (min == null) {
    return makeUnscoredDim("years_experience", "Years of experience", {
      detail: "This posting has no minimum experience — excluded from the score.",
      detail_employer:
        "Job has no minimum experience set — years experience excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }
  // Candidate hasn't filled in years → exclude with CTA.
  if (cand == null) {
    return makeUnscoredDim("years_experience", "Years of experience", {
      detail:
        "Add your years of dental experience to factor experience into your match.",
      detail_employer:
        "Candidate hasn't logged years of experience — years excluded from their score.",
      cta_label: "Add experience",
      cta_href: "/candidate/profile#section-identity",
      cta_inline: true,
    });
  }

  let raw: number;
  let detail: string;
  if (cand >= min) {
    // Comfortable margin → 100; right at the floor → 80.
    const margin = cand - min;
    raw = margin >= 3 ? 100 : 80 + Math.round((margin / 3) * 20);
    detail = `${cand} years of experience meets the ${min}-year minimum.`;
  } else {
    // Short by N years. Each year short knocks ~25 points off; a
    // 3-year gap zeroes out.
    const gap = min - cand;
    raw = Math.max(0, 60 - gap * 20);
    detail = `${cand} years of experience — posting asks for ${min}.`;
  }
  return makeScoredDim(
    "years_experience",
    "Years of experience",
    raw,
    detail
  );
}

function scoreEmploymentType({ candidate, job }: FitInputs): FitDimension {
  const jobType = (job.employment_type ?? "").toLowerCase();

  if (!jobType) {
    return makeUnscoredDim("employment_type", "Employment type", {
      detail: "Job didn't specify employment type — excluded from the score.",
      detail_employer:
        "Job has no employment type set — employment type excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  const candPref = candidate.temp_or_perm ?? null;
  if (candPref === null) {
    return makeUnscoredDim("employment_type", "Employment type", {
      detail:
        "Pick whether you want permanent or temp/contract roles to factor employment type in.",
      detail_employer:
        "Candidate hasn't picked permanent vs temp/contract — employment type excluded from their score.",
      cta_label: "Choose permanent or temp/contract",
      cta_href: "/candidate/practice-fit#preferences",
      cta_inline: true,
    });
  }

  const tempLike = new Set(["contract", "prn", "locum", "part_time"]);
  const permLike = new Set(["full_time"]);

  let raw: number;
  let detail: string;
  if (candPref === "either") {
    raw = 90;
    detail = `Open to either — job is ${prettyEmployment(jobType)}.`;
  } else if (candPref === "perm" && permLike.has(jobType)) {
    raw = 100;
    detail = "Wants permanent — this is full-time.";
  } else if (candPref === "temp" && tempLike.has(jobType)) {
    raw = 100;
    detail = `Wants temp/contract — this is ${prettyEmployment(jobType)}.`;
  } else {
    raw = 30;
    detail = `Wants ${candPref === "perm" ? "permanent" : "temp/contract"} — this is ${prettyEmployment(jobType)}.`;
  }
  return makeScoredDim(
    "employment_type",
    "Employment type",
    raw,
    detail
  );
}

function scoreDsoSize({ candidate, dso }: FitInputs): FitDimension {
  const count = Math.max(0, dso.location_count ?? 0);
  const pref = candidate.dso_size_preference ?? null;

  // Candidate is "any" or hasn't chosen → still scored but neutral-high
  // (no pref means no penalty), unless they've explicitly set a pref.
  let actual: "small" | "mid" | "large";
  if (count <= 9) actual = "small";
  else if (count <= 49) actual = "mid";
  else actual = "large";

  if (pref === null) {
    return makeUnscoredDim("dso_size", "DSO size", {
      detail: "Pick a DSO-size preference to factor it into your match.",
      detail_employer:
        "Candidate hasn't picked a DSO-size preference — DSO size excluded from their score.",
      cta_label: "Set your practice-size preference",
      cta_href: "/candidate/practice-fit#preferences",
      cta_inline: true,
    });
  }

  let raw: number;
  let detail: string;
  let detailEmployer: string;
  if (pref === "any" || pref === actual) {
    raw = 100;
    detail = `${count}-practice DSO matches your preference.`;
    detailEmployer = `${count}-practice DSO matches their preference.`;
  } else {
    const order = ["small", "mid", "large"];
    const distance = Math.abs(order.indexOf(pref) - order.indexOf(actual));
    raw = distance === 1 ? 60 : 30;
    detail = `You prefer ${pref}-size DSOs — this is ${actual} (${count} practices).`;
    detailEmployer = `They prefer ${pref}-size DSOs — this is ${actual} (${count} practices).`;
  }
  return makeScoredDim("dso_size", "DSO size", raw, detail, detailEmployer);
}

/* ──────────────────────────────────────────────────────────────
 * scoreScheduleOverlap — Track F (2026-05-12)
 *
 * Intersects the job's staffed days + evening/weekend flags with the
 * candidate's schedule preferences. Excluded when either side has no
 * signal. When both sides have data:
 *   • Full day-set overlap + matching evening/weekend flags → 100
 *   • Most days overlap → high score
 *   • Partial day overlap → mid score
 *   • Zero day overlap → near-floor (we still score the dim to signal
 *     the conflict, but only on a single floor; weight is only 5 so the
 *     impact on the overall score is bounded).
 * ─────────────────────────────────────────────────────────── */

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayKey = (typeof DAY_KEYS)[number];

function scoreScheduleOverlap({ candidate, job }: FitInputs): FitDimension {
  const jobDays = (job.schedule_days ?? []).filter((d): d is DayKey =>
    (DAY_KEYS as readonly string[]).includes(d)
  );
  const jobHasEvenings = Boolean(job.schedule_evenings);
  const jobHasWeekends =
    Boolean(job.schedule_weekends) ||
    jobDays.includes("sat") ||
    jobDays.includes("sun");
  const jobHasSchedule =
    jobDays.length > 0 || jobHasEvenings || jobHasWeekends;

  if (!jobHasSchedule) {
    return makeUnscoredDim("schedule_overlap", "Schedule", {
      detail:
        "This job didn't post a schedule — schedule fit is excluded from the score.",
      detail_employer:
        "Job has no schedule posted — schedule fit excluded from the score.",
      cta_label: null,
      cta_href: null,
    });
  }

  const candPrefs = candidate.schedule_preferences ?? {};
  const candDays: DayKey[] = DAY_KEYS.filter(
    (k) => Boolean((candPrefs as Record<string, unknown>)[k])
  );
  const candAcceptsEvenings = Boolean(candPrefs.evenings);
  const candAcceptsWeekends =
    Boolean(candPrefs.sat) || Boolean(candPrefs.sun);
  const candHasSchedulePref =
    candDays.length > 0 || candAcceptsEvenings || candAcceptsWeekends;

  if (!candHasSchedulePref) {
    return makeUnscoredDim("schedule_overlap", "Schedule", {
      detail:
        "Pick the days you can work to factor schedule fit into your match.",
      detail_employer:
        "Candidate hasn't picked schedule preferences — schedule fit excluded from their score.",
      cta_label: "Set schedule preference",
      cta_href: "/candidate/practice-fit#preferences",
    });
  }

  // If either side only specified evenings/weekends and no concrete days,
  // score on the flag overlap alone.
  let raw: number;
  let detail: string;
  let detailEmployer: string;

  if (jobDays.length === 0) {
    // Job only flagged evenings / weekends.
    const eveningsMatch = !jobHasEvenings || candAcceptsEvenings;
    const weekendsMatch = !jobHasWeekends || candAcceptsWeekends;
    if (eveningsMatch && weekendsMatch) {
      raw = 95;
      detail = "Your schedule preferences cover the role's evening/weekend hours.";
      detailEmployer = "Their schedule preferences cover the role's evening/weekend hours.";
    } else if (eveningsMatch || weekendsMatch) {
      raw = 55;
      detail =
        "Partial fit on the role's evening or weekend hours — you'd cover some shifts.";
      detailEmployer =
        "Partial fit on the role's evening or weekend hours — they'd cover some shifts.";
    } else {
      raw = 25;
      detail =
        "Role needs evening or weekend coverage that isn't in your preferences.";
      detailEmployer =
        "Role needs evening or weekend coverage that isn't in their preferences.";
    }
    return makeScoredDim(
      "schedule_overlap",
      "Schedule",
      raw,
      detail,
      detailEmployer
    );
  }

  // Day-by-day intersection.
  const overlap = jobDays.filter((d) => candDays.includes(d));
  const ratio = jobDays.length === 0 ? 0 : overlap.length / jobDays.length;

  // Evening/weekend conflicts are penalty modifiers — clinic asks for
  // evenings but candidate didn't tick that box: -15 from the day-overlap
  // score.
  let modifier = 0;
  if (jobHasEvenings && !candAcceptsEvenings) modifier -= 15;
  if (jobHasWeekends && !candAcceptsWeekends) modifier -= 15;

  if (overlap.length === jobDays.length) {
    raw = Math.max(40, 100 + modifier);
    if (modifier === 0) {
      detail = `You're available every day this role is staffed (${overlap.join(", ")}).`;
      detailEmployer = `Available every day this role is staffed (${overlap.join(", ")}).`;
    } else {
      detail = `Day overlap is complete (${overlap.join(", ")}), but the role's evening/weekend coverage isn't in your preferences.`;
      detailEmployer = `Day overlap is complete (${overlap.join(", ")}), but the role's evening/weekend coverage isn't in their preferences.`;
    }
  } else if (overlap.length === 0) {
    raw = Math.max(15, 25 + modifier);
    detail = `Your available days don't overlap with the role's staffed days (${jobDays.join(", ")}).`;
    detailEmployer = `Their available days don't overlap with the role's staffed days (${jobDays.join(", ")}).`;
  } else {
    raw = Math.max(25, Math.round(ratio * 90) + modifier);
    detail = `${overlap.length} of ${jobDays.length} staffed days overlap with your availability (${overlap.join(", ")}).`;
    detailEmployer = `${overlap.length} of ${jobDays.length} staffed days overlap with their availability (${overlap.join(", ")}).`;
  }
  return makeScoredDim("schedule_overlap", "Schedule", raw, detail, detailEmployer);
}

/* ──────────────────────────────────────────────────────────────
 * Hashing — input fingerprint for the cache layer
 *
 * v1.1 adds specialty + min_years_experience (job side) and
 * years_experience_dental (candidate side) to the snapshot. Old v0
 * hashes can never match v1.1 hashes — the migration clears the cache
 * to make the transition explicit rather than relying on hash drift.
 * ─────────────────────────────────────────────────────────── */

/* ──────────────────────────────────────────────────────────────
 * v3 Phase B.1 — culture / work-style scorers.
 *
 * Two scoring shapes:
 *   • Ordinal MATCH (pace / autonomy / mentorship / practice-feel): both
 *     sides pick a value on a short ordered scale. Same = 100, one step
 *     apart = 60, two+ apart = 25. Symmetric — neither side is "right."
 *   • Desire-vs-PROVISION (CE/growth, work-life): the candidate rates how
 *     much they value it (1-5); the practice rates how much it provides
 *     (1-5). Meeting or exceeding the candidate's bar = 100; each point the
 *     practice falls short costs 20. Over-provision is never penalized — a
 *     candidate who doesn't prioritize CE at a high-CE practice still fits.
 *
 * Every scorer is UNSCORED when either side is blank (missing data drops
 * from the denominator — never a penalty), matching the rest of the engine.
 * ─────────────────────────────────────────────────────────── */

/** Normalize a stored signal to a trimmed lowercase token, or null. */
function token(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return t.length ? t : null;
}

/** 100 / 60 / 25 by distance on an ordered scale. Null if either off-scale. */
function ordinalMatchRaw(
  a: string | null,
  b: string | null,
  scale: readonly string[]
): number | null {
  if (!a || !b) return null;
  const ia = scale.indexOf(a);
  const ib = scale.indexOf(b);
  if (ia < 0 || ib < 0) return null;
  const dist = Math.abs(ia - ib);
  return dist === 0 ? 100 : dist === 1 ? 60 : 25;
}

/** Practice meets/exceeds the candidate's 1-5 bar = 100; each short point -20. */
function desireVsProvisionRaw(
  desire: number | null,
  provision: number | null
): number | null {
  if (desire == null || provision == null) return null;
  if (provision >= desire) return 100;
  return Math.max(0, 100 - (desire - provision) * 20);
}

const PACE_SCALE = ["high_volume", "steady", "thorough"] as const;
const AUTONOMY_SCALE = ["autonomy", "balance", "structure"] as const;
const MENTORSHIP_SCALE = ["strong", "occasional", "independent"] as const;
const FEEL_SCALE = ["private", "midsize", "large"] as const;

const PACE_LABEL: Record<string, string> = {
  high_volume: "high-volume, fast-moving",
  steady: "steady and balanced",
  thorough: "unhurried and thorough",
};
const AUTONOMY_LABEL: Record<string, string> = {
  autonomy: "high autonomy",
  balance: "a balance of autonomy and support",
  structure: "clear protocols and close support",
};
const MENTORSHIP_LABEL: Record<string, string> = {
  strong: "strong mentorship",
  occasional: "occasional guidance",
  independent: "full independence",
};
const FEEL_LABEL: Record<string, string> = {
  private: "a tight-knit, private-practice feel",
  midsize: "a mid-size, collaborative group",
  large: "a large team with lots of resources",
};

function scoreWorkPace(inputs: FitInputs): FitDimension {
  const c = token(inputs.candidate.work_pace);
  const p = token(inputs.dso.practice_pace);
  if (!c) {
    return makeUnscoredDim("work_pace", "Work pace", {
      detail: "Take the assessment so we can match your ideal pace.",
      detail_employer: "Candidate hasn't shared a pace preference — excluded.",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }
  if (!p) {
    return makeUnscoredDim("work_pace", "Work pace", {
      detail: "This practice hasn't shared its pace yet — excluded for now.",
      detail_employer:
        "Add your practice's pace to factor it into candidate matches.",
      cta_label: null,
      cta_href: null,
    });
  }
  const raw = ordinalMatchRaw(c, p, PACE_SCALE) ?? 0;
  const verdict =
    raw >= 100 ? "matches" : raw >= 60 ? "is close to" : "differs from";
  return makeScoredDim(
    "work_pace",
    "Work pace",
    raw,
    `Your preferred pace (${PACE_LABEL[c] ?? c}) ${verdict} this practice's (${PACE_LABEL[p] ?? p}).`,
    `Pace fit: candidate prefers ${PACE_LABEL[c] ?? c}; practice runs ${PACE_LABEL[p] ?? p}.`
  );
}

function scoreAutonomy(inputs: FitInputs): FitDimension {
  const c = token(inputs.candidate.autonomy_pref);
  const p = token(inputs.dso.autonomy_level);
  if (!c) {
    return makeUnscoredDim("autonomy", "Autonomy", {
      detail: "Take the assessment so we can match how independently you like to work.",
      detail_employer: "Candidate hasn't shared an autonomy preference — excluded.",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }
  if (!p) {
    return makeUnscoredDim("autonomy", "Autonomy", {
      detail: "This practice hasn't described its autonomy level yet — excluded.",
      detail_employer: "Add your autonomy level to factor it into matches.",
      cta_label: null,
      cta_href: null,
    });
  }
  const raw = ordinalMatchRaw(c, p, AUTONOMY_SCALE) ?? 0;
  const verdict = raw >= 100 ? "matches" : raw >= 60 ? "is close to" : "differs from";
  return makeScoredDim(
    "autonomy",
    "Autonomy",
    raw,
    `You want ${AUTONOMY_LABEL[c] ?? c}; this practice offers ${AUTONOMY_LABEL[p] ?? p} — ${verdict === "matches" ? "a match" : verdict === "is close to" ? "close" : "a gap"}.`,
    `Autonomy: candidate wants ${AUTONOMY_LABEL[c] ?? c}; practice offers ${AUTONOMY_LABEL[p] ?? p}.`
  );
}

function scoreMentorship(inputs: FitInputs): FitDimension {
  const c = token(inputs.candidate.mentorship_pref);
  const p = token(inputs.dso.mentorship_offered);
  if (!c) {
    return makeUnscoredDim("mentorship", "Mentorship", {
      detail: "Take the assessment so we can match the mentorship you want.",
      detail_employer: "Candidate hasn't shared a mentorship preference — excluded.",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }
  if (!p) {
    return makeUnscoredDim("mentorship", "Mentorship", {
      detail: "This practice hasn't described its mentorship yet — excluded.",
      detail_employer: "Add the mentorship you offer to factor it into matches.",
      cta_label: null,
      cta_href: null,
    });
  }
  const raw = ordinalMatchRaw(c, p, MENTORSHIP_SCALE) ?? 0;
  const verdict = raw >= 100 ? "matches" : raw >= 60 ? "is close to" : "differs from";
  return makeScoredDim(
    "mentorship",
    "Mentorship",
    raw,
    `You're looking for ${MENTORSHIP_LABEL[c] ?? c}; this practice offers ${MENTORSHIP_LABEL[p] ?? p} — ${verdict === "matches" ? "a match" : verdict === "is close to" ? "close" : "a gap"}.`,
    `Mentorship: candidate wants ${MENTORSHIP_LABEL[c] ?? c}; practice offers ${MENTORSHIP_LABEL[p] ?? p}.`
  );
}

function scoreCeGrowth(inputs: FitInputs): FitDimension {
  const desire = inputs.candidate.ce_growth_importance ?? null;
  const provision = inputs.dso.ce_support ?? null;
  if (desire == null) {
    return makeUnscoredDim("ce_growth", "Growth & CE", {
      detail: "Take the assessment to tell us how much growth and CE matter to you.",
      detail_employer: "Candidate hasn't rated how much CE/growth matters — excluded.",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }
  if (provision == null) {
    return makeUnscoredDim("ce_growth", "Growth & CE", {
      detail: "This practice hasn't shared its CE support yet — excluded.",
      detail_employer: "Add your CE / growth support to factor it into matches.",
      cta_label: null,
      cta_href: null,
    });
  }
  const raw = desireVsProvisionRaw(desire, provision) ?? 0;
  return makeScoredDim(
    "ce_growth",
    "Growth & CE",
    raw,
    raw >= 100
      ? "This practice's growth and CE support meets what you're looking for."
      : "This practice offers less CE/growth support than you said you want.",
    raw >= 100
      ? "Practice's CE/growth support meets the candidate's priority."
      : "Practice offers less CE/growth than the candidate prioritizes."
  );
}

function scoreWorkLife(inputs: FitInputs): FitDimension {
  const desire = inputs.candidate.work_life_priority ?? null;
  const provision = inputs.dso.work_life_balance ?? null;
  if (desire == null) {
    return makeUnscoredDim("work_life", "Work-life balance", {
      detail: "Take the assessment to tell us how much predictable balance matters.",
      detail_employer: "Candidate hasn't rated work-life priority — excluded.",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }
  if (provision == null) {
    return makeUnscoredDim("work_life", "Work-life balance", {
      detail: "This practice hasn't shared its work-life reality yet — excluded.",
      detail_employer: "Add your practice's work-life reality to factor it in.",
      cta_label: null,
      cta_href: null,
    });
  }
  const raw = desireVsProvisionRaw(desire, provision) ?? 0;
  return makeScoredDim(
    "work_life",
    "Work-life balance",
    raw,
    raw >= 100
      ? "This practice's schedule predictability meets what you're looking for."
      : "This practice's schedule may be less predictable than you'd like.",
    raw >= 100
      ? "Practice's work-life reality meets the candidate's priority."
      : "Practice's schedule may be less predictable than the candidate wants."
  );
}

/** private | midsize | large — explicit profile, else derived from size. */
function practiceFeelFromSize(count: number): string {
  if (count <= 1) return "private";
  if (count <= 9) return "midsize";
  return "large";
}

function scorePracticeFeel(inputs: FitInputs): FitDimension {
  const c = token(inputs.candidate.practice_feel);
  // "any" = no preference → no signal to score against.
  if (!c || c === "any") {
    return makeUnscoredDim("practice_feel", "Practice feel", {
      detail:
        "Take the assessment (or pick a practice feel) to factor environment into your match.",
      detail_employer:
        "Candidate has no practice-feel preference — excluded (no penalty).",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }
  const explicit = token(inputs.dso.practice_feel);
  const p = explicit ?? practiceFeelFromSize(inputs.dso.location_count ?? 0);
  const raw = ordinalMatchRaw(c, p, FEEL_SCALE) ?? 0;
  const verdict = raw >= 100 ? "matches" : raw >= 60 ? "is close to" : "differs from";
  const src = explicit ? "" : " (estimated from practice size)";
  return makeScoredDim(
    "practice_feel",
    "Practice feel",
    raw,
    `You thrive in ${FEEL_LABEL[c] ?? c}; this practice has ${FEEL_LABEL[p] ?? p}${src} — ${verdict === "matches" ? "a match" : verdict === "is close to" ? "close" : "a gap"}.`,
    `Practice feel: candidate prefers ${FEEL_LABEL[c] ?? c}; practice is ${FEEL_LABEL[p] ?? p}${src}.`
  );
}

/* ──────────────────────────────────────────────────────────────
 * scoreBenefits — v3.1 (2026-06-05)
 *
 * The candidate picks the benefits that matter most (assessment chips); the
 * job lists the benefits it offers (jobs.benefits — free-text-ish strings).
 * We can't rely on canonical equality (real values look like "401(k) with
 * employer match", "Sign-on bonus available", "health"), so each priority is
 * matched by keyword regex against the job's benefit strings — the same
 * approach the PMS/cert detectors use.
 *
 * raw = share of the candidate's prioritized benefits the job covers. Zero
 * coverage floors at 15 (benefits are negotiable, not a deal-breaker), full
 * coverage = 100. UNSCORED when the candidate set no priorities OR the job
 * lists no benefits — never a penalty.
 * ─────────────────────────────────────────────────────────── */

/** Candidate priority token → keyword matcher run over each job benefit string. */
const BENEFIT_MATCHERS: Record<string, RegExp> = {
  health: /\bhealth\b|medical/i,
  retirement_match: /401\s*\(?k\)?|retirement|employer match|\bira\b/i,
  pto: /\bpto\b|paid time off|paid holidays?|vacation|paid (sick )?leave|time-off/i,
  ce_allowance:
    /\bce\b|continuing education|license renewal|professional dues|membership/i,
  bonus: /bonus|incentive/i,
  loan_repayment: /loan|tuition|student debt/i,
  flex_schedule:
    /flexible schedule|flex|4-?day|four-?day|predictable (practice )?hours|no nights|no weekends|remote|hybrid|work-?life/i,
  partnership: /partnership|equity|ownership|partner track/i,
};

/** Candidate-facing labels for the priority tokens (for the match copy). */
const BENEFIT_PRIORITY_LABEL: Record<string, string> = {
  health: "health insurance",
  retirement_match: "401(k) match",
  pto: "paid time off",
  ce_allowance: "CE allowance",
  bonus: "a bonus",
  loan_repayment: "student-loan help",
  flex_schedule: "a flexible schedule",
  partnership: "an equity / partnership track",
};

function scoreBenefits({ candidate, job }: FitInputs): FitDimension {
  const priorities = (candidate.benefit_priorities ?? [])
    .map((p) => token(p))
    .filter((p): p is string => Boolean(p));
  if (priorities.length === 0) {
    return makeUnscoredDim("benefits", "Benefits", {
      detail:
        "Tell us which benefits matter most (in the assessment) to factor benefits into your match.",
      detail_employer:
        "Candidate hasn't ranked the benefits that matter to them — benefits excluded from their score.",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }

  const jobBenefits = (job.benefits ?? []).filter(
    (b): b is string => typeof b === "string" && b.trim().length > 0
  );
  if (jobBenefits.length === 0) {
    return makeUnscoredDim("benefits", "Benefits", {
      detail:
        "This posting doesn't list benefits — benefits are excluded from the score.",
      detail_employer:
        "Job lists no benefits — benefits excluded. Add them to the posting to factor it in.",
      cta_label: null,
      cta_href: null,
    });
  }

  const matched: string[] = [];
  const missing: string[] = [];
  for (const p of priorities) {
    const re = BENEFIT_MATCHERS[p];
    const hit = re ? jobBenefits.some((b) => re.test(b)) : false;
    (hit ? matched : missing).push(BENEFIT_PRIORITY_LABEL[p] ?? p);
  }

  const coverage = matched.length / priorities.length;
  const raw = matched.length === 0 ? 15 : Math.round(coverage * 100);

  let detail: string;
  let detailEmployer: string;
  if (missing.length === 0) {
    detail = `This practice offers every benefit you prioritized (${matched.join(", ")}).`;
    detailEmployer = `Offers every benefit the candidate prioritized (${matched.join(", ")}).`;
  } else if (matched.length > 0) {
    detail = `Covers ${matched.length} of ${priorities.length} of your priorities (${matched.join(", ")}). Not listed: ${missing.join(", ")}.`;
    detailEmployer = `Covers ${matched.length} of ${priorities.length} of their priorities (${matched.join(", ")}). Not listed: ${missing.join(", ")}.`;
  } else {
    detail = `This posting doesn't list the benefits you prioritized (${missing.join(", ")}) — often negotiable at offer.`;
    detailEmployer = `Posting doesn't list the benefits they prioritized (${missing.join(", ")}) — often negotiable at offer.`;
  }
  return makeScoredDim("benefits", "Benefits", raw, detail, detailEmployer);
}

/* ──────────────────────────────────────────────────────────────
 * scorePatientPopulation — v3.1 (2026-06-05)
 *
 * The candidate picks the patient populations they most enjoy caring for; the
 * practice picks the populations it serves (employer practice profile). Shared
 * canonical vocab (PATIENT_POPULATIONS), so we compare tokens directly.
 *
 * The candidate's "all" answer ("I enjoy all populations") is a no-penalty,
 * NON-discriminating signal — stripped before scoring; if it's the only thing
 * they picked, the dim is UNSCORED (never penalizes). raw = share of the
 * candidate's preferred populations the practice serves; zero overlap floors at
 * 30 (a preference miss, not a deal-breaker). UNSCORED when either side is
 * blank.
 * ─────────────────────────────────────────────────────────── */

const PATIENT_POP_LABEL: Record<string, string> = {
  pediatric: "children / pediatric",
  geriatric: "older adults",
  special_needs: "special-needs patients",
  anxious: "anxious / phobic patients",
  cosmetic: "cosmetic-focused care",
  underserved: "underserved / community health",
};

function scorePatientPopulation({ candidate, dso }: FitInputs): FitDimension {
  // Strip "all" — it's the universal no-signal answer, not a population.
  const cand = (candidate.patient_population_pref ?? [])
    .map((p) => token(p))
    .filter((p): p is string => Boolean(p) && p !== "all");
  if (cand.length === 0) {
    return makeUnscoredDim("patient_population", "Patient population", {
      detail:
        "Tell us which patients you most enjoy caring for (in the assessment) to factor this in.",
      detail_employer:
        "Candidate enjoys all populations (or hasn't said) — patient-population fit excluded (no penalty).",
      cta_label: "Take the assessment",
      cta_href: "/candidate/assessment",
    });
  }

  const practice = (dso.patient_populations ?? [])
    .map((p) => token(p))
    .filter((p): p is string => Boolean(p));
  if (practice.length === 0) {
    return makeUnscoredDim("patient_population", "Patient population", {
      detail:
        "This practice hasn't said which patient populations it serves — excluded for now.",
      detail_employer:
        "Add the patient populations your practice serves to factor it into matches.",
      cta_label: null,
      cta_href: null,
    });
  }

  const matched = cand.filter((p) => practice.includes(p));
  const matchedLabels = matched.map((p) => PATIENT_POP_LABEL[p] ?? p);
  const missingLabels = cand
    .filter((p) => !matched.includes(p))
    .map((p) => PATIENT_POP_LABEL[p] ?? p);
  const raw = matched.length === 0 ? 30 : Math.round((matched.length / cand.length) * 100);

  let detail: string;
  let detailEmployer: string;
  if (matched.length === cand.length) {
    detail = `This practice serves the patients you love working with (${matchedLabels.join(", ")}).`;
    detailEmployer = `Serves the populations the candidate most enjoys (${matchedLabels.join(", ")}).`;
  } else if (matched.length > 0) {
    detail = `Overlap on ${matchedLabels.join(", ")}; less so on ${missingLabels.join(", ")}.`;
    detailEmployer = `Overlaps on ${matchedLabels.join(", ")}; candidate also enjoys ${missingLabels.join(", ")}.`;
  } else {
    detail = `You gravitate to ${missingLabels.join(", ")}; this practice serves a different mix.`;
    detailEmployer = `Candidate gravitates to ${missingLabels.join(", ")}; practice serves a different mix.`;
  }
  return makeScoredDim("patient_population", "Patient population", raw, detail, detailEmployer);
}

export function hashInputs(inputs: FitInputs): string {
  const canonical = {
    // Logic-version stamp — a scoring-logic change with no new input field
    // (e.g. A.4 caps/boosters) still invalidates the cache.
    model_version: MODEL_VERSION,
    candidate: {
      desired_roles: sortedLowercase(inputs.candidate.desired_roles),
      // Phase A.1 — current_title feeds role_fit (fallback role signal),
      // so it must be in the hash or the cache won't invalidate on change.
      current_title: (inputs.candidate.current_title ?? "").trim().toLowerCase(),
      // Phase A.2 — target-market centroids drive distance scoring, so they
      // must be in the hash. Rounded + sorted for a stable fingerprint.
      desired_location_points: (inputs.candidate.desired_location_points ?? [])
        .map((p) => ({ lat: round3(p.lat), lng: round3(p.lng) }))
        .sort((a, b) => (a.lat === b.lat ? a.lng - b.lng : a.lat - b.lat)),
      desired_specialty: sortedLowercase(inputs.candidate.desired_specialty),
      license_states: sortedUpper(inputs.candidate.license_states),
      pms_systems: sortedLowercase(inputs.candidate.pms_systems),
      certifications: sortedLowercase(inputs.candidate.certifications),
      desired_locations: sortedLowercase(inputs.candidate.desired_locations),
      skills: sortedLowercase(inputs.candidate.skills),
      schedule_preferences: sortedSchedule(inputs.candidate.schedule_preferences),
      min_salary: inputs.candidate.min_salary ?? null,
      salary_unit: inputs.candidate.salary_unit ?? null,
      temp_or_perm: inputs.candidate.temp_or_perm ?? null,
      dso_size_preference: inputs.candidate.dso_size_preference ?? null,
      years_experience_dental:
        inputs.candidate.years_experience_dental ?? null,
      // v3 Phase B.1 — culture signals must be hashed so the cache
      // invalidates when the candidate retakes the assessment.
      work_pace: token(inputs.candidate.work_pace),
      autonomy_pref: token(inputs.candidate.autonomy_pref),
      mentorship_pref: token(inputs.candidate.mentorship_pref),
      practice_feel: token(inputs.candidate.practice_feel),
      ce_growth_importance: inputs.candidate.ce_growth_importance ?? null,
      work_life_priority: inputs.candidate.work_life_priority ?? null,
      // Phase B.2 — re-weighting signal; must invalidate cache on change.
      // comp_priorities is ORDERED (rank matters) so it is NOT sorted.
      comp_priority: token(inputs.candidate.comp_priority),
      comp_priorities: (inputs.candidate.comp_priorities ?? []).map((p) =>
        (p ?? "").trim().toLowerCase()
      ),
      // v3.1 — benefits priorities feed the benefits dim; hash so retaking the
      // assessment invalidates the cache.
      benefit_priorities: sortedLowercase(inputs.candidate.benefit_priorities),
      // v3.1 — patient-population preference feeds the patient_population dim.
      patient_population_pref: sortedLowercase(
        inputs.candidate.patient_population_pref
      ),
      // #52 DSOFit — corporate moat signals.
      seniority_level: token(inputs.candidate.seniority_level),
      org_scale_experience: token(inputs.candidate.org_scale_experience),
    },
    job: {
      role_category: inputs.job.role_category,
      // #110 — corporate function drives corporate-track gating + function fit.
      corporate_function:
        canonicalizeCorporateFunction(inputs.job.corporate_function),
      employment_type: inputs.job.employment_type,
      compensation_min: inputs.job.compensation_min ?? null,
      compensation_max: inputs.job.compensation_max ?? null,
      compensation_period: inputs.job.compensation_period ?? null,
      locations: (inputs.job.locations ?? [])
        .map((l) => ({
          state: (l.state ?? "").toUpperCase(),
          city: (l.city ?? "").toLowerCase(),
          // Phase A.2 — coords feed the distance scorer.
          lat: l.latitude == null ? null : round3(l.latitude),
          lng: l.longitude == null ? null : round3(l.longitude),
        }))
        .sort((a, b) =>
          a.state === b.state
            ? a.city.localeCompare(b.city)
            : a.state.localeCompare(b.state)
        ),
      skills: sortedLowercase(inputs.job.skills),
      pms_required: sortedLowercase(inputs.job.pms_required),
      certs_required: sortedLowercase(inputs.job.certs_required),
      specialty: sortedLowercase(inputs.job.specialty),
      min_years_experience: inputs.job.min_years_experience ?? null,
      // v3.1 — job benefits feed the benefits dim; hash so editing the posting
      // invalidates the cache.
      benefits: sortedLowercase(inputs.job.benefits),
      schedule_days: sortedLowercase(inputs.job.schedule_days),
      schedule_evenings: Boolean(inputs.job.schedule_evenings),
      schedule_weekends: Boolean(inputs.job.schedule_weekends),
      // #52 DSOFit — corporate role targets.
      seniority_target: token(inputs.job.seniority_target),
      org_scale_need: token(inputs.job.org_scale_need),
    },
    dso: {
      location_count: inputs.dso.location_count ?? 0,
      // v3 Phase B.1 — practice-profile signals; invalidate the cache when
      // a practice edits its profile.
      practice_pace: token(inputs.dso.practice_pace),
      autonomy_level: token(inputs.dso.autonomy_level),
      mentorship_offered: token(inputs.dso.mentorship_offered),
      practice_feel: token(inputs.dso.practice_feel),
      ce_support: inputs.dso.ce_support ?? null,
      work_life_balance: inputs.dso.work_life_balance ?? null,
      // v3.1 — practice's served populations feed the patient_population dim.
      patient_populations: sortedLowercase(inputs.dso.patient_populations),
    },
  };
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────── */

/** Round to 3 decimal places (~110 m) for stable coord hashing. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Great-circle distance in statute miles between two lat/lng pairs. */
function haversineMiles(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function sortedLowercase(arr: string[] | null | undefined): string[] {
  return [...(arr ?? []).map((s) => s.trim().toLowerCase())].sort();
}

function sortedUpper(arr: string[] | null | undefined): string[] {
  return [...(arr ?? []).map((s) => s.trim().toUpperCase())].sort();
}

function sortedSchedule(
  prefs: CandidateFitInputs["schedule_preferences"] | null | undefined
): Record<string, boolean> {
  const allowed = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
    "evenings",
    "willing_to_relocate",
  ];
  const out: Record<string, boolean> = {};
  for (const k of allowed) {
    out[k] = Boolean((prefs as Record<string, unknown> | null | undefined)?.[k]);
  }
  return out;
}

function prettyEmployment(type: string): string {
  switch (type) {
    case "full_time":
      return "full time";
    case "part_time":
      return "part time";
    case "contract":
      return "contract";
    case "prn":
      return "PRN";
    case "locum":
      return "locum";
    default:
      return type.replace(/_/g, " ");
  }
}

function formatComp(
  amount: number,
  period: "hourly" | "yearly" | "per_visit" | "per_day" | null
): string {
  if (period === "hourly") return `$${amount}/hr`;
  if (period === "yearly") return `$${amount.toLocaleString()}/yr`;
  if (period === "per_day") return `$${amount}/day`;
  if (period === "per_visit") return `$${amount}/visit`;
  return `$${amount.toLocaleString()}`;
}

// Re-export to keep callers' imports tidy.
export type { FitInputs, FitResult } from "./types";
