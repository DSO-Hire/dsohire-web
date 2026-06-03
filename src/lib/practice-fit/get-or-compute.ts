/**
 * Cache-aware Practice Fit getter (Phase 5D v0).
 *
 * Reads `practice_fit_scores`. If the row is missing, has a stale
 * `input_hash`, or is older than 7 days, we recompute via the
 * structured-feature engine and upsert (service-role).
 *
 * Two surfaces:
 *   • getPracticeFit(candidateId, jobId) — single pair
 *   • getPracticeFitForJob(jobId, candidateIds[]) — bulk for kanban
 *
 * RLS handles read access; the compute path uses the service-role
 * client for writes since users never INSERT directly.
 *
 * Consent: this function does NOT short-circuit on
 * `candidates.practice_fit_consent`. The candidate sees their own
 * score regardless (it's their own data); the employer-side display
 * is gated by RLS — if consent is 'off', the SELECT returns 0 rows.
 * Callers can prefilter by consent if they want to skip the compute
 * cost entirely on the candidate's behalf, but the engine itself is
 * audience-agnostic.
 */

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { computePracticeFit, hashInputs } from "./compute";
import { scoreToBucket } from "./buckets";
import {
  parsePlacePoints,
  resolveDesiredLocationPoints,
} from "@/lib/geocoding/place-cache";
import { PMS_SYSTEMS } from "@/lib/candidate/canonical-lists";
import type { FitInputs, FitResult } from "./types";

/**
 * Detect canonical PMS names mentioned in a job's free text (title +
 * requirements + description). The job side has no structured PMS field, so
 * this is how the pms_fluency dimension learns what the practice runs.
 * Word-boundary matched to avoid short names (e.g. "Adit") false-matching
 * inside other words.
 */
function detectJobPms(...textParts: Array<string | null | undefined>): string[] {
  const text = textParts.filter(Boolean).join("  ");
  if (!text) return [];
  return PMS_SYSTEMS.map((p) => p.value).filter((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}

const STALE_AFTER_DAYS = 7;

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * One-pair getter. Reads RLS-scoped, recomputes if needed via service
 * role, returns the canonical FitResult shape.
 *
 * Returns `null` when:
 *   • the candidate or job doesn't exist
 *   • a non-recoverable error happens during compute
 *
 * Doesn't throw — callers should treat null as "no fit available."
 */
export async function getPracticeFit(
  candidateId: string,
  jobId: string
): Promise<FitResult | null> {
  if (!candidateId || !jobId) return null;
  const supabase = await createSupabaseServerClient();

  // Read-through cache. RLS scopes which rows the user can see.
  const { data: existing } = await supabase
    .from("practice_fit_scores")
    .select("score, bucket, dimensions, top_factors, input_hash, computed_at")
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId)
    .maybeSingle();

  // Pull inputs for hash comparison — even on a cache hit we need to
  // compare the candidate / job / dso current state against the
  // stored hash.
  const inputs = await loadInputs(supabase, candidateId, jobId);
  if (!inputs) return null;

  const currentHash = hashInputs(inputs);

  if (existing && isFresh(existing.computed_at as string)) {
    const storedHash = (existing as Record<string, unknown>).input_hash as string;
    if (storedHash === currentHash) {
      return rowToResult(existing as Record<string, unknown>);
    }
  }

  // Cache miss / stale / hash drift — recompute.
  const result = computePracticeFit(inputs);
  if (result === null) {
    // v1.1 — role filter rejected the pair. Delete any stale row so a
    // legacy v0 score doesn't keep showing on a now-filtered pair.
    await deleteScore(candidateId, jobId);
    return null;
  }
  await upsertScore(candidateId, jobId, result);
  return result;
}

/**
 * Bulk getter — for the kanban / applications list where one job has
 * N candidates. Returns a Map keyed by candidate_id.
 *
 * Read pulls all rows in one query; only stale / missing pairs go
 * through compute + upsert.
 */
export async function getPracticeFitForJob(
  jobId: string,
  candidateIds: string[]
): Promise<Map<string, FitResult>> {
  const out = new Map<string, FitResult>();
  if (!jobId || candidateIds.length === 0) return out;

  const supabase = await createSupabaseServerClient();

  const { data: rows } = await supabase
    .from("practice_fit_scores")
    .select(
      "candidate_id, score, bucket, dimensions, top_factors, input_hash, computed_at"
    )
    .eq("job_id", jobId)
    .in("candidate_id", candidateIds);

  const byCandidate = new Map<string, Record<string, unknown>>();
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    byCandidate.set(r.candidate_id as string, r);
  }

  // Pull job + dso once.
  const jobAndDso = await loadJobAndDso(supabase, jobId);
  if (!jobAndDso) return out;

  for (const candidateId of candidateIds) {
    const cached = byCandidate.get(candidateId);
    const candidateInputs = await loadCandidateInputs(supabase, candidateId);
    if (!candidateInputs) continue;

    const inputs: FitInputs = {
      candidate: candidateInputs,
      job: jobAndDso.job,
      dso: jobAndDso.dso,
    };
    const currentHash = hashInputs(inputs);

    if (cached && isFresh(cached.computed_at as string)) {
      if ((cached.input_hash as string) === currentHash) {
        out.set(candidateId, rowToResult(cached));
        continue;
      }
    }

    const result = computePracticeFit(inputs);
    if (result === null) {
      // Role-filtered — make sure no stale row hangs around; skip
      // adding to the result map (caller treats as "no fit").
      await deleteScore(candidateId, jobId);
      continue;
    }
    await upsertScore(candidateId, jobId, result);
    out.set(candidateId, result);
  }

  return out;
}

