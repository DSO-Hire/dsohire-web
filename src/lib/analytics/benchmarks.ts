/**
 * Dental benchmarking (Analytics Phase 3) — the moat.
 *
 * Two halves:
 *   1. WAGE benchmarks — "your offered pay vs. market" from the dated,
 *      sourced wage_benchmarks table (BLS OEWS). Government data; trustworthy.
 *   2. VACANCY-COST basis — "cost of an open chair." These are INDUSTRY
 *      ESTIMATES / rules of thumb, not government data, and are labeled as
 *      such in the UI. Configurable here in one place.
 *
 * Benchmarkable roles are the three with published OEWS series: dentist,
 * dental_hygienist, dental_assistant. Other role_category values have no
 * market row and are skipped.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const HOURS_PER_YEAR = 2080;

export const BENCHMARK_ROLES: Array<{ role: string; label: string }> = [
  { role: "dentist", label: "Dentist" },
  { role: "dental_hygienist", label: "Dental Hygienist" },
  { role: "dental_assistant", label: "Dental Assistant" },
];

/**
 * Cost-of-open-chair estimates (INDUSTRY rules of thumb — see
 * Analytics_Feature_Research_2026-06-01.md §3). Per UNFILLED clinical seat.
 * Assistants are a support role without their own production seat, so they're
 * excluded from the vacancy-cost model.
 */
export const VACANCY_COST: Record<
  string,
  { monthlyLow: number; monthlyHigh: number }
> = {
  dental_hygienist: { monthlyLow: 15000, monthlyHigh: 25000 },
  dentist: { monthlyLow: 70000, monthlyHigh: 100000 },
};

/** Normalize a comp min/max/period to an approximate hourly figure. */
export function normalizeToHourly(
  min: number | null,
  max: number | null,
  period: string | null
): number | null {
  const base =
    min != null && max != null ? (min + max) / 2 : (min ?? max ?? null);
  if (base == null) return null;
  if (period === "annual") return base / HOURS_PER_YEAR;
  if (period === "daily") return base / 8;
  if (period === "hourly") return base;
  // Unknown period — infer by magnitude (a $50k+ number is annual, not hourly).
  if (base >= 400) return base / HOURS_PER_YEAR;
  return base;
}

export interface PayBenchmarkRow {
  role: string;
  label: string;
  /** DSO's avg offered hourly across active jobs for this role; null if none. */
  your_hourly: number | null;
  your_job_count: number;
  /** Market median hourly (state if available for the DSO's modal state, else national). */
  market_hourly: number | null;
  market_scope: "state" | "national" | null;
  market_state: string | null;
  vintage: string | null;
}

interface BenchRow {
  role_category: string;
  scope: string;
  state: string | null;
  median_hourly: number | null;
  median_annual: number | null;
  vintage: string;
}

/**
 * "Your pay vs market" rows — one per benchmarkable role the DSO posts (or all
 * three, with null `your_hourly` when the DSO hasn't posted that role).
 */
