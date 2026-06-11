/**
 * #115 Model 07 (Day 32) — the Dental Hiring Pulse dataset.
 *
 * Public, live market data computed from the same PUBLIC job inventory the
 * homepage band uses — posted-pay distributions by role, demand by state,
 * marketplace counters. The industry runs on annual surveys; this page runs
 * on the database.
 *
 * Honesty rules (same family as home-live.ts):
 *   - Role pay stats publish ONLY at n ≥ PULSE_MIN_N postings with visible
 *     comp in the role's dominant pay period. Below the floor a role simply
 *     doesn't appear — we say "not enough data", never guess.
 *   - The whole page degrades to a "warming up" state under
 *     MIN_JOBS_FOR_PULSE active jobs (post-seed-scrub safety).
 *   - Percentiles are computed over posted-range midpoints and labeled as
 *     such — posted ranges, not settled salaries.
 *   - Job data only. Candidate-signal aggregates ("what candidates rank
 *     first") are deliberately NOT in v1 — they need a service-role
 *     aggregate with its own privacy review (queued follow-up).
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export const PULSE_MIN_N = 20;
export const MIN_JOBS_FOR_PULSE = 20;

export interface PulseRoleStat {
  key: string;
  label: string;
  /** "/hr" or "/yr" — the role's dominant posted pay period. */
  unit: string;
  n: number;
  lo: number;
  p25: number;
  median: number;
  p75: number;
  hi: number;
}

export interface PulseStateRow {
  state: string;
  count: number;
}

export interface PulseSnapshot {
  totalJobs: number;
  statesCovered: number;
  groupsHiring: number;
  showPulse: boolean;
  roles: PulseRoleStat[];
  states: PulseStateRow[];
}

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  specialist: "Specialist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  corporate: "Corporate / DSO roles",
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export async function getMarketPulse(): Promise<PulseSnapshot> {
  const supabase = await createSupabaseServerClient();

  const { data: rows, count } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, role_category, scope, compensation_min, compensation_max, compensation_period, compensation_type, compensation_visible, job_locations(dso_locations(state))",
      { count: "exact" }
    )
    .eq("status", "active")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .limit(1000);

  const all = (rows ?? []) as Array<Record<string, unknown>>;
  const totalJobs = count ?? all.length;

  // ── states + distinct hiring groups ──
  const stateCounts = new Map<string, number>();
  const dsoIds = new Set<string>();
  for (const r of all) {
    if (typeof r.dso_id === "string") dsoIds.add(r.dso_id);
    const seenForJob = new Set<string>();
    const jl = r.job_locations as
      | Array<{ dso_locations: { state: string | null } | Array<{ state: string | null }> | null }>
      | null;
    for (const row of jl ?? []) {
      const relRaw = row?.dso_locations;
      const rel = Array.isArray(relRaw) ? relRaw[0] ?? null : relRaw;
      const st = rel?.state ?? null;
      if (st && !seenForJob.has(st)) {
        seenForJob.add(st);
        stateCounts.set(st, (stateCounts.get(st) ?? 0) + 1);
      }
    }
  }

  // ── posted-pay midpoints per role, split by pay period ──
  // bucket key: `${role}|${period}` → midpoints[]
  const buckets = new Map<string, number[]>();
  for (const r of all) {
    if (r.compensation_visible !== true) continue;
    const type = (r.compensation_type as string | null) ?? "range";
    if (type === "doe") continue;
    const min = typeof r.compensation_min === "number" ? r.compensation_min : null;
    const max = typeof r.compensation_max === "number" ? r.compensation_max : null;
    const mid =
      min != null && max != null ? (min + max) / 2 : (min ?? max);
    if (mid == null || mid <= 0) continue;
    const period = (r.compensation_period as string | null) ?? "hourly";
    if (period !== "hourly" && period !== "annual") continue; // daily/monthly too thin to mix
    const role =
      (r.scope as string | null) === "corporate"
        ? "corporate"
        : ((r.role_category as string | null) ?? "");
    if (!ROLE_LABELS[role]) continue;
    const key = `${role}|${period}`;
    const list = buckets.get(key) ?? [];
    list.push(mid);
    buckets.set(key, list);
  }

  // For each role keep its DOMINANT period bucket; publish only at n ≥ floor.
  const bestByRole = new Map<string, { period: string; mids: number[] }>();
  for (const [key, mids] of buckets) {
    const [role, period] = key.split("|");
    const current = bestByRole.get(role);
    if (!current || mids.length > current.mids.length) {
      bestByRole.set(role, { period, mids });
    }
  }

  const roles: PulseRoleStat[] = [];
  for (const [role, { period, mids }] of bestByRole) {
    if (mids.length < PULSE_MIN_N) continue;
    const sorted = [...mids].sort((a, b) => a - b);
    roles.push({
      key: role,
      label: ROLE_LABELS[role],
      unit: period === "annual" ? "/yr" : "/hr",
      n: sorted.length,
      lo: sorted[0],
      p25: percentile(sorted, 0.25),
      median: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      hi: sorted[sorted.length - 1],
    });
  }
  roles.sort((a, b) => b.n - a.n);

  const states: PulseStateRow[] = Array.from(stateCounts.entries())
    .map(([state, n]) => ({ state, count: n }))
    .sort((a, b) => b.count - a.count);

  return {
    totalJobs,
    statesCovered: states.length,
    groupsHiring: dsoIds.size,
    showPulse: totalJobs >= MIN_JOBS_FOR_PULSE,
    roles,
    states,
  };
}
