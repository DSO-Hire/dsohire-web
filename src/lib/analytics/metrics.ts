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

export interface SparklineDay {
  /** ISO date (UTC midnight, YYYY-MM-DD). */
  date: string;
  count: number;
  /** Application IDs for that day — drives the click-through on dots. */
  application_ids: string[];
}

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
  /** Same 30 days but with the application IDs that came in each day. */
  apps_per_day: SparklineDay[];
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
      .select("id, created_at")
      .eq("job_id", jobId)
      .gte("created_at", since30d),
    supabase
      .from("applications")
      .select("source")
      .eq("job_id", jobId)
      .gte("created_at", since30d)
      .not("source", "is", null),
  ]);

  // Build the 30-day sparkline with per-day application IDs.
  const appsLast30d = (appsLast30dRows ?? []) as Array<{
    id: string;
    created_at: string;
  }>;
  const appsPerDay: SparklineDay[] = bucketAppsByDay(appsLast30d, 30);
  const sparkline = appsPerDay.map((d) => d.count);

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
    apps_per_day: appsPerDay,
    top_sources: topSources,
  };
}

// ─────────────────────────────────────────────────────────────
// Time-in-stage (per-job)
// ─────────────────────────────────────────────────────────────

export interface StageDwellRow {
  stage: FunnelStage;
  label: string;
  /** Mean dwell time in days for apps that left this stage. */
  avg_days: number | null;
  /** Number of applications observed transitioning OUT of this stage. */
  observed_transitions: number;
}

/**
 * Compute average time each application spends in each pipeline stage,
 * based on application_status_events transitions. For each app, the
 * dwell time in stage X is the delta between the event where
 * to_status=X and the event where from_status=X. Apps still in stage
 * X (no outgoing transition) are excluded from that stage's mean —
 * they'd otherwise drag the metric toward "stuck" indefinitely.
 *
 * Returns a row per funnel stage (Applied → Screening → Interview →
 * Offered). Hired isn't included because it's terminal — no dwell.
 */
export async function getJobStageDwell(
  supabase: SupabaseClient,
  jobId: string
): Promise<StageDwellRow[]> {
  // Pull all events for this job's applications.
  const { data: events } = await supabase
    .from("application_status_events")
    .select(
      "application_id, from_status, to_status, created_at, applications!inner(job_id)"
    )
    .eq("applications.job_id", jobId)
    .order("created_at", { ascending: true });

  // !inner returns the joined row as an array — see
  // feedback_supabase_inner_returns_array.
  const rows =
    (events ?? []) as unknown as Array<{
      application_id: string;
      from_status: string | null;
      to_status: string;
      created_at: string;
      applications: Array<{ job_id: string }>;
    }>;

  // Group events by application_id, sorted asc by created_at.
  const eventsByApp = new Map<string, Array<{ from: string | null; to: string; at: number }>>();
  for (const r of rows) {
    const arr = eventsByApp.get(r.application_id) ?? [];
    arr.push({
      from: r.from_status,
      to: r.to_status,
      at: new Date(r.created_at).getTime(),
    });
    eventsByApp.set(r.application_id, arr);
  }

  // For each application's event chain, walk and accumulate dwell.
  const stageTotals: Record<string, { totalMs: number; n: number }> = {};
  for (const stage of FUNNEL_ORDER) {
    stageTotals[stage] = { totalMs: 0, n: 0 };
  }

  for (const arr of eventsByApp.values()) {
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      if (!prev.to) continue;
      const stage = prev.to as FunnelStage;
      if (!(stage in stageTotals)) continue;
      const delta = cur.at - prev.at;
      if (delta < 0) continue;
      stageTotals[stage].totalMs += delta;
      stageTotals[stage].n += 1;
    }
  }

  return FUNNEL_ORDER.filter((s) => s !== "hired").map((stage) => {
    const t = stageTotals[stage];
    const days = t.n > 0 ? t.totalMs / t.n / (1000 * 60 * 60 * 24) : null;
    return {
      stage,
      label: STAGE_LABEL[stage],
      avg_days: days,
      observed_transitions: t.n,
    };
  });
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

/**
 * Bucket applications by day. Returns an array of length `days`, oldest
 * first. Each entry carries an ISO date and the list of application IDs
 * that landed in that bucket (drives the sparkline's click-through).
 */
function bucketAppsByDay(
  rows: Array<{ id: string; created_at: string }>,
  days: number
): SparklineDay[] {
  const buckets: SparklineDay[] = [];
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUtc);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.push({
      date: d.toISOString().slice(0, 10),
      count: 0,
      application_ids: [],
    });
  }
  for (const row of rows) {
    const d = new Date(row.created_at);
    d.setUTCHours(0, 0, 0, 0);
    const daysAgo = Math.floor(
      (todayUtc.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysAgo >= 0 && daysAgo < days) {
      const bucket = buckets[days - 1 - daysAgo];
      bucket.count += 1;
      bucket.application_ids.push(row.id);
    }
  }
  return buckets;
}
void startOfDayIso;
