/**
 * Practice Fit scoring engine (Phase 5D v0).
 *
 * Pure structured-feature scoring across 6 dimensions. No AI, no
 * embeddings — just deterministic math over the candidate's prefs +
 * the job's posting + the DSO's size. Locked decision 2026-05-07:
 * structured-features v0 ships first, AI-narrative layers on later.
 *
 * Weights sum to 100. Each dimension's `raw` is 0-100; `contribution`
 * is `(weight * raw) / 100`. Final `score` is the sum of contributions
 * (0-100). The bucket is derived in src/lib/practice-fit/buckets.ts.
 *
 * Determinism: the same inputs always produce the same hash + score.
 * The cache layer (get-or-compute.ts) uses `input_hash` to decide
 * whether a stored score is still valid.
 */

import { createHash } from "crypto";
import { scoreToBucket } from "./buckets";
import type {
  CandidateFitInputs,
  FitDimension,
  FitDimensionKey,
  FitInputs,
  FitResult,
} from "./types";

/* ──────────────────────────────────────────────────────────────
 * Weights (must sum to 100)
 * ─────────────────────────────────────────────────────────── */

const WEIGHTS: Record<FitDimensionKey, number> = {
  role: 25,
  compensation: 25,
  location: 20,
  skills: 15,
  employment_type: 10,
  dso_size: 5,
};

/* ──────────────────────────────────────────────────────────────
 * Compute
 * ─────────────────────────────────────────────────────────── */

export function computePracticeFit(inputs: FitInputs): FitResult {
  const dims: Record<FitDimensionKey, FitDimension> = {
    role: scoreRole(inputs),
    compensation: scoreCompensation(inputs),
    location: scoreLocation(inputs),
    skills: scoreSkills(inputs),
    employment_type: scoreEmploymentType(inputs),
    dso_size: scoreDsoSize(inputs),
  };

  // Sum contributions for the final score.
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        Object.values(dims).reduce((acc, d) => acc + d.contribution, 0)
      )
    )
  );

  // Top 3 by contribution desc. Ties broken by weight (more impactful
  // dimension wins) then by key alphabetical for stability.
  const top_factors = (Object.entries(dims) as Array<
    [FitDimensionKey, FitDimension]
  >)
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
    input_hash: hashInputs(inputs),
  };
}

/* ──────────────────────────────────────────────────────────────
 * Dimension scorers
 * ─────────────────────────────────────────────────────────── */

function scoreRole({ candidate, job }: FitInputs): FitDimension {
  const weight = WEIGHTS.role;
  const desired = (candidate.desired_roles ?? []).map((r) => r.toLowerCase());
  const jobRole = (job.role_category ?? "").toLowerCase();

  let raw = 0;
  let detail: string;

  if (desired.length === 0) {
    raw = 50;
    detail = "Candidate hasn't set desired roles — neutral signal.";
  } else if (desired.includes(jobRole)) {
    raw = 100;
    detail = `Wants this role (${prettyRole(jobRole)}).`;
  } else {
    raw = 0;
    detail = `Wants ${desired
      .map(prettyRole)
      .join(", ")} — this role is ${prettyRole(jobRole)}.`;
  }

  return {
    weight,
    raw,
    contribution: (weight * raw) / 100,
    label: "Role",
    detail,
  };
}

