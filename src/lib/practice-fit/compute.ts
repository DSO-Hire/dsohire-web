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
import type {
  CandidateFitInputs,
  FitDimension,
  FitDimensionKey,
  FitInputs,
  FitResult,
} from "./types";

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
// Phase A.1 (2026-06-03) — role_fit (15) is added as a scored dimension so
// an EXACT role match (100) outranks a merely ADJACENT one (60). The 15
// points come from compensation (25→20), specialty (15→10) and
// employment_type (10→5). Unrelated pairs never reach scoring — the
// adjacency gate drops them to null upstream.
const WEIGHTS: Record<FitDimensionKey, number> = {
  role_fit: 15,
  compensation: 20,
  location: 20,
  specialty: 10,
  skills: 10,
  years_experience: 10,
  employment_type: 5,
  dso_size: 5,
  schedule_overlap: 5,
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
  const jobRole = canonicalizeRoleCategory(inputs.job.role_category);
  if (jobRole === "other") return true; // unmappable job role doesn't filter

  // v2 — role signal is desired_roles, falling back to the resume-derived
  // current_title so "open to anything" candidates are still gated against
  // their actual role.
  const candidateRoles = deriveCandidateRoles(
    inputs.candidate.desired_roles,
    inputs.candidate.current_title
  );
  if (candidateRoles.length === 0) return true; // genuinely no role signal

  // Only an outright UNRELATED relation drops the pair. Exact + adjacent
  // both stay in (and are differentiated by the role_fit dimension).
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
    specialty: scoreSpecialty(inputs),
    skills: scoreSkills(inputs),
    years_experience: scoreYearsExperience(inputs),
    employment_type: scoreEmploymentType(inputs),
    dso_size: scoreDsoSize(inputs),
    schedule_overlap: scoreScheduleOverlap(inputs),
  };

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
function scoreRoleFit({ candidate, job }: FitInputs): FitDimension {
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
      cta_href: "/candidate/profile#section-role-specialty",
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
      cta_href: "/candidate/profile#section-job-preferences",
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
      cta_href: "/candidate/profile#section-licenses",
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
      cta_href: "/candidate/profile#section-role-specialty",
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
      cta_label: "Set preference",
      cta_href: "/candidate/profile#section-role-specialty",
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
      cta_label: "Set preference",
      cta_href: "/candidate/profile#section-job-preferences",
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
      cta_href: "/candidate/profile#section-job-preferences",
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

export function hashInputs(inputs: FitInputs): string {
  const canonical = {
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
      desired_locations: sortedLowercase(inputs.candidate.desired_locations),
      skills: sortedLowercase(inputs.candidate.skills),
      schedule_preferences: sortedSchedule(inputs.candidate.schedule_preferences),
      min_salary: inputs.candidate.min_salary ?? null,
      salary_unit: inputs.candidate.salary_unit ?? null,
      temp_or_perm: inputs.candidate.temp_or_perm ?? null,
      dso_size_preference: inputs.candidate.dso_size_preference ?? null,
      years_experience_dental:
        inputs.candidate.years_experience_dental ?? null,
    },
    job: {
      role_category: inputs.job.role_category,
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
      specialty: sortedLowercase(inputs.job.specialty),
      min_years_experience: inputs.job.min_years_experience ?? null,
      schedule_days: sortedLowercase(inputs.job.schedule_days),
      schedule_evenings: Boolean(inputs.job.schedule_evenings),
      schedule_weekends: Boolean(inputs.job.schedule_weekends),
    },
    dso: {
      location_count: inputs.dso.location_count ?? 0,
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
