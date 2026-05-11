/**
 * Public Hiring Report aggregations (Phase 5C / E6.14 + E6.15, shipped 2026-05-11).
 *
 * Powers the public /dental-hiring-report page. All reads go through
 * the service-role client because the page is public and shouldn't
 * depend on a Supabase auth session. The aggregates are
 * anonymized-by-construction (median + percentile bands) — no
 * individual employer's data is ever surfaced.
 *
 * Sample-size floor: any aggregate computed from fewer than
 * `MIN_SAMPLE_SIZE` rows returns null. The page then shows a
 * "data accruing" placeholder for that slice instead of misleading
 * single-data-point numbers. As the platform scales, more slices
 * cross the threshold and the page deepens organically — no manual
 * publish step.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const MIN_SAMPLE_SIZE = 5;

const ROLE_LABEL: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

const ROLE_DISPLAY_ORDER: ReadonlyArray<string> = [
  "dentist",
  "dental_hygienist",
  "dental_assistant",
  "office_manager",
  "front_office",
  "regional_manager",
  "specialist",
  "other",
];

export interface RoleCompBand {
  role: string;
  label: string;
  period: "hourly" | "daily" | "annual";
  sample_size: number;
  p25: number;
  p50: number; // median
  p75: number;
}

export interface RoleVolumeRow {
  role: string;
  label: string;
  /** Active+filled job count (open + closed in the last 12 months). */
  jobs: number;
  applications: number;
}

export interface StateActivityRow {
  state: string;
  jobs: number;
  applications: number;
}

export interface HiringReportSnapshot {
  generated_at: string;
  total_active_jobs: number;
  total_applications_lifetime: number;
  /** Distinct DSOs that have ever posted a job. */
  participating_dsos: number;
  comp_bands_hourly: RoleCompBand[];
  comp_bands_annual: RoleCompBand[];
  role_volume: RoleVolumeRow[];
  by_state: StateActivityRow[];
  avg_time_to_fill_days: number | null;
  /** Total sample size across all jobs (for transparency). */
  jobs_with_comp_count: number;
}

/**
 * Compute the public hiring-report snapshot in one pass. Designed for
 * call once per page render — Vercel ISR will revalidate every 6 hours
 * (configurable via the page's `revalidate` export). Aggregations are
 * cheap at the data scale we expect for the first year.
 */
