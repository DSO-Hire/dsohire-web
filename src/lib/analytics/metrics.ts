/**
 * Analytics metric helpers (Phase 5C, shipped 2026-05-11).
 *
 * Reusable server-side queries that power the per-job analytics widget,
 * the DSO-wide analytics dashboard, the weekly digest cron, and the
 * eventual CSV/PDF export surfaces. All reads go through the
 * authenticated server client — RLS gates the data appropriately
 * (DSO members see their own jobs/applications; cross-DSO data never
 * leaks).
 *
 * Conventions:
 *   - All time windows are computed server-side in UTC.
 *   - "Last 7d" means now() - 7 days through now(); "last 30d" same.
 *   - Sparkline buckets are daily; an empty day returns 0.
 *   - Funnel order matches the candidate-facing stage order, not the
 *     enum-declaration order: new → reviewed (Screening) → interviewing
 *     (Interview) → offered → hired. Rejected + withdrawn are
 *     terminal-but-non-funnel; surfaced separately.
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const FUNNEL_ORDER = ["new", "reviewed", "interviewing", "offered", "hired"] as const;
type FunnelStage = (typeof FUNNEL_ORDER)[number];

const STAGE_LABEL: Record<FunnelStage, string> = {
  new: "Applied",
  reviewed: "Screening",
  interviewing: "Interview",
  offered: "Offered",
  hired: "Hired",
};

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function startOfDayIso(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────
// Per-job analytics
// ─────────────────────────────────────────────────────────────

export interface PerJobAnalytics {
  views_total: number;
  views_7d: number;
  views_30d: number;
  applications_total: number;
  applications_7d: number;
  applications_30d: number;
  /** apps_total / views_total, 0 if no views. */
  conversion_rate: number;
  /** Daily application count for the last 30 days (oldest first, length=30). */
  apps_sparkline_30d: number[];
  /** Top source channels with counts, last 30 days, sorted desc. */
  top_sources: Array<{ source: string; count: number }>;
}

export async function getPerJobAnalytics(
  supabase: SupabaseClient,
  jobId: string
): Promise<PerJobAnalytics> {
  const since7d = daysAgoIso(7);
  const since30d = daysAgoIso(30);

  // Views — three count buckets in parallel.
  const [
    { count: viewsTotal },
    { count: views7d },
    { count: views30d },
    { count: appsTotal },
    { count: apps7d },
    { count: apps30d },
    { data: appsLast30dRows },
    { data: sourceRows },
  ] = await Promise.all([
    supabase
      .from("job_view_events")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId),
    supabase
      .from("job_view_events")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .gte("viewed_at", since7d),
    supabase
      .from("job_view_events")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .gte("viewed_at", since30d),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .gte("created_at", since7d),
    supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("job_id", jobId)
      .gte("created_at", since30d),
    supabase
      .from("applications")
      .select("created_at")
      .eq("job_id", jobId)
      .gte("created_at", since30d),
    supabase
      .from("applications")
      .select("source")
      .eq("job_id", jobId)
      .gte("created_at", since30d)
      .not("source", "is", null),
  ]);

  // Build the 30-day sparkline (apps per day, oldest first).
  const sparkline = bucketByDay(
    (appsLast30dRows ?? []) as Array<{ created_at: string }>,
    30
  );

  // Top sources: group by source, count, sort.
  const sourceCounts = new Map<string, number>();
  for (const row of (sourceRows ?? []) as Array<{ source: string }>) {
    sourceCounts.set(row.source, (sourceCounts.get(row.source) ?? 0) + 1);
  }
  const topSources = Array.from(sourceCounts.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const vt = viewsTotal ?? 0;
  const at = appsTotal ?? 0;
  const conversionRate = vt > 0 ? at / vt : 0;

  return {
    views_total: vt,
    views_7d: views7d ?? 0,
    views_30d: views30d ?? 0,
    applications_total: at,
    applications_7d: apps7d ?? 0,
    applications_30d: apps30d ?? 0,
    conversion_rate: conversionRate,
    apps_sparkline_30d: sparkline,
    top_sources: topSources,
  };
}

