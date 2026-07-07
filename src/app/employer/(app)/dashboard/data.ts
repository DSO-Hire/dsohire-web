/**
 * Dashboard data loaders — perf pass #91, P0-A (2026-07-07).
 *
 * The dashboard page used to run 25+ SEQUENTIAL awaits in one server
 * component (measured 11.9s to content on prod). This module breaks that
 * waterfall into per-request-memoized loaders (React `cache()`):
 *
 *   • The page (shell) awaits only what the greeting + KPI strip need.
 *   • Each streamed panel (see sections.tsx) awaits only its own loaders
 *     inside a <Suspense> boundary.
 *   • Shared dependencies (viewer, job scope, the big pipeline batch) are
 *     deduped by `cache()` — whoever asks first kicks the fetch off, and
 *     everyone else awaits the same promise. No fetch runs twice.
 *   • Inside every loader, queries at the same dependency depth run in ONE
 *     `Promise.all`. Nothing awaits anything it doesn't depend on.
 *
 * All query text, filters, and derivations are ported VERBATIM from the
 * pre-#91 page.tsx — this pass changes WHEN things load, never WHAT loads.
 */

import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscriptionAnyStatus } from "@/lib/billing/subscription";
import { getActiveLocationId } from "@/lib/employer/active-location";
import type { StageKind } from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { getTodaysTopFits } from "@/lib/talent-pool/smart-picks";
import { getInterestedCandidates } from "@/lib/talent-pool/mutual-interest";
import { getExpiringCredentials } from "@/lib/credentials/expiring-credentials";
import type { JobHealthRow } from "@/components/dashboard/job-health";

// SLA threshold for stuck-candidate alerts. Pulled out as a constant so
// future config UI can override it per-DSO without touching the page.
export const STUCK_SLA_DAYS = 5;

// E3.24 — days a candidate can sit in a mid-pipeline stage (screen /
// interview / offer) before the dashboard flags them as stale. Matches
// the weekly-digest threshold so the two surfaces agree.
export const STALE_STAGE_DAYS = 14;