export async function getPayBenchmarks(
  supabase: SupabaseClient,
  dsoId: string
): Promise<PayBenchmarkRow[]> {
  // 1. Active jobs for the DSO (role + comp).
  const { data: jobRows } = await supabase
    .from("jobs")
    .select(
      "id, role_category, compensation_min, compensation_max, compensation_period, status, deleted_at"
    )
    .eq("dso_id", dsoId);
  const jobs = (
    (jobRows ?? []) as Array<{
      id: string;
      role_category: string;
      compensation_min: number | null;
      compensation_max: number | null;
      compensation_period: string | null;
      status: string;
      deleted_at: string | null;
    }>
  ).filter((j) => j.status === "active" && j.deleted_at === null);
  const jobIds = jobs.map((j) => j.id);

  // 2. State per job (modal state per role, for state-level benchmark pick).
  const jobState = new Map<string, string | null>();
  if (jobIds.length > 0) {
    const { data: jl } = await supabase
      .from("job_locations")
      .select("job_id, dso_locations:dso_locations(state)")
      .in("job_id", jobIds);
    for (const r of (jl ?? []) as unknown as Array<{
      job_id: string;
      dso_locations:
        | { state: string | null }
        | Array<{ state: string | null }>
        | null;
    }>) {
      const rel = r.dso_locations;
      const loc = Array.isArray(rel) ? rel[0] ?? null : rel;
      const st = loc?.state ?? null;
      if (st && !jobState.has(r.job_id)) jobState.set(r.job_id, st);
    }
  }

  // 3. Benchmark reference rows.
  const { data: benchRows } = await supabase
    .from("wage_benchmarks")
    .select("role_category, scope, state, median_hourly, median_annual, vintage");
  const bench = (benchRows ?? []) as BenchRow[];
  const nationalByRole = new Map<string, BenchRow>();
  const stateByRoleState = new Map<string, BenchRow>();
  for (const b of bench) {
    if (b.scope === "national") nationalByRole.set(b.role_category, b);
    else if (b.scope === "state" && b.state)
      stateByRoleState.set(`${b.role_category}:${b.state.toUpperCase()}`, b);
  }

  return BENCHMARK_ROLES.map(({ role, label }) => {
    const roleJobs = jobs.filter((j) => j.role_category === role);
    const hourlies = roleJobs
      .map((j) =>
        normalizeToHourly(
          j.compensation_min,
          j.compensation_max,
          j.compensation_period
        )
      )
      .filter((v): v is number => v != null);
    const yourHourly =
      hourlies.length > 0
        ? hourlies.reduce((a, b) => a + b, 0) / hourlies.length
        : null;

    // Modal state across this role's jobs.
    const stateCounts = new Map<string, number>();
    for (const j of roleJobs) {
      const st = jobState.get(j.id);
      if (st) stateCounts.set(st, (stateCounts.get(st) ?? 0) + 1);
    }
    let modalState: string | null = null;
    let best = 0;
    for (const [st, n] of stateCounts) {
      if (n > best) {
        best = n;
        modalState = st.toUpperCase();
      }
    }

    const stateRow = modalState
      ? stateByRoleState.get(`${role}:${modalState}`) ?? null
      : null;
    const natRow = nationalByRole.get(role) ?? null;
    const chosen = stateRow ?? natRow;
    const marketHourly =
      chosen?.median_hourly ??
      (chosen?.median_annual != null
        ? chosen.median_annual / HOURS_PER_YEAR
        : null);

    return {
      role,
      label,
      your_hourly: yourHourly,
      your_job_count: roleJobs.length,
      market_hourly: marketHourly,
      market_scope: stateRow ? "state" : natRow ? "national" : null,
      market_state: stateRow ? modalState : null,
      vintage: chosen?.vintage ?? null,
    };
  });
}

export interface VacancyCostResult {
  hygiene_open: number;
  dentist_open: number;
  monthly_low: number;
  monthly_high: number;
}

/** Open clinical reqs × per-seat monthly production estimate. */
export async function getVacancyCost(
  supabase: SupabaseClient,
  dsoId: string
): Promise<VacancyCostResult> {
  const { data: jobRows } = await supabase
    .from("jobs")
    .select("role_category, status, deleted_at")
    .eq("dso_id", dsoId);
  const jobs = (
    (jobRows ?? []) as Array<{
      role_category: string;
      status: string;
      deleted_at: string | null;
    }>
  ).filter((j) => j.status === "active" && j.deleted_at === null);

  const hygieneOpen = jobs.filter(
    (j) => j.role_category === "dental_hygienist"
  ).length;
  const dentistOpen = jobs.filter((j) => j.role_category === "dentist").length;

  const monthlyLow =
    hygieneOpen * VACANCY_COST.dental_hygienist.monthlyLow +
    dentistOpen * VACANCY_COST.dentist.monthlyLow;
  const monthlyHigh =
    hygieneOpen * VACANCY_COST.dental_hygienist.monthlyHigh +
    dentistOpen * VACANCY_COST.dentist.monthlyHigh;

  return {
    hygiene_open: hygieneOpen,
    dentist_open: dentistOpen,
    monthly_low: monthlyLow,
    monthly_high: monthlyHigh,
  };
}