// ─────────────────────────────────────────────────────────────
// Per-job funnel (stage drop-off)
// ─────────────────────────────────────────────────────────────

export interface FunnelStageRow {
  stage: FunnelStage;
  label: string;
  count: number;
  /** Conversion FROM the previous stage's count (1 for stage 0). */
  conversion_from_prev: number;
}

export interface JobFunnel {
  rows: FunnelStageRow[];
  rejected: number;
  withdrawn: number;
}

export async function getJobFunnel(
  supabase: SupabaseClient,
  jobId: string
): Promise<JobFunnel> {
  // We compute "ever reached this stage" by looking at
  // application_status_events. An application's status moves forward
  // through to_status='hired' (or rejected/withdrawn); the events
  // table captures every transition. "Count for stage X" = number of
  // distinct applications whose status_events include to_status=X.
  const { data: events } = await supabase
    .from("application_status_events")
    .select("application_id, to_status")
    .in("to_status", ["new", "reviewed", "interviewing", "offered", "hired"])
    .eq("application_id", "00000000-0000-0000-0000-000000000000"); // sentinel — overridden below

  // The sentinel filter above is silly — we actually need to filter by
  // job_id. status_events has application_id not job_id, so we have
  // to join. Simpler: count applications grouped by current status,
  // then back-fill "ever reached" by ordering: every app that's now
  // hired must have passed through interviewing, etc.
  void events;

  const { data: apps } = await supabase
    .from("applications")
    .select("status")
    .eq("job_id", jobId);

  const applications = (apps ?? []) as Array<{ status: FunnelStage | "rejected" | "withdrawn" }>;

  // Count current-status per app.
  const currentCounts: Record<string, number> = {
    new: 0,
    reviewed: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const a of applications) {
    currentCounts[a.status] = (currentCounts[a.status] ?? 0) + 1;
  }

  // "Ever reached stage X" = sum of (current=X) + every later stage.
  // i.e. anyone now hired was once interviewing, etc.
  const reachedCounts: Record<FunnelStage, number> = {
    new: 0,
    reviewed: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
  };
  let runningLater = 0;
  for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) {
    const stage = FUNNEL_ORDER[i];
    const here = currentCounts[stage] ?? 0;
    reachedCounts[stage] = here + runningLater;
    runningLater += here;
  }
  // Also count rejected + withdrawn in `new` since they all started there.
  reachedCounts.new += currentCounts.rejected + currentCounts.withdrawn;

  const rows: FunnelStageRow[] = FUNNEL_ORDER.map((stage, i) => {
    const count = reachedCounts[stage];
    const prev = i === 0 ? count : reachedCounts[FUNNEL_ORDER[i - 1]];
    const conversion = i === 0 ? 1 : prev > 0 ? count / prev : 0;
    return {
      stage,
      label: STAGE_LABEL[stage],
      count,
      conversion_from_prev: conversion,
    };
  });

  return {
    rows,
    rejected: currentCounts.rejected ?? 0,
    withdrawn: currentCounts.withdrawn ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────
// DSO-wide analytics
// ─────────────────────────────────────────────────────────────

export interface DsoAnalytics {
  open_roles: number;
  applications_30d: number;
  applications_quarter: number;
  hires_quarter: number;
  /** avg days from job.posted_at to applications.hired_at across hires-this-quarter. */
  avg_time_to_fill_days: number | null;
  /** rollup of per-stage counts across ALL the DSO's active jobs. */
  funnel: FunnelStageRow[];
}

export async function getDsoAnalytics(
  supabase: SupabaseClient,
  dsoId: string
): Promise<DsoAnalytics> {
  const quarterStart = daysAgoIso(90);
  const last30d = daysAgoIso(30);

  const [
    { count: openRoles },
    { count: apps30d },
    { count: appsQuarter },
    { data: hiresQuarter },
    { data: allApps },
  ] = await Promise.all([
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("dso_id", dsoId)
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("applications")
      .select("id, jobs!inner(dso_id)", { count: "exact", head: true })
      .eq("jobs.dso_id", dsoId)
      .gte("created_at", last30d),
    supabase
      .from("applications")
      .select("id, jobs!inner(dso_id)", { count: "exact", head: true })
      .eq("jobs.dso_id", dsoId)
      .gte("created_at", quarterStart),
    supabase
      .from("applications")
      .select("hired_at, jobs!inner(dso_id, posted_at)")
      .eq("jobs.dso_id", dsoId)
      .eq("status", "hired")
      .gte("hired_at", quarterStart),
    supabase
      .from("applications")
      .select("status, jobs!inner(dso_id)")
      .eq("jobs.dso_id", dsoId),
  ]);

  // Time-to-fill: average days between job.posted_at and application.hired_at.
  // The !inner join returns the jobs row as an array (Supabase quirk —
  // see feedback_supabase_inner_returns_array). Cast through unknown.
  const hireRows =
    (hiresQuarter ?? []) as unknown as Array<{
      hired_at: string;
      jobs: Array<{ posted_at: string | null }>;
    }>;
  let totalDays = 0;
  let countHires = 0;
  for (const row of hireRows) {
    const posted = row.jobs?.[0]?.posted_at;
    if (!posted || !row.hired_at) continue;
    const days =
      (new Date(row.hired_at).getTime() - new Date(posted).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 0) continue;
    totalDays += days;
    countHires += 1;
  }
  const avgTimeToFill = countHires > 0 ? totalDays / countHires : null;

  // DSO-wide funnel rollup (same algorithm as per-job).
  const appsAll =
    (allApps ?? []) as Array<{ status: FunnelStage | "rejected" | "withdrawn" }>;
  const currentCounts: Record<string, number> = {
    new: 0,
    reviewed: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
    rejected: 0,
    withdrawn: 0,
  };
  for (const a of appsAll) {
    currentCounts[a.status] = (currentCounts[a.status] ?? 0) + 1;
  }
  const reachedCounts: Record<FunnelStage, number> = {
    new: 0,
    reviewed: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
  };
  let runningLater = 0;
  for (let i = FUNNEL_ORDER.length - 1; i >= 0; i--) {
    const stage = FUNNEL_ORDER[i];
    const here = currentCounts[stage] ?? 0;
    reachedCounts[stage] = here + runningLater;
    runningLater += here;
  }
  reachedCounts.new += currentCounts.rejected + currentCounts.withdrawn;

  const funnel: FunnelStageRow[] = FUNNEL_ORDER.map((stage, i) => {
    const count = reachedCounts[stage];
    const prev = i === 0 ? count : reachedCounts[FUNNEL_ORDER[i - 1]];
    const conversion = i === 0 ? 1 : prev > 0 ? count / prev : 0;
    return {
      stage,
      label: STAGE_LABEL[stage],
      count,
      conversion_from_prev: conversion,
    };
  });

  return {
    open_roles: openRoles ?? 0,
    applications_30d: apps30d ?? 0,
    applications_quarter: appsQuarter ?? 0,
    hires_quarter: countHires,
    avg_time_to_fill_days: avgTimeToFill,
    funnel,
  };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Bucket events by day. Returns an array of length `days`, oldest first. */
function bucketByDay(
  rows: Array<{ created_at: string }>,
  days: number
): number[] {
  const buckets = new Array(days).fill(0);
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  for (const row of rows) {
    const d = new Date(row.created_at);
    d.setUTCHours(0, 0, 0, 0);
    const daysAgo = Math.floor(
      (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysAgo >= 0 && daysAgo < days) {
      // index 0 = oldest, index days-1 = today
      buckets[days - 1 - daysAgo] += 1;
    }
  }
  return buckets;
}
void startOfDayIso;