function scoreCompensation({ candidate, job }: FitInputs): FitDimension {
  const weight = WEIGHTS.compensation;
  let raw: number;
  let detail: string;

  if (candidate.min_salary == null || job.compensation_min == null) {
    raw = 50;
    detail =
      "Compensation comparison unavailable — at least one side hasn't set a number.";
  } else if (candidate.salary_unit !== job.compensation_period) {
    // Different units — hard to compare without conversion. Lean
    // neutral; a future sub-phase normalizes hourly ↔ yearly.
    raw = 50;
    detail = "Comp units don't match (hourly vs yearly) — needs normalization.";
  } else {
    const jobTop = job.compensation_max ?? job.compensation_min;
    if (jobTop >= candidate.min_salary) {
      // Job's ceiling meets or beats candidate's floor.
      const ratio = jobTop / candidate.min_salary;
      raw = ratio >= 1.2 ? 100 : 80 + Math.round((ratio - 1) * 100);
      detail = `Job's range covers your minimum (${formatComp(
        jobTop,
        job.compensation_period
      )}+).`;
    } else {
      // Job's ceiling is below candidate's minimum — bad fit.
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
  }

  raw = Math.max(0, Math.min(100, raw));
  return {
    weight,
    raw,
    contribution: (weight * raw) / 100,
    label: "Compensation",
    detail,
  };
}

function scoreLocation({ candidate, job }: FitInputs): FitDimension {
  const weight = WEIGHTS.location;
  const jobStates = new Set(
    (job.locations ?? [])
      .map((l) => (l.state ?? "").toUpperCase())
      .filter((s) => s.length > 0)
  );
  const candidateStates = new Set(
    (candidate.license_states ?? []).map((s) => s.toUpperCase())
  );

  let raw: number;
  let detail: string;

  const stateMatch =
    jobStates.size > 0 &&
    [...jobStates].some((s) => candidateStates.has(s));

  // Substring match on desired_locations (city + state strings) for a
  // soft city-level signal — avoids over-engineering geo distance.
  const jobCityStateLabels = (job.locations ?? []).map((l) =>
    [l.city, l.state].filter(Boolean).join(", ").toLowerCase()
  );
  const cityMatch = (candidate.desired_locations ?? []).some((wanted) => {
    const w = wanted.toLowerCase();
    return jobCityStateLabels.some(
      (loc) => loc.includes(w) || w.includes(loc)
    );
  });

  if (jobStates.size === 0) {
    raw = 50;
    detail = "Job has no locations on file — neutral.";
  } else if (stateMatch && cityMatch) {
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

  return {
    weight,
    raw,
    contribution: (weight * raw) / 100,
    label: "Location",
    detail,
  };
}

function scoreSkills({ candidate, job }: FitInputs): FitDimension {
  const weight = WEIGHTS.skills;
  const candidateSkills = new Set(
    (candidate.skills ?? []).map((s) => s.toLowerCase())
  );
  const jobSkills = (job.skills ?? []).map((s) => s.toLowerCase());

  let raw: number;
  let detail: string;

  if (jobSkills.length === 0) {
    raw = 60;
    detail = "Job didn't list specific skills — neutral.";
  } else {
    const matched = jobSkills.filter((s) => candidateSkills.has(s));
    const ratio = matched.length / jobSkills.length;
    raw = Math.round(ratio * 100);
    detail = `${matched.length} of ${jobSkills.length} skills on the post match yours.`;
  }

  return {
    weight,
    raw,
    contribution: (weight * raw) / 100,
    label: "Skills",
    detail,
  };
}

function scoreEmploymentType({ candidate, job }: FitInputs): FitDimension {
  const weight = WEIGHTS.employment_type;
  const jobType = (job.employment_type ?? "").toLowerCase();
  const candPref = candidate.temp_or_perm ?? "either";

  let raw: number;
  let detail: string;

  // Map candidate's temp/perm to a set of acceptable job employment_type
  // values.
  const tempLike = new Set(["contract", "prn", "locum", "part_time"]);
  const permLike = new Set(["full_time"]);

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

  return {
    weight,
    raw,
    contribution: (weight * raw) / 100,
    label: "Employment type",
    detail,
  };
}

function scoreDsoSize({ candidate, dso }: FitInputs): FitDimension {
  const weight = WEIGHTS.dso_size;
  const pref = candidate.dso_size_preference ?? "any";
  const count = Math.max(0, dso.location_count ?? 0);

  // Bucket the actual DSO size by location count.
  let actual: "small" | "mid" | "large";
  if (count <= 9) actual = "small";
  else if (count <= 49) actual = "mid";
  else actual = "large";

  let raw: number;
  let detail: string;

  if (pref === "any" || pref === actual) {
    raw = 100;
    detail = `${count}-practice DSO matches your preference.`;
  } else {
    // Adjacent buckets get partial credit (e.g. wants small, DSO is mid).
    const order = ["small", "mid", "large"];
    const distance = Math.abs(order.indexOf(pref) - order.indexOf(actual));
    raw = distance === 1 ? 60 : 30;
    detail = `You prefer ${pref}-size DSOs — this is ${actual} (${count} practices).`;
  }

  return {
    weight,
    raw,
    contribution: (weight * raw) / 100,
    label: "DSO size",
    detail,
  };
}

/* ──────────────────────────────────────────────────────────────
 * Hashing — input fingerprint for the cache layer
 *
 * We hash a CANONICAL JSON snapshot of just the inputs the scoring
 * function consumes. Sort keys, normalize arrays, drop missing/null
 * shape so a candidate going from `null` to `[]` doesn't bust cache.
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

function prettyRole(role: string): string {
  switch (role) {
    case "associate_dentist":
      return "Associate Dentist";
    case "specialist_dentist":
      return "Specialist Dentist";
    case "hygienist":
      return "Hygienist";
    case "assistant":
      return "Dental Assistant";
    case "front_desk":
      return "Front Desk";
    case "office_manager":
      return "Office Manager";
    case "regional_manager":
      return "Regional Manager";
    case "dso_corporate":
      return "DSO Corporate";
    case "dental_hygienist":
      return "Hygienist";
    case "dental_assistant":
      return "Dental Assistant";
    case "front_office":
      return "Front Office";
    case "specialist":
      return "Specialist";
    case "dentist":
      return "Dentist";
    default:
      return role.replace(/_/g, " ");
  }
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