/* ──────────────────────────────────────────────────────────────
 * Input loaders
 * ─────────────────────────────────────────────────────────── */

async function loadInputs(
  supabase: SupabaseServerClient,
  candidateId: string,
  jobId: string
): Promise<FitInputs | null> {
  const [candidate, jobAndDso] = await Promise.all([
    loadCandidateInputs(supabase, candidateId),
    loadJobAndDso(supabase, jobId),
  ]);
  if (!candidate || !jobAndDso) return null;
  return {
    candidate,
    job: jobAndDso.job,
    dso: jobAndDso.dso,
  };
}

async function loadCandidateInputs(
  supabase: SupabaseServerClient,
  candidateId: string
): Promise<FitInputs["candidate"] | null> {
  const { data: c } = await supabase
    .from("candidates")
    .select(
      "desired_roles, current_title, desired_specialty, license_states, desired_locations, desired_location_points, pms_systems, skills, schedule_preferences, min_salary, salary_unit, temp_or_perm, dso_size_preference, years_experience_dental"
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (!c) return null;
  const r = c as Record<string, unknown>;

  // Phase A.2 — resolve the candidate's desired markets to centroids,
  // reusing stored points and geocoding only new ones. Persist back when
  // the set changed so we geocode each market at most once.
  const desiredLocations = ((r.desired_locations as string[] | null) ?? []) as string[];
  const { points, changed } = await resolveDesiredLocationPoints(
    desiredLocations,
    parsePlacePoints(r.desired_location_points)
  );
  if (changed) {
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin
      .from("candidates")
      .update({
        // Inline literals (not the PlacePoint interface) so the value is
        // assignable to the jsonb column's Json type.
        desired_location_points: points.map((p) => ({
          label: p.label,
          lat: p.lat,
          lng: p.lng,
        })),
      })
      .eq("id", candidateId);
    if (error) {
      console.error("[practice-fit] desired_location_points persist failed:", error);
    }
  }

  return {
    desired_roles: ((r.desired_roles as string[] | null) ?? []) as string[],
    current_title: (r.current_title as string | null) ?? null,
    desired_specialty: ((r.desired_specialty as string[] | null) ?? []) as string[],
    license_states: ((r.license_states as string[] | null) ?? []) as string[],
    desired_locations: desiredLocations,
    desired_location_points: points.map((p) => ({ lat: p.lat, lng: p.lng })),
    pms_systems: ((r.pms_systems as string[] | null) ?? []) as string[],
    skills: ((r.skills as string[] | null) ?? []) as string[],
    schedule_preferences:
      (r.schedule_preferences as FitInputs["candidate"]["schedule_preferences"]) ??
      {},
    min_salary: (r.min_salary as number | null) ?? null,
    salary_unit:
      (r.salary_unit as FitInputs["candidate"]["salary_unit"]) ?? null,
    temp_or_perm:
      (r.temp_or_perm as FitInputs["candidate"]["temp_or_perm"]) ?? null,
    dso_size_preference:
      (r.dso_size_preference as FitInputs["candidate"]["dso_size_preference"]) ??
      null,
    years_experience_dental:
      (r.years_experience_dental as number | null) ?? null,
  };
}

async function loadJobAndDso(
  supabase: SupabaseServerClient,
  jobId: string
): Promise<{ job: FitInputs["job"]; dso: FitInputs["dso"] } | null> {
  const { data: j } = await supabase
    .from("jobs")
    .select(
      `id, dso_id, role_category, employment_type, title, requirements, description,
       compensation_min, compensation_max, compensation_period,
       compensation_type,
       specialty, min_years_experience,
       schedule_days, schedule_evenings, schedule_weekends,
       job_locations(location:dso_locations(city, state, latitude, longitude)),
       job_skills(skill)`
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!j) return null;
  const r = j as Record<string, unknown>;
  const dsoId = r.dso_id as string;

  const locationsJoin = (r.job_locations ?? []) as Array<{
    location: {
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
  }>;
  const locations = locationsJoin
    .map((row) => row.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const skillsJoin = (r.job_skills ?? []) as Array<{ skill: string | null }>;
  const skills = skillsJoin
    .map((s) => s.skill)
    .filter((s): s is string => Boolean(s));

  // DSO location count for the size dimension.
  const { count: locationCount } = await supabase
    .from("dso_locations")
    .select("id", { count: "exact", head: true })
    .eq("dso_id", dsoId);

  return {
    job: {
      role_category: (r.role_category as string) ?? "other",
      employment_type: (r.employment_type as string) ?? "full_time",
      compensation_type:
        (r.compensation_type as FitInputs["job"]["compensation_type"]) ??
        "range",
      compensation_min: (r.compensation_min as number | null) ?? null,
      compensation_max: (r.compensation_max as number | null) ?? null,
      compensation_period:
        (r.compensation_period as FitInputs["job"]["compensation_period"]) ??
        null,
      locations,
      skills,
      // Phase A.3 — PMS need detected from the posting text.
      pms_required: detectJobPms(
        r.title as string | null,
        r.requirements as string | null,
        r.description as string | null
      ),
      specialty: ((r.specialty as string[] | null) ?? []) as string[],
      min_years_experience:
        (r.min_years_experience as number | null) ?? null,
      schedule_days: ((r.schedule_days as string[] | null) ?? []) as string[],
      schedule_evenings: Boolean(r.schedule_evenings),
      schedule_weekends: Boolean(r.schedule_weekends),
    },
    dso: {
      location_count: locationCount ?? 0,
    },
  };
}

/* ──────────────────────────────────────────────────────────────
 * Cache write
 * ─────────────────────────────────────────────────────────── */

async function upsertScore(
  candidateId: string,
  jobId: string,
  result: FitResult
): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin.from("practice_fit_scores").upsert(
    {
      candidate_id: candidateId,
      job_id: jobId,
      score: result.score,
      bucket: result.bucket,
      dimensions: result.dimensions,
      top_factors: result.top_factors,
      input_hash: result.input_hash,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "candidate_id,job_id" }
  );
  if (error) {
    console.error("[practice-fit] upsert failed:", error);
  }
}

/**
 * v1.1 — delete a stale score row when the role filter newly rejects
 * a pair that previously had a v0 score. Idempotent (no-op if the row
 * doesn't exist), so safe to call on every filtered compute.
 */
async function deleteScore(
  candidateId: string,
  jobId: string
): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("practice_fit_scores")
    .delete()
    .eq("candidate_id", candidateId)
    .eq("job_id", jobId);
  if (error) {
    console.error("[practice-fit] delete failed:", error);
  }
}

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────── */

function isFresh(computedAtIso: string): boolean {
  const computed = new Date(computedAtIso).getTime();
  const ageMs = Date.now() - computed;
  return ageMs < STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

function rowToResult(row: Record<string, unknown>): FitResult {
  const dims = row.dimensions as FitResult["dimensions"];
  // Derive coverage from the stored dimensions rather than persisting
  // it as a separate column. The dims JSON already carries the per-
  // dim weight + scored flag we need.
  let scored_weight = 0;
  let total_weight = 0;
  let scored_count = 0;
  let total_count = 0;
  for (const d of Object.values(dims)) {
    total_weight += d.weight;
    total_count += 1;
    if (d.scored) {
      scored_weight += d.weight;
      scored_count += 1;
    }
  }
  return {
    score: row.score as number,
    bucket: scoreToBucket(row.score as number),
    dimensions: dims,
    top_factors: row.top_factors as FitResult["top_factors"],
    coverage: { scored_weight, total_weight, scored_count, total_count },
    input_hash: row.input_hash as string,
  };
}
