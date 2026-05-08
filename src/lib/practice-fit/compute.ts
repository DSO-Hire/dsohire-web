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
import { canonicalizeRoleCategory } from "./role-canonicalize";
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

const WEIGHTS: Record<FitDimensionKey, number> = {
  compensation: 25,
  location: 20,
  specialty: 15,
  skills: 15,
  years_experience: 10,
  employment_type: 10,
  dso_size: 5,
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
  const desired = (inputs.candidate.desired_roles ?? [])
    .map(canonicalizeRoleCategory)
    .filter((r) => r !== "other"); // unmappable candidate prefs don't filter

  if (desired.length === 0) return true; // candidate is open to anything

  const jobRole = canonicalizeRoleCategory(inputs.job.role_category);
  if (jobRole === "other") return true; // unmappable job role doesn't filter

  return desired.includes(jobRole);
}

/* ──────────────────────────────────────────────────────────────
 * Compute — assumes role filter has already passed.
 * ─────────────────────────────────────────────────────────── */

export function computePracticeFit(inputs: FitInputs): FitResult | null {
  if (!isRoleApplicable(inputs)) return null;

  const dims: Record<FitDimensionKey, FitDimension> = {
    compensation: scoreCompensation(inputs),
    location: scoreLocation(inputs),
    specialty: scoreSpecialty(inputs),
    skills: scoreSkills(inputs),
    years_experience: scoreYearsExperience(inputs),
    employment_type: scoreEmploymentType(inputs),
    dso_size: scoreDsoSize(inputs),
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

function makeScoredDim(
  key: FitDimensionKey,
  label: string,
  raw: number,
  detail: string
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
    detail_employer: detail, // scored dims read identically to both audiences
    cta_href: null,
    cta_label: null,
    cta_inline: false,
  };
}

function scoreCompensation({ candidate, job }: FitInputs): FitDimension {
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
      cta_href: "/candidate/profile#compensation",
      cta_inline: true,
    });
  }
  if (job.compensation_min == null) {
    return makeUnscoredDim("compensation", "Compensation", {
      detail:
        "This job didn't post a compensation range — comp is excluded from the score.",
      detail_employer:
        "Job has no compensation range posted — comp excluded from the score.",
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

  const jobTop = job.compensation_max ?? job.compensation_min;
  let raw: number;
  let detail: string;
  if (jobTop >= candidate.min_salary) {
    const ratio = jobTop / candidate.min_salary;
    raw = ratio >= 1.2 ? 100 : 80 + Math.round((ratio - 1) * 100);
    detail = `Job's range covers your minimum (${formatComp(
      jobTop,
      job.compensation_period
    )}+).`;
  } else {
    const shortfall = (candidate.min_salary - jobTop) / candidate.min_salary;
    raw = Math.max(0, Math.round(50 - shortfall * 100));
    detail = `Job ceiling (${formatComp(
      jobTop,
      job.compensation_period
    )}) below your min (${formatComp(
      candidate.min_salary,
      candidate.salary_unit
    )}).`;
  }
  return makeScoredDim("compensation", "Compensation", raw, detail);
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
  // desired locations — exclude with a CTA.
  if (
    candidateStates.size === 0 &&
    (candidate.desired_locations ?? []).length === 0
  ) {
    return makeUnscoredDim("location", "Location", {
      detail:
        "Add your license state(s) and desired locations to factor location into your match.",
      detail_employer:
        "Candidate hasn't listed license states or desired locations — location excluded from their score.",
      cta_label: "Add license + locations",
      cta_href: "/candidate/profile#license",
    });
  }

  const stateMatch = [...jobStates].some((s) => candidateStates.has(s));

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

  if (stateMatch && cityMatch) {
    raw = 100;
    detail = "Licensed in this state and the city is on your wish list.";
  } else if (stateMatch) {
    raw = 80;
    detail = "Licensed in this state.";
  } else if (cityMatch) {
    raw = 65;
    detail = "City is on your wish list — confirm licensure for this state.";
  } else if (candidate.schedule_preferences?.willing_to_relocate) {
    raw = 40;
    detail = "Outside your states, but you're open to relocation.";
  } else {
    raw = 10;
    detail = "Outside your licensed states / desired locations.";
  }
  return makeScoredDim("location", "Location", raw, detail);
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
      cta_href: "/candidate/profile#specialty",
    });
  }

  const overlap = jobSpecs.filter((s) => candSpecs.includes(s));
  let raw: number;
  let detail: string;
  if (overlap.length === jobSpecs.length) {
    raw = 100;
    detail = `Your specialties cover everything this posting calls for (${overlap.join(", ")}).`;
  } else if (overlap.length > 0) {
    raw = Math.round((overlap.length / jobSpecs.length) * 100);
    detail = `${overlap.length} of ${jobSpecs.length} specialties match (${overlap.join(", ")}).`;
  } else {
    raw = 15;
    detail = `Your specialties (${candSpecs.join(", ")}) don't overlap with this posting (${jobSpecs.join(", ")}).`;
  }
  return makeScoredDim("specialty", "Specialty", raw, detail);
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
      cta_href: "/candidate/profile#skills",
    });
  }

  const matched = jobSkills.filter((s) => candidateSkills.has(s));
  const ratio = matched.length / jobSkills.length;
  return makeScoredDim(
    "skills",
    "Skills",
    Math.round(ratio * 100),
    `${matched.length} of ${jobSkills.length} skills on the post match yours.`
  );
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
      cta_href: "/candidate/profile#experience",
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
      cta_href: "/candidate/profile#employment",
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
      cta_href: "/candidate/profile#dso-size",
      cta_inline: true,
    });
  }

  let raw: number;
  let detail: string;
  if (pref === "any" || pref === actual) {
    raw = 100;
    detail = `${count}-practice DSO matches your preference.`;
  } else {
    const order = ["small", "mid", "large"];
    const distance = Math.abs(order.indexOf(pref) - order.indexOf(actual));
    raw = distance === 1 ? 60 : 30;
    detail = `You prefer ${pref}-size DSOs — this is ${actual} (${count} practices).`;
  }
  return makeScoredDim("dso_size", "DSO size", raw, detail);
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
        }))
        .sort((a, b) =>
          a.state === b.state
            ? a.city.localeCompare(b.city)
            : a.state.localeCompare(b.state)
        ),
      skills: sortedLowercase(inputs.job.skills),
      specialty: sortedLowercase(inputs.job.specialty),
      min_years_experience: inputs.job.min_years_experience ?? null,
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
