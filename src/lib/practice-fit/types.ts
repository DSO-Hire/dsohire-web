/**
 * Practice Fit shape definitions (Phase 5D v0).
 *
 * The compute function and the cache layer share these types so the
 * stored row's `dimensions` jsonb can be deserialized into the same
 * structure that the in-memory compute returns.
 */

export type FitBucket = "excellent" | "strong" | "solid" | "light" | "low";

export type FitDimensionKey =
  | "role"
  | "compensation"
  | "location"
  | "skills"
  | "employment_type"
  | "dso_size";

export interface FitDimension {
  /** Maximum points this dimension can contribute to the overall 0-100 score. */
  weight: number;
  /** Raw fit on this dimension, 0-100. */
  raw: number;
  /** weight * raw / 100 — what this dimension contributed to the final score. */
  contribution: number;
  /** Short label for the dimension (rendered in WhyThisMatch). */
  label: string;
  /** One-line detail explaining the fit on this dimension. */
  detail: string;
}

export interface FitResult {
  score: number;
  bucket: FitBucket;
  dimensions: Record<FitDimensionKey, FitDimension>;
  /** Top 3 dimension keys, ordered by contribution desc. */
  top_factors: FitDimensionKey[];
  /** SHA-256 hex of the canonical input snapshot. */
  input_hash: string;
}

/* ──────────────────────────────────────────────────────────────
 * Inputs to the compute function.
 *
 * Kept narrow on purpose — only the fields actually consumed by the
 * scoring math. Callers project from the larger candidates / jobs /
 * dso rows into these shapes before calling computePracticeFit().
 * ─────────────────────────────────────────────────────────── */

export interface CandidateFitInputs {
  desired_roles: string[];
  desired_specialty: string[];
  license_states: string[];
  desired_locations: string[];
  skills: string[];
  schedule_preferences: {
    mon?: boolean;
    tue?: boolean;
    wed?: boolean;
    thu?: boolean;
    fri?: boolean;
    sat?: boolean;
    sun?: boolean;
    evenings?: boolean;
    willing_to_relocate?: boolean;
  };
  min_salary: number | null;
  salary_unit: "hourly" | "yearly" | "per_visit" | "per_day" | null;
  temp_or_perm: "temp" | "perm" | "either" | null;
  dso_size_preference: "small" | "mid" | "large" | "any" | null;
}

export interface JobFitInputs {
  role_category: string;
  employment_type: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: "hourly" | "yearly" | "per_visit" | "per_day" | null;
  /** From job_locations join — { state }, may have multiple. */
  locations: Array<{ state: string | null; city: string | null }>;
  /** From job_skills join. v1 schema doesn't distinguish required vs preferred. */
  skills: string[];
}

export interface DsoFitInputs {
  /** Total practice / location count for the DSO. Drives the DSO-size dimension. */
  location_count: number;
}

export interface FitInputs {
  candidate: CandidateFitInputs;
  job: JobFitInputs;
  dso: DsoFitInputs;
}