export async function getHiringReportSnapshot(): Promise<HiringReportSnapshot> {
  const admin = createSupabaseServiceRoleClient();

  // 1. Headline counts.
  const [{ count: activeJobs }, { count: lifetimeApps }, { count: dsoCount }] =
    await Promise.all([
      admin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .is("deleted_at", null),
      admin.from("applications").select("id", { count: "exact", head: true }),
      admin
        .from("dsos")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
    ]);

  // 2. Comp bands by role + period. Pull jobs that have BOTH min and
  //    max set, and a known period — we treat the row's representative
  //    comp as (min+max)/2 for median calculation.
  const { data: compRows } = await admin
    .from("jobs")
    .select("role_category, compensation_min, compensation_max, compensation_period")
    .not("compensation_min", "is", null)
    .not("compensation_max", "is", null)
    .not("compensation_period", "is", null)
    .is("deleted_at", null);
  const compsByRolePeriod = new Map<string, number[]>();
  for (const j of (compRows ?? []) as Array<{
    role_category: string;
    compensation_min: number;
    compensation_max: number;
    compensation_period: "hourly" | "daily" | "annual";
  }>) {
    const mid = (j.compensation_min + j.compensation_max) / 2;
    if (!Number.isFinite(mid) || mid <= 0) continue;
    const key = `${j.role_category}|${j.compensation_period}`;
    const arr = compsByRolePeriod.get(key) ?? [];
    arr.push(mid);
    compsByRolePeriod.set(key, arr);
  }

  const compBandsHourly: RoleCompBand[] = [];
  const compBandsAnnual: RoleCompBand[] = [];
  for (const role of ROLE_DISPLAY_ORDER) {
    for (const period of ["hourly", "annual"] as const) {
      const samples = compsByRolePeriod.get(`${role}|${period}`) ?? [];
      if (samples.length < MIN_SAMPLE_SIZE) continue;
      samples.sort((a, b) => a - b);
      const band: RoleCompBand = {
        role,
        label: ROLE_LABEL[role] ?? role,
        period,
        sample_size: samples.length,
        p25: percentile(samples, 0.25),
        p50: percentile(samples, 0.5),
        p75: percentile(samples, 0.75),
      };
      if (period === "hourly") compBandsHourly.push(band);
      else compBandsAnnual.push(band);
    }
  }

  // 3. Role volume. Counts of jobs by role + apps by role across all time.
  const { data: jobsByRoleRows } = await admin
    .from("jobs")
    .select("id, role_category")
    .is("deleted_at", null);
  const jobsByRole = new Map<string, { count: number; jobIds: string[] }>();
  for (const j of (jobsByRoleRows ?? []) as Array<{
    id: string;
    role_category: string;
  }>) {
    const entry = jobsByRole.get(j.role_category) ?? {
      count: 0,
      jobIds: [],
    };
    entry.count += 1;
    entry.jobIds.push(j.id);
    jobsByRole.set(j.role_category, entry);
  }
  const appsByRole = new Map<string, number>();
  // Bulk fetch app counts by joining via job_id → role_category.
  const { data: appsRoleRows } = await admin
    .from("applications")
    .select("jobs!inner(role_category)");
  for (const r of (appsRoleRows ?? []) as unknown as Array<{
    jobs: Array<{ role_category: string }>;
  }>) {
    const role = r.jobs?.[0]?.role_category;
    if (!role) continue;
    appsByRole.set(role, (appsByRole.get(role) ?? 0) + 1);
  }
  const roleVolume: RoleVolumeRow[] = ROLE_DISPLAY_ORDER.filter((r) =>
    jobsByRole.has(r)
  ).map((r) => ({
    role: r,
    label: ROLE_LABEL[r] ?? r,
    jobs: jobsByRole.get(r)?.count ?? 0,
    applications: appsByRole.get(r) ?? 0,
  }));

  // 4. By state. Apps + jobs grouped via dso_locations.state.
  //    Flat queries: jobs+location, jobs+apps, then aggregate.
  const { data: jobLocs } = await admin
    .from("job_locations")
    .select("job_id, dso_locations!inner(state)");
  const jobIdToState = new Map<string, string>();
  for (const r of (jobLocs ?? []) as unknown as Array<{
    job_id: string;
    dso_locations: Array<{ state: string | null }>;
  }>) {
    const st = r.dso_locations?.[0]?.state;
    if (st) jobIdToState.set(r.job_id, st.trim().toUpperCase());
  }
  const stateMap = new Map<string, { jobs: Set<string>; apps: number }>();
  for (const [jobId, state] of jobIdToState.entries()) {
    const e = stateMap.get(state) ?? { jobs: new Set<string>(), apps: 0 };
    e.jobs.add(jobId);
    stateMap.set(state, e);
  }
  // Apps per state — re-read in one shot for job-id → state lookup.
  const { data: allApps } = await admin.from("applications").select("job_id");
  for (const a of (allApps ?? []) as Array<{ job_id: string }>) {
    const state = jobIdToState.get(a.job_id);
    if (!state) continue;
    const e = stateMap.get(state);
    if (!e) continue;
    e.apps += 1;
  }
  const byState: StateActivityRow[] = Array.from(stateMap.entries())
    .map(([state, v]) => ({
      state,
      jobs: v.jobs.size,
      applications: v.apps,
    }))
    .sort((a, b) => b.applications - a.applications)
    .slice(0, 15);

  // 5. Avg time-to-fill across the platform (last 12 months).
  const yearAgo = new Date(Date.now() - 365 * 86400 * 1000).toISOString();
  const { data: hireRows } = await admin
    .from("applications")
    .select("hired_at, jobs!inner(posted_at)")
    .eq("status", "hired")
    .gte("hired_at", yearAgo);
  let ttfTotal = 0;
  let ttfN = 0;
  for (const r of (hireRows ?? []) as unknown as Array<{
    hired_at: string;
    jobs: Array<{ posted_at: string | null }>;
  }>) {
    const posted = r.jobs?.[0]?.posted_at;
    if (!posted || !r.hired_at) continue;
    const days =
      (new Date(r.hired_at).getTime() - new Date(posted).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 0) continue;
    ttfTotal += days;
    ttfN += 1;
  }
  const avgTimeToFill =
    ttfN >= MIN_SAMPLE_SIZE ? ttfTotal / ttfN : null;

  return {
    generated_at: new Date().toISOString(),
    total_active_jobs: activeJobs ?? 0,
    total_applications_lifetime: lifetimeApps ?? 0,
    participating_dsos: dsoCount ?? 0,
    comp_bands_hourly: compBandsHourly,
    comp_bands_annual: compBandsAnnual,
    role_volume: roleVolume,
    by_state: byState,
    avg_time_to_fill_days: avgTimeToFill,
    jobs_with_comp_count: (compRows ?? []).length,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export const MIN_REPORT_SAMPLE_SIZE = MIN_SAMPLE_SIZE;
