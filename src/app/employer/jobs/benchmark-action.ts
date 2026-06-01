"use server";

/**
 * Market pay-benchmark lookup for the job comp step + offer flow (gap N4).
 *
 * Reads the dated, sourced wage_benchmarks table (BLS OEWS) we seeded in
 * analytics Phase 3. Returns the state row when we have one for the job's
 * state, else the national row. Only the three roles with published OEWS
 * series are benchmarkable (dentist, dental_hygienist, dental_assistant);
 * everything else returns null and the UI shows nothing.
 *
 * Guidance only — never enforcement. The caller renders it as a read-only
 * "market median" line with a gentle below-market nudge.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BENCHMARK_ROLES } from "@/lib/analytics/benchmarks";

export interface MarketBenchmark {
  role: string;
  label: string;
  median_hourly: number | null;
  median_annual: number | null;
  mean_hourly: number | null;
  scope: "state" | "national";
  state: string | null;
  vintage: string;
  source: string;
}

export async function getMarketBenchmark(
  role: string,
  state: string | null
): Promise<MarketBenchmark | null> {
  const known = BENCHMARK_ROLES.find((r) => r.role === role);
  if (!known) return null;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("wage_benchmarks")
    .select(
      "role_category, scope, state, median_hourly, median_annual, mean_hourly, vintage, source"
    )
    .eq("role_category", role);

  const rows = (data ?? []) as Array<{
    role_category: string;
    scope: string;
    state: string | null;
    median_hourly: number | null;
    median_annual: number | null;
    mean_hourly: number | null;
    vintage: string;
    source: string;
  }>;

  const st = state?.trim().toUpperCase() || null;
  const stateRow = st
    ? rows.find((r) => r.scope === "state" && r.state?.toUpperCase() === st)
    : undefined;
  const nationalRow = rows.find((r) => r.scope === "national");
  const chosen = stateRow ?? nationalRow;
  if (!chosen) return null;

  return {
    role,
    label: known.label,
    median_hourly: chosen.median_hourly,
    median_annual: chosen.median_annual,
    mean_hourly: chosen.mean_hourly,
    scope: stateRow ? "state" : "national",
    state: stateRow ? st : null,
    vintage: chosen.vintage,
    source: chosen.source,
  };
}