/**
 * #91 P1 instrumentation — per-loader wall-clock logging. Targets were
 * confirmed on the 2026-07-07 measurement deploy (shell ~0.5s, worst panel
 * ~1s on prod), so this is now SILENT unless PERF_LOG=1 is set in the
 * environment — flip it on in Vercel for any future perf investigation.
 */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (process.env.PERF_LOG !== "1") return fn();
  const start = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[perf] ${label} ${Date.now() - start}ms`);
  }
}

/** One "now" snapshot per request so every relative-time computation on
 *  the page agrees, even across concurrently streaming panels. */
export const getNowMs = cache(() => Date.now());

/* ──────────────────────────────────────────────────────────────
 * Shared row shapes (moved verbatim from page.tsx)
 * ─────────────────────────────────────────────────────────── */

export type StuckCandidateRow = {
  applicationId: string;
  candidateName: string;
  jobTitle: string;
  locationName: string | null;
  daysWaiting: number;
};

export type StaleCandidateRow = StuckCandidateRow & { stageLabel: string };

export type DashboardJob = { id: string; title: string };

export type DashboardApp = {
  id: string;
  job_id: string;
  candidate_id: string;
  /** Stage kind resolved from the embedded stage row. */
  kind: StageKind;
  created_at: string;
};

export type DashboardCandidate = {
  id: string;
  full_name: string | null;
};

export type MiniMapLocationRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  applicationCount: number;
};

type JobWithStatus = DashboardJob & {
  status: string;
  role_category: string;
  employment_type: string;
  applications_count: number;
  posted_at: string | null;
};

/* ──────────────────────────────────────────────────────────────
 * Depth 0-1 — who's asking, and their DSO
 * ─────────────────────────────────────────────────────────── */

export const getViewer = cache(async () =>
  timed("dashboard.viewer", async () => {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id ?? "";

    const { data: dsoUser } = await supabase
      .from("dso_users")
      .select("id, dso_id, role, full_name")
      .eq("auth_user_id", userId)
      .maybeSingle();

    const typedDsoUser = (dsoUser ?? null) as {
      id: string;
      dso_id: string | null;
      role: string | null;
      full_name: string | null;
    } | null;

    return {
      supabase,
      dsoUser: typedDsoUser,
      dsoId: typedDsoUser?.dso_id ?? null,
    };
  })
);

/* ──────────────────────────────────────────────────────────────
 * Depth 2 — everything that needs only dsoId, in one batch
 * ─────────────────────────────────────────────────────────── */

export const getCore = cache(async () =>
  timed("dashboard.core", async () => {
    const { supabase, dsoId } = await getViewer();

    const [dsoRes, locationsRes, teamRes, jobsRes, automationsRes, subscription] =
      await Promise.all([
        dsoId
          ? supabase
              .from("dsos")
              .select("id, name, slug, status")
              .eq("id", dsoId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("dso_locations")
          .select("*", { count: "exact", head: true })
          .eq("dso_id", dsoId ?? ""),
        supabase
          .from("dso_users")
          .select("*", { count: "exact", head: true })
          .eq("dso_id", dsoId ?? ""),
        supabase
          .from("jobs")
          .select("*", { count: "exact", head: true })
          .eq("dso_id", dsoId ?? ""),
        supabase
          .from("automation_rules")
          .select("*", { count: "exact", head: true })
          .eq("dso_id", dsoId ?? "")
          .eq("is_system", false),
        dsoId ? getSubscriptionAnyStatus(supabase, dsoId) : Promise.resolve(null),
      ]);

    return {
      dso: (dsoRes.data ?? null) as {
        id: string;
        name: string | null;
        slug: string | null;
        status: string | null;
      } | null,
      locationsCount: locationsRes.count,
      teamCount: teamRes.count,
      jobsCount: jobsRes.count,
      customAutomationCount: automationsRes.count,
      subscription,
    };
  })
);

/** HM location scope — dso_user_locations ids, shared by the context bar
 *  and the LocationPulse filter (the pre-#91 page ran this query twice).
 *  Null = viewer is not a hiring manager (no scoping applies). */
const getHmScopeLocationIds = cache(async (): Promise<string[] | null> => {
  const { supabase, dsoUser } = await getViewer();
  if (dsoUser?.role !== "hiring_manager") return null;
  const { data: scopeRows } = await supabase
    .from("dso_user_locations")
    .select("dso_location_id")
    .eq("dso_user_id", dsoUser.id);
  return ((scopeRows ?? []) as Array<{ dso_location_id: string }>).map(
    (r) => r.dso_location_id
  );
});

// For hiring managers, resolve their scoped locations so the page can render
// a persistent context bar at the top of the dashboard. Two-query pattern
// (same as /employer/team/page.tsx) — sidesteps any embedded FK-relationship-
// naming surprises and is plenty fast at our row volume.
export const getHmScopeLocations = cache(async () =>
  timed("dashboard.hmScope", async () => {
    const { supabase } = await getViewer();
    const ids = await getHmScopeLocationIds();
    if (ids === null || ids.length === 0) {
      return [] as Array<{ name: string; state: string | null }>;
    }
    const { data: locRows } = await supabase
      .from("dso_locations")
      .select("name, state")
      .in("id", ids);
    return (locRows ?? []) as Array<{ name: string; state: string | null }>;
  })
);

/* ──────────────────────────────────────────────────────────────
 * Depth 2-3 — job scope (active-location filter → jobs)
 * ─────────────────────────────────────────────────────────── */

export const getJobScope = cache(async () =>
  timed("dashboard.jobScope", async () => {
    const { supabase, dsoId } = await getViewer();
    const empty = {
      jobs: [] as JobWithStatus[],
      jobIds: [] as string[],
      recentJobMap: new Map<string, DashboardJob>(),
      openJobsCount: 0,
      locationFilteredJobIds: null as string[] | null,
    };
    if (!dsoId) return empty;

    // Multi-location filter (Phase 4.6.d) — when an active location is
    // set, scope the dashboard to jobs at that location only.
    const activeLocationId = await getActiveLocationId();
    let locationFilteredJobIds: string[] | null = null;
    if (activeLocationId) {
      const { data: jobLocRows } = await supabase
        .from("job_locations")
        .select("job_id")
        .eq("location_id", activeLocationId);
      locationFilteredJobIds = (
        (jobLocRows ?? []) as Array<{ job_id: string }>
      ).map((r) => r.job_id);
    }

    // All non-deleted jobs for this DSO. We need every job (any status) to
    // scope the application counts; the "open jobs" chip filters in JS.
    let jobsQuery = supabase
      .from("jobs")
      .select(
        "id, title, status, role_category, employment_type, applications_count, posted_at"
      )
      .eq("dso_id", dsoId)
      .is("deleted_at", null);
    if (locationFilteredJobIds !== null) {
      jobsQuery = jobsQuery.in(
        "id",
        locationFilteredJobIds.length > 0 ? locationFilteredJobIds : ["__none__"]
      );
    }
    const { data: rawJobs } = await jobsQuery;
    const jobs = (rawJobs ?? []) as JobWithStatus[];

    return {
      jobs,
      jobIds: jobs.map((j) => j.id),
      recentJobMap: new Map<string, DashboardJob>(
        jobs.map((j) => [j.id, { id: j.id, title: j.title }])
      ),
      openJobsCount: jobs.filter((j) => j.status === "active").length,
      locationFilteredJobIds,
    };
  })
);

/** The DSO's pipeline-stage rows: open-kind ids ("Awaiting Review" filter)
 *  + mid-pipeline ids/labels (stale lookup). Both need only dsoId, so one
 *  Promise.all. */
const getStages = cache(async () => {
  const { supabase, dsoId } = await getViewer();
  const empty = {
    openStageIdsForFilter: ["__none__"],
    midStageIdsForFilter: ["__none__"],
    midStageLabelById: new Map<string, string>(),
  };
  if (!dsoId) return empty;

  // Resolve the DSO's open-kind stage row ids — the "Awaiting Review"
  // tile + stuck-candidate lookup filter on stage_id (head:true counts
  // can't reliably embed-filter via the join). E3.24 — mid-pipeline
  // stage ids + labels for the stale lookup; we surface the actual
  // per-DSO label (e.g. "Phone Screening") so the alert reads in the
  // customer's own pipeline vocabulary.
  const [openRes, midRes] = await Promise.all([
    supabase
      .from("dso_pipeline_stages")
      .select("id")
      .eq("dso_id", dsoId)
      .eq("kind", "open"),
    supabase
      .from("dso_pipeline_stages")
      .select("id, kind, label")
      .eq("dso_id", dsoId)
      .in("kind", ["screen", "interview", "offer"]),
  ]);

  const openStageIds = ((openRes.data ?? []) as Array<{ id: string }>).map(
    (r) => r.id
  );
  const midRows = (midRes.data ?? []) as Array<{
    id: string;
    kind: string;
    label: string | null;
  }>;
  const midStageIds = midRows.map((r) => r.id);

  return {
    openStageIdsForFilter: openStageIds.length > 0 ? openStageIds : ["__none__"],
    midStageIdsForFilter: midStageIds.length > 0 ? midStageIds : ["__none__"],
    midStageLabelById: new Map<string, string>(
      midRows.map((r) => [r.id, r.label ?? r.kind])
    ),
  };
});

/* ──────────────────────────────────────────────────────────────
 * Depth 4 — the application batch (KPIs, stuck/stale, funnel,
 * velocity, recent apps) in ONE Promise.all
 * ─────────────────────────────────────────────────────────── */

export type PipelineData = {
  appsThisWeekCount: number;
  awaitingReviewCount: number;
  oldestAwaitingDays: number | null;
  appsLast7Days: number[];
  appsWeekOverWeekDelta: number;
  recentApps: DashboardApp[];
  stuckCandidates: StuckCandidateRow[];
  stuckTotalCount: number;
  staleCandidates: StaleCandidateRow[];
  staleTotalCount: number;
  /** Lane 2e health-dot inputs for JobHealth. */
  stuckJobIds: Set<string>;
  staleJobIds: Set<string>;
  perJobFunnel: Map<string, Record<string, number>>;
  perJobVelocity: Map<
    string,
    { spark: number[]; thisWeek: number; lastWeek: number }
  >;
  /** Counts of CURRENT stage kind, last 30 days of submissions (v1:
   *  kind-snapshot funnel; a flow-based funnel would need
   *  application_status_events). */
  stage30dCounts: Record<"open" | "screen" | "interview" | "offer" | "hired", number>;
};

const EMPTY_PIPELINE: PipelineData = {
  appsThisWeekCount: 0,
  awaitingReviewCount: 0,
  oldestAwaitingDays: null,
  appsLast7Days: [],
  appsWeekOverWeekDelta: 0,
  recentApps: [],
  stuckCandidates: [],
  stuckTotalCount: 0,
  staleCandidates: [],
  staleTotalCount: 0,
  stuckJobIds: new Set(),
  staleJobIds: new Set(),
  perJobFunnel: new Map(),
  perJobVelocity: new Map(),
  stage30dCounts: { open: 0, screen: 0, interview: 0, offer: 0, hired: 0 },
};

export const getPipeline = cache(async (): Promise<PipelineData> =>
  timed("dashboard.pipeline", async () => {
    const { supabase, dsoId } = await getViewer();
    if (!dsoId) return EMPTY_PIPELINE;

    const nowMs = getNowMs();
    const [
      { jobIds, recentJobMap },
      { openStageIdsForFilter, midStageIdsForFilter, midStageLabelById },
    ] = await Promise.all([getJobScope(), getStages()]);
    if (jobIds.length === 0) return EMPTY_PIPELINE;

    // ── Date math ──────────────────────────────────────────────────
    const now = new Date(nowMs);
    const dayOfWeek = now.getUTCDay();
    const daysSinceMonday = (dayOfWeek + 6) % 7;
    const weekStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysSinceMonday,
        0,
        0,
        0,
        0
      )
    );
    const fourteenDaysAgo = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 13,
        0,
        0,
        0,
        0
      )
    );
    const thirtyDaysAgo = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 30,
        0,
        0,
        0,
        0
      )
    );

    const [
      appsThisWeekRes,
      awaitingReviewRes,
      oldestAwaitingRes,
      recentAppsRes,
      last14DaysRes,
      stuckRes,
      staleRes,
      funnel30dRes,
      leaderboard14dRes,
    ] = await Promise.all([
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds)
        .gte("created_at", weekStart.toISOString()),
      supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .in("job_id", jobIds)
        .in("stage_id", openStageIdsForFilter),
      supabase
        .from("applications")
        .select("created_at")
        .in("job_id", jobIds)
        .in("stage_id", openStageIdsForFilter)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("applications")
        .select(
          "id, job_id, candidate_id, created_at, stage:dso_pipeline_stages!stage_id(kind)"
        )
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("applications")
        .select("created_at")
        .in("job_id", jobIds)
        .gte("created_at", fourteenDaysAgo.toISOString()),
      // Stuck candidates — kind='open' (resolved via stage_id list) and
      // created_at older than SLA. We pull the row + candidate name via
      // the FK join.
      supabase
        .from("applications")
        .select(
          "id, job_id, created_at, candidate_id, candidate:candidates(full_name)"
        )
        .in("job_id", jobIds)
        .in("stage_id", openStageIdsForFilter)
        .lte(
          "created_at",
          new Date(nowMs - STUCK_SLA_DAYS * 86400000).toISOString()
        )
        .order("created_at", { ascending: true }),
      // E3.24 — stale-in-pipeline: candidates in a mid-pipeline stage
      // whose stage_entered_at is older than STALE_STAGE_DAYS. Keyed on
      // stage_entered_at (when they LANDED in the stage), not created_at.
      supabase
        .from("applications")
        .select(
          "id, job_id, stage_id, stage_entered_at, candidate_id, candidate:candidates(full_name)"
        )
        .in("job_id", jobIds)
        .in("stage_id", midStageIdsForFilter)
        .lte(
          "stage_entered_at",
          new Date(nowMs - STALE_STAGE_DAYS * 86400000).toISOString()
        )
        .order("stage_entered_at", { ascending: true }),
      // Funnel: applications submitted in the last 30 days, by current
      // kind. job_id rides along (Lane 2e) so the same rows also build
      // the per-job health funnels — no extra query.
      supabase
        .from("applications")
        .select("id, job_id, stage:dso_pipeline_stages!stage_id(kind)")
        .in("job_id", jobIds)
        .gte("created_at", thirtyDaysAgo.toISOString()),
      // Per-job leaderboard: 14-day window of application timestamps so
      // we can compute thisWeek/lastWeek + 7-day spark per job.
      supabase
        .from("applications")
        .select("job_id, created_at")
        .in("job_id", jobIds)
        .gte("created_at", fourteenDaysAgo.toISOString()),
    ]);

    const appsThisWeekCount = appsThisWeekRes.count ?? 0;
    const awaitingReviewCount = awaitingReviewRes.count ?? 0;
    const recentApps = (
      (recentAppsRes.data ?? []) as unknown as Array<Record<string, unknown>>
    ).map((row): DashboardApp => {
      const stageRel = row.stage as
        | { kind: string }
        | Array<{ kind: string }>
        | null;
      const stageRow = Array.isArray(stageRel) ? stageRel[0] ?? null : stageRel;
      return {
        id: row.id as string,
        job_id: row.job_id as string,
        candidate_id: row.candidate_id as string,
        kind: (stageRow?.kind ?? "open") as StageKind,
        created_at: row.created_at as string,
      };
    });

    let oldestAwaitingDays: number | null = null;
    const oldestAwaitingCreated = (
      oldestAwaitingRes.data as { created_at: string } | null
    )?.created_at;
    if (oldestAwaitingCreated) {
      const ageMs = nowMs - new Date(oldestAwaitingCreated).getTime();
      oldestAwaitingDays = Math.max(0, Math.floor(ageMs / 86400000));
    }

    // ── Bucket 14 days of timestamps into per-day counts. Index 0 =
    //    13 days ago, index 13 = today. ────────────────────────────
    const buckets: number[] = Array.from({ length: 14 }, () => 0);
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    for (const row of (last14DaysRes.data ?? []) as Array<{
      created_at: string;
    }>) {
      const t = new Date(row.created_at);
      const dayUtc = Date.UTC(
        t.getUTCFullYear(),
        t.getUTCMonth(),
        t.getUTCDate()
      );
      const daysAgo = Math.floor((todayUtc - dayUtc) / 86400000);
      const idx = 13 - daysAgo;
      if (idx >= 0 && idx < 14) buckets[idx] += 1;
    }
    const appsLast7Days = buckets.slice(7);
    const thisWeekTotal = buckets.slice(7).reduce((a, b) => a + b, 0);
    const lastWeekTotal = buckets.slice(0, 7).reduce((a, b) => a + b, 0);
    const appsWeekOverWeekDelta = thisWeekTotal - lastWeekTotal;

    // ── Stuck candidates ─────────────────────────────────────────
    // Supabase types embedded relations as arrays — even one-to-one ones.
    // We pick the first (and only) candidate row from the join.
    type StuckRow = {
      id: string;
      job_id: string;
      created_at: string;
      candidate_id: string;
      candidate:
        | Array<{ full_name: string | null }>
        | { full_name: string | null }
        | null;
    };
    const stuckJobIds = new Set<string>();
    const stuckRaw = (stuckRes.data ?? []) as unknown as StuckRow[];
    const stuckTotalCount = stuckRaw.length;
    for (const r of stuckRaw) stuckJobIds.add(r.job_id); // Lane 2e health
    const stuckCandidates = stuckRaw.slice(0, 3).map((row): StuckCandidateRow => {
      const job = recentJobMap.get(row.job_id);
      const days = Math.max(
        0,
        Math.floor((nowMs - new Date(row.created_at).getTime()) / 86400000)
      );
      const candidateRel = Array.isArray(row.candidate)
        ? row.candidate[0]
        : row.candidate;
      const name = candidateDisplayName({
        fullName: candidateRel?.full_name ?? null,
        candidateId: row.candidate_id,
      });
      return {
        applicationId: row.id,
        candidateName: name,
        jobTitle: job?.title ?? "Unknown role",
        locationName: null, // location wiring is in a follow-up — see job_locations notes
        daysWaiting: days,
      };
    });

    // ── E3.24 stale-in-pipeline candidates ───────────────────────
    type StaleRow = {
      id: string;
      job_id: string;
      stage_id: string;
      stage_entered_at: string | null;
      candidate_id: string;
      candidate:
        | Array<{ full_name: string | null }>
        | { full_name: string | null }
        | null;
    };
    const staleJobIds = new Set<string>();
    const staleRaw = (staleRes.data ?? []) as unknown as StaleRow[];
    const staleTotalCount = staleRaw.length;
    for (const r of staleRaw) staleJobIds.add(r.job_id); // Lane 2e health
    const staleCandidates = staleRaw.slice(0, 3).map((row): StaleCandidateRow => {
      const job = recentJobMap.get(row.job_id);
      const enteredMs = row.stage_entered_at
        ? new Date(row.stage_entered_at).getTime()
        : nowMs;
      const days = Math.max(0, Math.floor((nowMs - enteredMs) / 86400000));
      const candidateRel = Array.isArray(row.candidate)
        ? row.candidate[0]
        : row.candidate;
      const name = candidateDisplayName({
        fullName: candidateRel?.full_name ?? null,
        candidateId: row.candidate_id,
      });
      return {
        applicationId: row.id,
        candidateName: name,
        jobTitle: job?.title ?? "Unknown role",
        locationName: null,
        daysWaiting: days,
        stageLabel: midStageLabelById.get(row.stage_id) ?? "in pipeline",
      };
    });

    // ── Pipeline funnel ──────────────────────────────────────────
    const stage30dCounts: PipelineData["stage30dCounts"] = {
      open: 0,
      screen: 0,
      interview: 0,
      offer: 0,
      hired: 0,
    };
    const perJobFunnel = new Map<string, Record<string, number>>();
    type FunnelRow = {
      job_id: string | null;
      stage: { kind: string } | Array<{ kind: string }> | null;
    };
    for (const row of (funnel30dRes.data ?? []) as unknown as FunnelRow[]) {
      const rel = row.stage;
      const stageRow = Array.isArray(rel) ? rel[0] ?? null : rel;
      const kind = stageRow?.kind;
      if (kind && kind in stage30dCounts) {
        stage30dCounts[kind as keyof typeof stage30dCounts] += 1;
      }
      // Lane 2e — per-job funnel buckets from the same rows.
      if (row.job_id && kind && kind !== "hired") {
        const f =
          perJobFunnel.get(row.job_id) ??
          ({ open: 0, screen: 0, interview: 0, offer: 0 } as Record<
            string,
            number
          >);
        if (kind in f) f[kind] += 1;
        perJobFunnel.set(row.job_id, f);
      }
    }

    // ── Per-job velocity (feeds JobHealth's spark/thisWeek) ──────
    type LbAppRow = { job_id: string; created_at: string };
    const lbApps = (leaderboard14dRes.data ?? []) as LbAppRow[];
    const perJobVelocity = new Map<
      string,
      { spark: number[]; thisWeek: number; lastWeek: number }
    >();
    for (const id of jobIds) {
      perJobVelocity.set(id, {
        spark: Array(7).fill(0),
        thisWeek: 0,
        lastWeek: 0,
      });
    }
    const todayMidnight = new Date(nowMs);
    todayMidnight.setHours(0, 0, 0, 0);
    for (const ev of lbApps) {
      const v = perJobVelocity.get(ev.job_id);
      if (!v) continue;
      const created = new Date(ev.created_at);
      created.setHours(0, 0, 0, 0);
      const daysAgo = Math.round(
        (todayMidnight.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysAgo >= 0 && daysAgo < 7) {
        v.spark[6 - daysAgo] += 1;
        v.thisWeek += 1;
      } else if (daysAgo >= 7 && daysAgo < 14) {
        v.lastWeek += 1;
      }
    }

    return {
      appsThisWeekCount,
      awaitingReviewCount,
      oldestAwaitingDays,
      appsLast7Days,
      appsWeekOverWeekDelta,
      recentApps,
      stuckCandidates,
      stuckTotalCount,
      staleCandidates,
      staleTotalCount,
      stuckJobIds,
      staleJobIds,
      perJobFunnel,
      perJobVelocity,
      stage30dCounts,
    };
  })
);

/* ──────────────────────────────────────────────────────────────
 * KPI-strip companions — TTF median + offers-out
 * ─────────────────────────────────────────────────────────── */

// BOH Lane 2b — median time-to-fill (trailing 90d). Same definition as
// lib/analytics/hub-metrics (the source of truth): a fill = application
// whose CURRENT stage kind is "hired" with hired_at in the window; TTF =
// hired_at − job.posted_at in days, negatives dropped. The hired rows
// also feed a free 7-day hires sparkline. One focused query (hub-metrics'
// full overview is too heavy for the dashboard). Location-scoped like
// every other tile.
export const getTtf = cache(async () =>
  timed("dashboard.ttf", async () => {
    const { supabase, dsoId } = await getViewer();
    const empty = {
      ttfMedianDays: null as number | null,
      ttfFillCount: 0,
      hiresLast7Days: [] as number[],
    };
    if (!dsoId) return empty;
    const { jobIds, locationFilteredJobIds } = await getJobScope();
    if (jobIds.length === 0) return empty;

    const nowMs = getNowMs();
    let ttfQuery = supabase
      .from("applications")
      .select(
        "hired_at, job_id, stage:dso_pipeline_stages!stage_id(kind), job:jobs!inner(posted_at, dso_id)"
      )
      .eq("job.dso_id", dsoId)
      .not("hired_at", "is", null)
      .gte("hired_at", new Date(nowMs - 90 * 86400000).toISOString());
    if (locationFilteredJobIds !== null) {
      ttfQuery = ttfQuery.in(
        "job_id",
        locationFilteredJobIds.length > 0 ? locationFilteredJobIds : ["__none__"]
      );
    }
    const { data: ttfRows } = await ttfQuery;

    type TtfRow = {
      hired_at: string | null;
      stage: { kind: string } | Array<{ kind: string }> | null;
      job:
        | { posted_at: string | null }
        | Array<{ posted_at: string | null }>
        | null;
    };
    let ttfMedianDays: number | null = null;
    let ttfFillCount = 0;
    const ttfDays: number[] = [];
    const hiresBuckets = Array.from({ length: 7 }, () => 0);
    for (const row of (ttfRows ?? []) as unknown as TtfRow[]) {
      const stageRel = Array.isArray(row.stage) ? row.stage[0] ?? null : row.stage;
      if (stageRel?.kind !== "hired" || !row.hired_at) continue;
      ttfFillCount += 1;
      const hiredMs = new Date(row.hired_at).getTime();
      const jobRel = Array.isArray(row.job) ? row.job[0] ?? null : row.job;
      if (jobRel?.posted_at) {
        const d = (hiredMs - new Date(jobRel.posted_at).getTime()) / 86400000;
        if (d >= 0) ttfDays.push(d);
      }
      // Free 7-day hires sparkline from the same rows (oldest first).
      const ago = Math.floor((nowMs - hiredMs) / 86400000);
      if (ago >= 0 && ago < 7) hiresBuckets[6 - ago] += 1;
    }
    if (ttfDays.length > 0) {
      const sorted = [...ttfDays].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      ttfMedianDays = Math.round(
        sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      );
    }
    return { ttfMedianDays, ttfFillCount, hiresLast7Days: hiresBuckets };
  })
);

// BOH Lane 2c — offers out: sends in the last 60 days with no candidate
// response on file. Location-scoped in JS via the embedded
// application.job_id (nested .in() isn't expressible).
export const getOffersOut = cache(async (): Promise<number> =>
  timed("dashboard.offersOut", async () => {
    const { supabase, dsoId } = await getViewer();
    if (!dsoId) return 0;
    const { jobIds, locationFilteredJobIds } = await getJobScope();
    if (jobIds.length === 0) return 0;

    const nowMs = getNowMs();
    const { data: sendRows } = await supabase
      .from("application_offer_sends")
      .select(
        "id, application:applications!inner(job_id, job:jobs!inner(dso_id))"
      )
      .eq("application.job.dso_id", dsoId)
      .gte("sent_at", new Date(nowMs - 60 * 86400000).toISOString());
    type SendRow = {
      id: string;
      application: { job_id: string } | Array<{ job_id: string }> | null;
    };
    let sends = ((sendRows ?? []) as unknown as SendRow[]).map((r) => ({
      id: r.id,
      jobId: Array.isArray(r.application)
        ? r.application[0]?.job_id ?? ""
        : r.application?.job_id ?? "",
    }));
    if (locationFilteredJobIds !== null) {
      const allowed = new Set(locationFilteredJobIds);
      sends = sends.filter((s) => allowed.has(s.jobId));
    }
    if (sends.length === 0) return 0;

    const { data: respRows } = await supabase
      .from("application_offer_responses")
      .select("offer_send_id")
      .in(
        "offer_send_id",
        sends.map((s) => s.id)
      );
    const responded = new Set(
      ((respRows ?? []) as Array<{ offer_send_id: string }>).map(
        (r) => r.offer_send_id
      )
    );
    return sends.filter((s) => !responded.has(s.id)).length;
  })
);

/* ──────────────────────────────────────────────────────────────
 * Streamed-panel loaders (each awaited inside its own <Suspense>)
 * ─────────────────────────────────────────────────────────── */

// v3 Phase C — "Today's top fits" cross-job roll-up. Cache-aware
// (practice_fit_scores, cached-only since #91); identity masking handled
// upstream. Hiring managers see it too — it's read-only discovery.
export const getTopFits = cache(async () =>
  timed("dashboard.topFits", async () => {
    const { supabase, dsoId } = await getViewer();
    return dsoId ? getTodaysTopFits(supabase, dsoId, 3) : [];
  })
);

// v3 Phase D — inbound mutual interest (candidates who saved your jobs).
export const getInterested = cache(async () =>
  timed("dashboard.interested", async () => {
    const { supabase, dsoId } = await getViewer();
    return dsoId ? getInterestedCandidates(supabase, dsoId, 6) : [];
  })
);

// #9c — credential expiry roll-up across hired/active candidates.
export const getCredentials = cache(async () =>
  timed("dashboard.credentials", async () => {
    const { supabase, dsoId } = await getViewer();
    return dsoId ? getExpiringCredentials(supabase, dsoId, 6) : [];
  })
);

/** LivePulse seed — recent apps (from the pipeline batch) + candidate
 *  names for the masked display map. */
export const getPulseData = cache(async () =>
  timed("dashboard.pulse", async () => {
    const { supabase, dsoId } = await getViewer();
    const [{ recentJobMap }, { recentApps }] = await Promise.all([
      getJobScope(),
      getPipeline(),
    ]);

    let recentCandMap = new Map<string, DashboardCandidate>();
    const candIds = Array.from(new Set(recentApps.map((a) => a.candidate_id)));
    if (dsoId && candIds.length > 0) {
      const { data: rawCands } = await supabase
        .from("candidates")
        .select("id, full_name")
        .in("id", candIds);
      const cands = (rawCands ?? []) as DashboardCandidate[];
      recentCandMap = new Map(cands.map((c) => [c.id, c]));
    }
    return { recentApps, recentJobMap, recentCandMap };
  })
);

// BOH Lane 2e — job health rows absorb the old leaderboard: velocity
// data (spark/thisWeek) plus the per-job funnel, days-open, and a health
// dot derived from the stuck/stale sets. Sorted by total active
// pipeline, busiest first.
export const getJobHealthRows = cache(async (): Promise<JobHealthRow[]> =>
  timed("dashboard.jobHealth", async () => {
    const { supabase } = await getViewer();
    const [{ jobs, jobIds }, pipeline] = await Promise.all([
      getJobScope(),
      getPipeline(),
    ]);
    if (jobIds.length === 0) return [];

    const nowMs = getNowMs();

    // ── Location chip data (Phase 4.7.c) ───────────────────────────
    // Pull job_locations + dso_locations so the list can show a
    // disambiguating chip ("Topeka", "Topeka +2", "5 locations") next
    // to the title. This fixes the case where two jobs have the same
    // title at different practices.
    const { data: rawJobLocs } = await supabase
      .from("job_locations")
      .select("job_id, location_id, dso_locations:dso_locations(id, name, city)")
      .in("job_id", jobIds);
    type JobLocRow = {
      job_id: string;
      location_id: string;
      dso_locations:
        | Array<{ id: string; name: string | null; city: string | null }>
        | { id: string; name: string | null; city: string | null }
        | null;
    };
    const jobLocMap = new Map<
      string,
      Array<{ city: string | null; name: string | null }>
    >();
    for (const row of (rawJobLocs ?? []) as unknown as JobLocRow[]) {
      const loc = Array.isArray(row.dso_locations)
        ? row.dso_locations[0] ?? null
        : row.dso_locations;
      if (!loc) continue;
      const arr = jobLocMap.get(row.job_id) ?? [];
      arr.push({ city: loc.city ?? null, name: loc.name ?? null });
      jobLocMap.set(row.job_id, arr);
    }
    const buildLocationLabel = (
      locs: Array<{ city: string | null; name: string | null }>
    ): string | null => {
      if (locs.length === 0) return null;
      // Prefer practice name (e.g. "67 Dental") over city — DSOs cluster
      // multiple practices in the same city, so city alone doesn't
      // disambiguate. Falls back to city when name is missing on the
      // location row (legacy/imported data).
      const primary = locs[0].name?.trim() || locs[0].city?.trim() || "Location";
      if (locs.length === 1) return primary;
      // For 2-3 locations, show "67 Dental +1" or "67 Dental +2".
      // For 4+, show "5 locations" — keeps the chip from blowing out.
      if (locs.length <= 3) return `${primary} +${locs.length - 1}`;
      return `${locs.length} locations`;
    };

    const HUMAN_EMP: Record<string, string> = {
      full_time: "Full-time",
      part_time: "Part-time",
      contract: "Contract",
      prn: "PRN",
      locum: "Locum",
    };

    return jobs
      .filter((j) => j.status === "active")
      .map((j): JobHealthRow => {
        const v = pipeline.perJobVelocity.get(j.id) ?? {
          spark: Array(7).fill(0),
          thisWeek: 0,
          lastWeek: 0,
        };
        const f = pipeline.perJobFunnel.get(j.id) ?? {
          open: 0,
          screen: 0,
          interview: 0,
          offer: 0,
        };
        return {
          id: j.id,
          title: j.title,
          subline: HUMAN_EMP[j.employment_type] ?? j.employment_type,
          locationLabel: buildLocationLabel(jobLocMap.get(j.id) ?? []),
          daysOpen: j.posted_at
            ? Math.max(
                0,
                Math.floor((nowMs - new Date(j.posted_at).getTime()) / 86400000)
              )
            : null,
          funnel: {
            open: f.open ?? 0,
            screen: f.screen ?? 0,
            interview: f.interview ?? 0,
            offer: f.offer ?? 0,
          },
          health: pipeline.staleJobIds.has(j.id)
            ? "hot"
            : pipeline.stuckJobIds.has(j.id)
              ? "warn"
              : "ok",
          spark: v.spark,
          thisWeek: v.thisWeek,
          href: `/employer/jobs/${j.id}`,
        };
      })
      .sort(
        (a, b) =>
          b.funnel.open +
          b.funnel.screen +
          b.funnel.interview +
          b.funnel.offer -
          (a.funnel.open + a.funnel.screen + a.funnel.interview + a.funnel.offer)
      )
      .slice(0, 8);
  })
);

// ── LocationPulse: locations + per-location application count ────
// We pull all locations (with coords) and counter-join applications
// via job_locations + applications. RLS scopes the application counts
// naturally, but `dso_locations` itself has a DSO-wide read policy — so
// an HM viewing the list would see locations they have no scope on
// (with 0 application counts). Filter to the HM's scoped location set
// when role = hiring_manager so the list matches the rest of their
// dashboard view.
export const getLocationPulseRows = cache(
  async (): Promise<MiniMapLocationRow[]> =>
    timed("dashboard.locationPulse", async () => {
      const { supabase, dsoId, dsoUser } = await getViewer();
      if (!dsoId) return [];

      let locationsQuery = supabase
        .from("dso_locations")
        .select("id, name, city, state, latitude, longitude")
        .eq("dso_id", dsoId);
      if (dsoUser?.role === "hiring_manager") {
        const ids = (await getHmScopeLocationIds()) ?? [];
        locationsQuery = locationsQuery.in(
          "id",
          ids.length > 0 ? ids : ["__none__"]
        );
      }
      const [{ data: rawLocations }, { jobIds }] = await Promise.all([
        locationsQuery,
        getJobScope(),
      ]);
      type LocRow = {
        id: string;
        name: string;
        city: string | null;
        state: string | null;
        latitude: number | null;
        longitude: number | null;
      };
      const locs = (rawLocations ?? []) as LocRow[];

      if (jobIds.length === 0 || locs.length === 0) {
        return locs.map((l) => ({
          id: l.id,
          name: l.name,
          city: l.city,
          state: l.state,
          latitude: l.latitude,
          longitude: l.longitude,
          applicationCount: 0,
        }));
      }

      const nowDate = new Date(getNowMs());
      const thirtyDaysAgo = new Date(
        Date.UTC(
          nowDate.getUTCFullYear(),
          nowDate.getUTCMonth(),
          nowDate.getUTCDate() - 30,
          0,
          0,
          0,
          0
        )
      );
      // Pull job→location links + 30d apps in parallel.
      const [jobLocsRes, miniMapAppsRes] = await Promise.all([
        supabase
          .from("job_locations")
          .select("job_id, location_id")
          .in("job_id", jobIds),
        supabase
          .from("applications")
          .select("job_id")
          .in("job_id", jobIds)
          .gte("created_at", thirtyDaysAgo.toISOString()),
      ]);

      type JLRow = { job_id: string; location_id: string };
      const jobToLocs = new Map<string, string[]>();
      for (const row of (jobLocsRes.data ?? []) as JLRow[]) {
        const arr = jobToLocs.get(row.job_id) ?? [];
        arr.push(row.location_id);
        jobToLocs.set(row.job_id, arr);
      }

      type MiniMapAppRow = { job_id: string };
      const locAppCount = new Map<string, number>();
      for (const ev of (miniMapAppsRes.data ?? []) as MiniMapAppRow[]) {
        const linked = jobToLocs.get(ev.job_id) ?? [];
        // Distribute equally across the job's locations — an app at a
        // multi-location job counts proportionally for each. That keeps
        // pin-size totals coherent with funnel totals.
        if (linked.length > 0) {
          const share = 1 / linked.length;
          for (const lid of linked) {
            locAppCount.set(lid, (locAppCount.get(lid) ?? 0) + share);
          }
        }
      }

      return locs.map((l) => ({
        id: l.id,
        name: l.name,
        city: l.city,
        state: l.state,
        latitude: l.latitude,
        longitude: l.longitude,
        applicationCount: Math.round(locAppCount.get(l.id) ?? 0),
      }));
    })
);
