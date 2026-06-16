/**
 * /employer/dashboard — operator landing page after sign-in.
 *
 * v3 layout (locked 2026-05-05):
 *
 *   Header                ← welcome, live pulse, today's date
 *   BillingBanner         ← unchanged
 *   KPI grid              ← navy hero (Awaiting Review) + 4 tonal tiles
 *   StuckAlert            ← conditional — only when SLA breached
 *   Quick actions strip   ← Post a job · Invite teammate · Add location
 *   PipelineFunnel        ← 5-stage funnel + conversion %, last 30d
 *   2-col: Leaderboard    ← top jobs by 7-day apps + sparklines
 *          MiniMap        ← application density across locations
 *   ActivityFeed          ← recent applications/stage moves
 *
 * Every tile, alert pill, leaderboard row, and activity event is a real
 * navigation destination — the dashboard is a launchpad, not a museum.
 *
 * "Applications This Week" uses date_trunc('week', now()) semantics — i.e.
 * a Monday-anchored UTC week — so the tile resets every Monday.
 */

import Link from "next/link";
import {
  ArrowRight,
  ArrowRightCircle,
  Briefcase,
  Clock,
  Mail,
  MapPin,
  Plus,
  UserPlus,
} from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
// BOH Lane 2c — HelpDisclosure + HeroKpiTile retired from this page
// (About box → help center + ? launcher; hero → slim KPI strip).
import { OnboardingChecklist } from "@/components/onboarding/onboarding-checklist";
import { BillingBanner } from "@/components/employer/billing-banner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscriptionAnyStatus } from "@/lib/billing/subscription";
import { getActiveLocationId } from "@/lib/employer/active-location";
import {
  KANBAN_KINDS,
  KIND_DEFAULT_LABELS,
  type StageKind,
} from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { KpiTile } from "@/components/dashboard/kpi-tile";
// BOH Lane 2d — ActivityFeed retired from this page (the LivePulse rail
// supersedes it, seeded from the same data + kept live via realtime).
import { LivePulse } from "./live-pulse";
// BOH Lane 2a — StuckAlert + StalePipelineAlert are superseded by the
// Next Best Actions queue (their data feeds it; components kept on disk
// for surgical revert).
import { NextBestActions } from "./next-best-actions";
import { buildGreeting } from "@/lib/dashboard/greeting";
import { buildNextBestActions } from "@/lib/dashboard/next-best-actions";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
// BOH Lane 2e — JobLeaderboard absorbed into JobHealth (velocity spark +
// funnel + freshness per opening, Model 01's job-health band).
import {
  JobHealth,
  type JobHealthRow,
} from "@/components/dashboard/job-health";
// Density mini-map retired (Day 32 — "just a blob"); ranked list instead.
import { LocationPulse } from "@/components/dashboard/location-pulse";
import { TodaysTopFits } from "@/components/dashboard/todays-top-fits";
import { getTodaysTopFits } from "@/lib/talent-pool/smart-picks";
import { InterestedInYou } from "@/components/dashboard/interested-in-you";
import { getInterestedCandidates } from "@/lib/talent-pool/mutual-interest";
import { CredentialsExpiring } from "@/components/dashboard/credentials-expiring";
import { getExpiringCredentials } from "@/lib/credentials/expiring-credentials";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

// SLA threshold for stuck-candidate alerts. Pulled out as a constant so
// future config UI can override it per-DSO without touching the page.
const STUCK_SLA_DAYS = 5;

// E3.24 — days a candidate can sit in a mid-pipeline stage (screen /
// interview / offer) before the dashboard flags them as stale. Matches
// the weekly-digest threshold so the two surfaces agree.
const STALE_STAGE_DAYS = 14;

export default async function EmployerDashboard() {
  // Snapshot the request timestamp once. Server-component-safe and gives
  // us a stable "now" across every relative-time computation on the page.
  const nowMs = new Date().getTime();
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

  // For hiring managers, resolve their scoped locations so we can render
  // a persistent context bar at the top of the dashboard. Two-query
  // pattern (same as /employer/team/page.tsx) — sidesteps any embedded
  // FK-relationship-naming surprises and is plenty fast at our row volume.
  let hmScopeLocations: Array<{ name: string; state: string | null }> = [];
  if (dsoUser?.role === "hiring_manager") {
    const { data: scopeRows } = await supabase
      .from("dso_user_locations")
      .select("dso_location_id")
      .eq("dso_user_id", dsoUser.id as string);
    const scopeLocationIds = ((scopeRows ?? []) as Array<{
      dso_location_id: string;
    }>).map((r) => r.dso_location_id);
    if (scopeLocationIds.length > 0) {
      const { data: locRows } = await supabase
        .from("dso_locations")
        .select("name, state")
        .in("id", scopeLocationIds);
      hmScopeLocations = ((locRows ?? []) as Array<{
        name: string;
        state: string | null;
      }>);
    }
  }

  const dsoId = dsoUser?.dso_id;

  const { data: dso } = dsoId
    ? await supabase
        .from("dsos")
        .select("id, name, slug, status")
        .eq("id", dsoId)
        .maybeSingle()
    : { data: null };

  const { count: locationsCount } = await supabase
    .from("dso_locations")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "");

  const { count: teamCount } = await supabase
    .from("dso_users")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "");

  const { count: jobsCount } = await supabase
    .from("jobs")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "");

  const { count: customAutomationCount } = await supabase
    .from("automation_rules")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "")
    .eq("is_system", false);

  const subscription = dsoId
    ? await getSubscriptionAnyStatus(supabase, dsoId)
    : null;

  // v3 Phase C — "Today's top fits" cross-job roll-up. Cache-aware
  // (practice_fit_scores); identity masking handled upstream. Hiring managers
  // see it too — it's read-only discovery.
  const todaysTopFits = dsoId
    ? await getTodaysTopFits(supabase, dsoId, 3)
    : [];

  // v3 Phase D — inbound mutual interest (candidates who saved your jobs).
  const interestedCandidates = dsoId
    ? await getInterestedCandidates(supabase, dsoId, 6)
    : [];

  // #9c — credential expiry roll-up across hired/active candidates.
  const expiringCredentials = dsoId
    ? await getExpiringCredentials(supabase, dsoId, 6)
    : [];

  // ── KPI scaffolding ────────────────────────────────────────────────
  let openJobsCount = 0;
  let appsThisWeekCount = 0;
  let awaitingReviewCount = 0;
  let appsLast7Days: number[] = [];
  let appsWeekOverWeekDelta = 0;
  let oldestAwaitingDays: number | null = null;

  // ── Stuck-candidates scaffolding ───────────────────────────────────
  type StuckCandidateRow = {
    applicationId: string;
    candidateName: string;
    jobTitle: string;
    locationName: string | null;
    daysWaiting: number;
  };
  let stuckCandidates: StuckCandidateRow[] = [];
  let stuckTotalCount = 0;

  // ── E3.24 stale-in-pipeline scaffolding ────────────────────────────
  // Distinct from "stuck" (un-reviewed NEW apps, by created_at). "Stale"
  // = candidates parked in a mid-pipeline stage (screen/interview/offer)
  // past STALE_STAGE_DAYS, keyed on stage_entered_at. Mirrors the weekly
  // digest's stale logic but surfaces it live in-app.
  type StaleCandidateRow = StuckCandidateRow & { stageLabel: string };
  let staleCandidates: StaleCandidateRow[] = [];
  let staleTotalCount = 0;

  // ── BOH Lane 2b — median time-to-fill (trailing 90d) scaffolding ──
  // Same definition as lib/analytics/hub-metrics (the source of truth):
  // a fill = application whose CURRENT stage kind is "hired" with hired_at
  // in the window; TTF = hired_at − job.posted_at in days, negatives
  // dropped. The hired rows also feed a free 7-day hires sparkline.
  let ttfMedianDays: number | null = null;
  let ttfFillCount = 0;
  let hiresLast7Days: number[] = [];

  // ── BOH Lane 2c — offers out (sent, no candidate response yet) ──
  let offersOutCount = 0;

  // ── BOH Lane 2e — job-health scaffolding (per-job funnel from the
  // funnel rows + health dots from the stuck/stale row sets) ──
  const perJobFunnel = new Map<string, Record<string, number>>();
  const stuckJobIds = new Set<string>();
  const staleJobIds = new Set<string>();
  let jobHealthRows: JobHealthRow[] = [];

  // ── Pipeline funnel scaffolding (counts of CURRENT stage kind, last 30
  // days of submissions). v1: kind-snapshot funnel. A flow-based funnel
  // would require querying application_status_events. ───────────────
  const stage30dCounts: Record<(typeof KANBAN_KINDS)[number], number> = {
    open: 0,
    screen: 0,
    interview: 0,
    offer: 0,
    hired: 0,
  };
  let stageStripCounts: Array<{ key: string; label: string; count: number }> =
    [];

  // ── Per-job velocity leaderboard scaffolding ───────────────────────

  // ── Mini-map scaffolding ───────────────────────────────────────────
  type MiniMapLocationRow = {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    latitude: number | null;
    longitude: number | null;
    applicationCount: number;
  };
  let miniMapLocations: MiniMapLocationRow[] = [];

  // ── Recent activity scaffolding (unchanged from v2) ────────────────
  type DashboardJob = { id: string; title: string };
  type DashboardApp = {
    id: string;
    job_id: string;
    candidate_id: string;
    /** Stage kind resolved from the embedded stage row. */
    kind: StageKind;
    created_at: string;
  };
  type DashboardCandidate = {
    id: string;
    full_name: string | null;
  };
  let recentApps: DashboardApp[] = [];
  let recentJobMap = new Map<string, DashboardJob>();
  let recentCandMap = new Map<string, DashboardCandidate>();

  if (dsoId) {
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
    // scope the application counts; the "open jobs" tile filters in JS.
    let jobsQuery = supabase
      .from("jobs")
      .select(
        "id, title, status, role_category, employment_type, applications_count, posted_at",
      )
      .eq("dso_id", dsoId)
      .is("deleted_at", null);
    if (locationFilteredJobIds !== null) {
      jobsQuery = jobsQuery.in(
        "id",
        locationFilteredJobIds.length > 0
          ? locationFilteredJobIds
          : ["__none__"],
      );
    }
    const { data: rawJobs } = await jobsQuery;
    type JobWithStatus = DashboardJob & {
      status: string;
      role_category: string;
      employment_type: string;
      applications_count: number;
      posted_at: string | null;
    };
    const jobs = (rawJobs ?? []) as JobWithStatus[];
    recentJobMap = new Map(
      jobs.map((j) => [j.id, { id: j.id, title: j.title }]),
    );
    const jobIds = jobs.map((j) => j.id);

    openJobsCount = jobs.filter((j) => j.status === "active").length;

    if (jobIds.length > 0) {
      // Resolve the DSO's open-kind stage row ids — the "Awaiting Review"
      // tile + stuck-candidate lookup filter on stage_id (head:true
      // counts can't reliably embed-filter via the join).
      const { data: openStageRows } = await supabase
        .from("dso_pipeline_stages")
        .select("id")
        .eq("dso_id", dsoId)
        .eq("kind", "open");
      const openStageIds = ((openStageRows ?? []) as Array<{ id: string }>).map(
        (r) => r.id
      );
      const openStageIdsForFilter =
        openStageIds.length > 0 ? openStageIds : ["__none__"];

      // E3.24 — resolve mid-pipeline stage ids + labels for the stale
      // lookup. We surface the actual per-DSO label (e.g. "Phone Screening")
      // so the alert reads in the customer's own pipeline vocabulary.
      const { data: midStageRows } = await supabase
        .from("dso_pipeline_stages")
        .select("id, kind, label")
        .eq("dso_id", dsoId)
        .in("kind", ["screen", "interview", "offer"]);
      const midStageIds = ((midStageRows ?? []) as Array<{ id: string }>).map(
        (r) => r.id
      );
      const midStageIdsForFilter =
        midStageIds.length > 0 ? midStageIds : ["__none__"];
      const midStageLabelById = new Map<string, string>(
        ((midStageRows ?? []) as Array<{
          id: string;
          kind: string;
          label: string | null;
        }>).map((r) => [r.id, r.label ?? r.kind])
      );

      // ── Date math ──────────────────────────────────────────────────
      const now = new Date();
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
          0,
        ),
      );
      const fourteenDaysAgo = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - 13,
          0,
          0,
          0,
          0,
        ),
      );
      const thirtyDaysAgo = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - 30,
          0,
          0,
          0,
          0,
        ),
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
            "id, job_id, created_at, candidate_id, candidate:candidates(full_name)",
          )
          .in("job_id", jobIds)
          .in("stage_id", openStageIdsForFilter)
          .lte(
            "created_at",
            new Date(
              nowMs - STUCK_SLA_DAYS * 86400000,
            ).toISOString(),
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

      appsThisWeekCount = appsThisWeekRes.count ?? 0;
      awaitingReviewCount = awaitingReviewRes.count ?? 0;
      recentApps = ((recentAppsRes.data ?? []) as unknown as Array<
        Record<string, unknown>
      >).map((row): DashboardApp => {
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
        now.getUTCDate(),
      );
      for (const row of (last14DaysRes.data ?? []) as Array<{
        created_at: string;
      }>) {
        const t = new Date(row.created_at);
        const dayUtc = Date.UTC(
          t.getUTCFullYear(),
          t.getUTCMonth(),
          t.getUTCDate(),
        );
        const daysAgo = Math.floor((todayUtc - dayUtc) / 86400000);
        const idx = 13 - daysAgo;
        if (idx >= 0 && idx < 14) buckets[idx] += 1;
      }
      appsLast7Days = buckets.slice(7);
      const thisWeekTotal = buckets.slice(7).reduce((a, b) => a + b, 0);
      const lastWeekTotal = buckets.slice(0, 7).reduce((a, b) => a + b, 0);
      appsWeekOverWeekDelta = thisWeekTotal - lastWeekTotal;

      // ── Stuck candidates ─────────────────────────────────────────
      // Supabase types embedded relations as arrays — even one-to-one ones.
      // We pick the first (and only) candidate row from the join.
      type StuckRow = {
        id: string;
        job_id: string;
        created_at: string;
        candidate_id: string;
        candidate: Array<{ full_name: string | null }> | { full_name: string | null } | null;
      };
      const stuckRaw = (stuckRes.data ?? []) as unknown as StuckRow[];
      stuckTotalCount = stuckRaw.length;
      for (const r of stuckRaw) stuckJobIds.add(r.job_id); // Lane 2e health
      stuckCandidates = stuckRaw.slice(0, 3).map((row) => {
        const job = recentJobMap.get(row.job_id);
        const days = Math.max(
          0,
          Math.floor(
            (nowMs - new Date(row.created_at).getTime()) / 86400000,
          ),
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
      const staleRaw = (staleRes.data ?? []) as unknown as StaleRow[];
      staleTotalCount = staleRaw.length;
      for (const r of staleRaw) staleJobIds.add(r.job_id); // Lane 2e health
      staleCandidates = staleRaw.slice(0, 3).map((row) => {
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

      // ── BOH Lane 2b — median time-to-fill, trailing 90 days ──────
      // One focused query (hub-metrics' full overview is too heavy for
      // the dashboard). Location-scoped like every other tile.
      {
        let ttfQuery = supabase
          .from("applications")
          .select(
            "hired_at, job_id, stage:dso_pipeline_stages!stage_id(kind), job:jobs!inner(posted_at, dso_id)"
          )
          .eq("job.dso_id", dsoId)
          .not("hired_at", "is", null)
          .gte(
            "hired_at",
            new Date(nowMs - 90 * 86400000).toISOString()
          );
        if (locationFilteredJobIds !== null) {
          ttfQuery = ttfQuery.in(
            "job_id",
            locationFilteredJobIds.length > 0
              ? locationFilteredJobIds
              : ["__none__"]
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
        const ttfDays: number[] = [];
        const hiresBuckets = Array.from({ length: 7 }, () => 0);
        for (const row of (ttfRows ?? []) as unknown as TtfRow[]) {
          const stageRel = Array.isArray(row.stage)
            ? row.stage[0] ?? null
            : row.stage;
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
            sorted.length % 2 === 1
              ? sorted[mid]
              : (sorted[mid - 1] + sorted[mid]) / 2
          );
        }
        hiresLast7Days = hiresBuckets;
      }

      // ── BOH Lane 2c — offers out: sends in the last 60 days with no
      // candidate response on file. Location-scoped in JS via the
      // embedded application.job_id (nested .in() isn't expressible).
      {
        const { data: sendRows } = await supabase
          .from("application_offer_sends")
          .select(
            "id, application:applications!inner(job_id, job:jobs!inner(dso_id))"
          )
          .eq("application.job.dso_id", dsoId)
          .gte("sent_at", new Date(nowMs - 60 * 86400000).toISOString());
        type SendRow = {
          id: string;
          application:
            | { job_id: string }
            | Array<{ job_id: string }>
            | null;
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
        if (sends.length > 0) {
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
          offersOutCount = sends.filter((s) => !responded.has(s.id)).length;
        }
      }

      // ── Pipeline funnel ──────────────────────────────────────────
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
      // Hero stage strip — same data, different shape.
      stageStripCounts = [
        { key: "open", label: "New", count: stage30dCounts.open },
        {
          key: "screen",
          label: "Screening",
          count: stage30dCounts.screen,
        },
        {
          key: "interview",
          label: "Interview",
          count: stage30dCounts.interview,
        },
        { key: "offer", label: "Offer", count: stage30dCounts.offer },
      ];

      // ── Per-job leaderboard ──────────────────────────────────────
      type LbAppRow = { job_id: string; created_at: string };
      const lbApps = (leaderboard14dRes.data ?? []) as LbAppRow[];
      const perJob = new Map<
        string,
        { spark: number[]; thisWeek: number; lastWeek: number }
      >();
      for (const id of jobIds) {
        perJob.set(id, {
          spark: Array(7).fill(0),
          thisWeek: 0,
          lastWeek: 0,
        });
      }
      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      for (const ev of lbApps) {
        const v = perJob.get(ev.job_id);
        if (!v) continue;
        const created = new Date(ev.created_at);
        created.setHours(0, 0, 0, 0);
        const daysAgo = Math.round(
          (todayMidnight.getTime() - created.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (daysAgo >= 0 && daysAgo < 7) {
          v.spark[6 - daysAgo] += 1;
          v.thisWeek += 1;
        } else if (daysAgo >= 7 && daysAgo < 14) {
          v.lastWeek += 1;
        }
      }
      const HUMAN_EMP: Record<string, string> = {
        full_time: "Full-time",
        part_time: "Part-time",
        contract: "Contract",
        prn: "PRN",
        locum: "Locum",
      };

      // ── Location chip data (Phase 4.7.c) ───────────────────────────
      // Pull job_locations + dso_locations so the leaderboard can show a
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
      const jobLocMap = new Map<string, Array<{ city: string | null; name: string | null }>>();
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
        locs: Array<{ city: string | null; name: string | null }>,
      ): string | null => {
        if (locs.length === 0) return null;
        // Prefer practice name (e.g. "67 Dental") over city — DSOs cluster
        // multiple practices in the same city, so city alone doesn't
        // disambiguate. Falls back to city when name is missing on the
        // location row (legacy/imported data).
        const primary =
          locs[0].name?.trim() || locs[0].city?.trim() || "Location";
        if (locs.length === 1) return primary;
        // For 2-3 locations, show "67 Dental +1" or "67 Dental +2".
        // For 4+, show "5 locations" — keeps the chip from blowing out.
        if (locs.length <= 3) return `${primary} +${locs.length - 1}`;
        return `${locs.length} locations`;
      };

      // BOH Lane 2e — job health rows absorb the leaderboard: same
      // velocity data (spark/thisWeek from perJob) plus the per-job
      // funnel, days-open, and a health dot derived from the stuck/stale
      // sets. Sorted by total active pipeline, busiest first.
      jobHealthRows = jobs
        .filter((j) => j.status === "active")
        .map((j): JobHealthRow => {
          const v = perJob.get(j.id) ?? {
            spark: Array(7).fill(0),
            thisWeek: 0,
            lastWeek: 0,
          };
          const f = perJobFunnel.get(j.id) ?? {
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
                  Math.floor(
                    (nowMs - new Date(j.posted_at).getTime()) / 86400000
                  )
                )
              : null,
            funnel: {
              open: f.open ?? 0,
              screen: f.screen ?? 0,
              interview: f.interview ?? 0,
              offer: f.offer ?? 0,
            },
            health: staleJobIds.has(j.id)
              ? "hot"
              : stuckJobIds.has(j.id)
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
            (a.funnel.open +
              a.funnel.screen +
              a.funnel.interview +
              a.funnel.offer)
        )
        .slice(0, 8);
    }

    // ── Mini-map: locations + per-location application count ────────
    // We pull all locations (with coords) and counter-join applications
    // via job_locations + applications. RLS scopes the application
    // counts naturally, but `dso_locations` itself has a DSO-wide read
    // policy — so an HM viewing the map would see pins for locations
    // they have no scope on (with 0 application counts). Filter to the
    // HM's scoped location set when role = hiring_manager so the map
    // matches the rest of their dashboard view.
    let locationsQuery = supabase
      .from("dso_locations")
      .select("id, name, city, state, latitude, longitude")
      .eq("dso_id", dsoId);
    if (dsoUser?.role === "hiring_manager") {
      const { data: scopeRows2 } = await supabase
        .from("dso_user_locations")
        .select("dso_location_id")
        .eq("dso_user_id", dsoUser.id as string);
      const ids = ((scopeRows2 ?? []) as Array<{ dso_location_id: string }>).map(
        (r) => r.dso_location_id
      );
      locationsQuery = locationsQuery.in(
        "id",
        ids.length > 0 ? ids : ["__none__"]
      );
    }
    const { data: rawLocations } = await locationsQuery;
    type LocRow = {
      id: string;
      name: string;
      city: string | null;
      state: string | null;
      latitude: number | null;
      longitude: number | null;
    };
    const locs = (rawLocations ?? []) as LocRow[];

    // Pull job_locations for our jobs to map application_count per location.
    if (jobIds.length > 0 && locs.length > 0) {
      const thirtyDaysAgo = new Date(
        Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() - 30,
          0,
          0,
          0,
          0,
        ),
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

      miniMapLocations = locs.map((l) => ({
        id: l.id,
        name: l.name,
        city: l.city,
        state: l.state,
        latitude: l.latitude,
        longitude: l.longitude,
        applicationCount: Math.round(locAppCount.get(l.id) ?? 0),
      }));
    } else {
      miniMapLocations = locs.map((l) => ({
        id: l.id,
        name: l.name,
        city: l.city,
        state: l.state,
        latitude: l.latitude,
        longitude: l.longitude,
        applicationCount: 0,
      }));
    }

    // ── Candidate names for activity feed ────────────────────────────
    const candIds = Array.from(
      new Set(recentApps.map((a) => a.candidate_id)),
    );
    if (candIds.length > 0) {
      const { data: rawCands } = await supabase
        .from("candidates")
        .select("id, full_name")
        .in("id", candIds);
      const cands = (rawCands ?? []) as DashboardCandidate[];
      recentCandMap = new Map(cands.map((c) => [c.id, c]));
    }
  }

  // Stage strip max — used to scale bar widths inside the hero.
  const stageStripMax = Math.max(
    ...stageStripCounts.map((s) => s.count),
    1,
  );

  // Hint for the hero tile — adapts based on whether anything is awaiting.
  // The oldest-waiting detail now lives in the SLA chip next to the value, so
  // the hint no longer repeats the day count.
  const heroHint =
    awaitingReviewCount === 0
      ? "Inbox is clear. New applications will appear here in real time as candidates apply."
      : "Clear the queue to keep candidates moving — each one is a real applicant waiting on you.";

  // SLA chip — the queue's decision-driving secondary stat. Replaces the old
  // applications-volume sparkline (which plotted a different metric than the
  // count and so misled). Tone flips to "breach" once the oldest item is past
  // the same SLA the StuckAlert uses.
  const heroSlaChip:
    | { label: string; tone: "ok" | "breach" }
    | undefined =
    awaitingReviewCount > 0 && oldestAwaitingDays !== null
      ? {
          label:
            oldestAwaitingDays >= STUCK_SLA_DAYS
              ? `oldest waiting ${oldestAwaitingDays}d · past your ${STUCK_SLA_DAYS}-day response goal`
              : `oldest waiting ${oldestAwaitingDays}d`,
          tone: oldestAwaitingDays >= STUCK_SLA_DAYS ? "breach" : "ok",
        }
      : undefined;

  // Today's date stamp for the eyebrow row.
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const isDsoAdmin = dsoUser?.role === "owner" || dsoUser?.role === "admin";
  const employerOnboardingItems = [
    {
      key: "job",
      label: "Post your first job",
      done: (jobsCount ?? 0) > 0,
      href: "/employer/jobs/new",
    },
    {
      key: "loc",
      label: "Add a practice location",
      done: (locationsCount ?? 0) > 0,
      href: "/employer/locations",
    },
    ...(isDsoAdmin
      ? [
          {
            key: "team",
            label: "Invite a teammate",
            done: (teamCount ?? 0) > 1,
            href: "/employer/team",
          },
          {
            key: "auto",
            label: "Set up an automation to save time",
            done: (customAutomationCount ?? 0) > 0,
            href: "/employer/automations",
          },
        ]
      : []),
  ];

  // BOH Lane 2d — seed the live pulse from the same recent-applications
  // data the old Recent Activity section rendered. Names are masked HERE
  // via candidateDisplayName before anything reaches the client; the
  // lookup maps let realtime events resolve friendly copy without ever
  // fetching names client-side.
  const pulseCandidateNames: Record<string, string> = {};
  for (const [id, cand] of recentCandMap) {
    pulseCandidateNames[id] = candidateDisplayName({
      fullName: cand.full_name,
      candidateId: id,
    });
  }
  const pulseJobTitles: Record<string, string> = {};
  for (const [id, job] of recentJobMap) {
    pulseJobTitles[id] = job.title;
  }
  const pulseSeed = recentApps.slice(0, 7).map((app) => {
    const name = pulseCandidateNames[app.candidate_id] ?? "A candidate";
    const job = recentJobMap.get(app.job_id);
    const stageLabel = KIND_DEFAULT_LABELS[app.kind] ?? app.kind;
    return {
      id: `seed-${app.id}`,
      kind: "app" as const,
      text: `${name} applied — ${job?.title ?? "a role"}${app.kind !== "open" ? ` · now in ${stageLabel}` : ""}`,
      ago: relativeDate(app.created_at, nowMs),
      href: `/employer/applications/${app.id}`,
    };
  });

  // BOH Lane 2a — unify the attention signals into the ranked queue.
  // Anonymity rule applied HERE (mask before the pure lib ever sees a
  // name): same `anonymized` flag Today's Top Fits renders with.
  const bestFit = todaysTopFits[0] ?? null;
  const nbaItems = buildNextBestActions({
    stuck: stuckCandidates,
    stuckTotal: stuckTotalCount,
    slaDays: STUCK_SLA_DAYS,
    stale: staleCandidates,
    staleTotal: staleTotalCount,
    staleDays: STALE_STAGE_DAYS,
    topFit: bestFit
      ? {
          name: bestFit.anonymized
            ? "An anonymous candidate"
            : (bestFit.full_name ?? "A candidate"),
          jobTitle: bestFit.best_job_title,
          score: bestFit.fit.score,
          interested: bestFit.interested,
        }
      : null,
    interestedCount: interestedCandidates.length,
  });

  return (
    <EmployerShell active="dashboard">
      {/* BOH Lane 2c (Model 01, full-refresh doctrine) — the compact
          mission-control greeting bar replaces the tall welcome block.
          Open Jobs lives here as a live chip (the KPI strip below holds
          the four hiring numbers). The "About your dashboard" inline
          disclosure is retired — the entry remains in /employer/help and
          the ? assistant. No time-of-day greeting: the server renders in
          UTC and we don't fake local time. */}
      <header className="mb-7">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-[-0.6px] leading-snug text-ink">
              {/* Reactive greeting (Cam, Day 32) — leads with the most
                  newsworthy TRUE fact from data this page already
                  loaded. Pure function, zero extra queries. */}
              {buildGreeting({
                firstName: dsoUser?.full_name?.split(" ")[0] ?? "there",
                awaitingReview: awaitingReviewCount,
                slaBreached: heroSlaChip?.tone === "breach",
                appsThisWeek: appsThisWeekCount,
                hiresThisWeek: hiresLast7Days.reduce((a, b) => a + b, 0),
                offersOut: offersOutCount,
                stalledCount: stuckTotalCount + staleTotalCount,
                daySeed: Math.floor(Date.now() / 86400000),
              })}
            </h1>
            <div className="mt-2 flex items-center gap-3.5 flex-wrap text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
              <span className="inline-flex items-center gap-2 text-heritage-deep">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-heritage opacity-75 animate-ping" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
                </span>
                {dso?.status === "active" ? "Active" : "Onboarding"}
              </span>
              <span className="border-l border-rule pl-3.5">{dateLabel}</span>
              <span className="inline-flex items-center gap-1.5 border-l border-rule pl-3.5 text-ink">
                <Briefcase className="size-3" />
                {openJobsCount} {openJobsCount === 1 ? "job" : "jobs"} live
              </span>
              <span className="border-l border-rule pl-3.5">{dso?.name}</span>
            </div>
          </div>
          {dsoUser?.role !== "hiring_manager" && (
            <Link
              href="/employer/jobs/new"
              className="inline-flex items-center gap-2 px-5 py-3 bg-heritage text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-heritage-deep transition-colors shrink-0"
            >
              <Plus className="size-4" strokeWidth={2.5} />
              Post a job
            </Link>
          )}
        </div>
      </header>

      {dsoUser?.role !== "hiring_manager" && (
        <div className="mb-8">
          <OnboardingChecklist
            title="Get started"
            subtitle="Knock these out to get your hiring running — you can do them in any order."
            storageKey="employer-onboarding-checklist-v1"
            items={employerOnboardingItems}
          />
        </div>
      )}

      {dsoUser?.role === "hiring_manager" && (
        <HmScopeContextBar locations={hmScopeLocations} />
      )}

      <BillingBanner subscription={subscription} />

      {/* BOH Lane 2c (Model 01) — the slim four-KPI sparkline strip
          replaces the hero+2×2 grid. Awaiting Review keeps its SLA chip
          as hint; the hero's pipeline stage-strip retires in favor of the
          PipelineFunnel section below (same data, one home); Open Jobs
          moved to the greeting bar. No "Interviews this week" until real
          scheduling data exists — no invented numbers. */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
        <KpiTile
          icon={Mail}
          tone="navy"
          value={String(awaitingReviewCount)}
          label="Awaiting Review"
          hint={heroSlaChip ? heroSlaChip.label : heroHint}
          trendIntent={
            heroSlaChip?.tone === "breach" ? "negative" : "neutral"
          }
          spark={appsLast7Days.some((v) => v > 0) ? appsLast7Days : undefined}
          href="/employer/applications?status=open&sort=oldest"
          routeLabel="Review new applications"
        />

        <KpiTile
          icon={ArrowRightCircle}
          value={String(appsThisWeekCount)}
          label="Apps This Week"
          hint={
            appsThisWeekCount > 0
              ? "Since Monday"
              : "Share the job board to drive traffic"
          }
          spark={appsLast7Days.some((v) => v > 0) ? appsLast7Days : undefined}
          delta={appsWeekOverWeekDelta}
          deltaLabel="vs last week"
          href="/employer/applications"
          routeLabel="View applications"
        />

        {/* BOH Lane 2c — Offers Out (sent, awaiting candidate response).
            The Hires number lives on in the TTF tile's hint + the funnel. */}
        <KpiTile
          icon={UserPlus}
          value={String(offersOutCount)}
          label="Offers Out"
          hint={
            offersOutCount > 0
              ? "Awaiting candidate response"
              : "Sent offers awaiting reply show here"
          }
          href="/employer/offer-approvals"
          routeLabel="View offers"
        />

        {/* BOH Lane 2b (Model 01, Cam pick) — median time-to-fill. Same
            fill definition as the analytics hub; spark = fills last 7d. */}
        <KpiTile
          icon={Clock}
          value={ttfMedianDays != null ? `${ttfMedianDays}d` : "—"}
          label="Time To Fill · 90d"
          hint={
            ttfMedianDays != null
              ? `Median across ${ttfFillCount} ${ttfFillCount === 1 ? "fill" : "fills"} · posting → hire`
              : "Measures posting → hire once roles fill"
          }
          spark={
            hiresLast7Days.some((v) => v > 0) ? hiresLast7Days : undefined
          }
          href="/employer/analytics"
          routeLabel="View analytics"
        />
      </section>

      {/* BOH Lane 2a+2d (Model 01) — queue + live pulse side by side.
          The queue (j/k + Enter triage) supersedes the alert banners; the
          pulse supersedes the bottom Recent Activity section, seeded from
          the same data and kept live by realtime INSERT subscriptions.
          Stacks to one column below lg. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-6 items-start">
        <NextBestActions items={nbaItems} />
        <LivePulse
          initialEvents={pulseSeed}
          jobTitles={pulseJobTitles}
          candidateNames={pulseCandidateNames}
        />
      </div>

      {/* Onboarding nudge — only when no locations on file. */}
      {(locationsCount ?? 0) === 0 && (
        <section className="mb-6 p-7 sm:p-8 bg-ink text-ivory border-l-4 border-heritage">
          <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-heritage mb-3">
            Finish Onboarding
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.6px] leading-tight mb-3">
            Add your first practice location to start posting jobs.
          </h2>
          <p className="text-[14px] text-ivory/70 leading-relaxed max-w-[560px] mb-6">
            DSO Hire posts jobs across your locations in one flow. We need
            at least one location to enable job posting.
          </p>
          <Link
            href="/employer/onboarding"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-heritage text-ivory text-[12px] font-extrabold tracking-[1.8px] uppercase hover:bg-heritage-deep transition-colors"
          >
            Continue Onboarding
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Quick action command strip — Post a job · Invite teammate · Add location.
          Hidden for hiring managers (who can't post or invite). */}
      {dsoUser?.role !== "hiring_manager" && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
          <CommandTile
            href="/employer/jobs/new"
            icon={Plus}
            title="Post a job"
            meta="Multi-location in one flow"
          />
          <CommandTile
            href="/employer/team"
            icon={UserPlus}
            title="Invite a teammate"
            meta="Owner · Admin · Recruiter · HM"
          />
          <CommandTile
            href="/employer/locations"
            icon={MapPin}
            title={(locationsCount ?? 0) === 0 ? "Add a location" : "Manage locations"}
            meta={
              (locationsCount ?? 0) === 0
                ? "Each location lights up the map"
                : `${locationsCount} on file · ${teamCount ?? 1} on the team`
            }
          />
        </section>
      )}

      {/* v3 Phase D — inbound interest (candidates who saved your jobs) — a
          warmer signal than an algorithmic pick, so it leads. Renders nothing
          when nobody's saved a job yet. */}
      <div id="interested-in-you" className="scroll-mt-24">
        <InterestedInYou candidates={interestedCandidates} />
      </div>

      {/* v3 Phase C — Today's top fits (cross-job PracticeFit roll-up).
          Renders nothing when there are no scored fits yet. */}
      <TodaysTopFits fits={todaysTopFits} />

      {/* #9c — credential expiry roll-up (hired/active). Renders nothing when
          nothing is expired or expiring soon. */}
      <div id="credentials-expiring" className="scroll-mt-24 mb-6">
        <CredentialsExpiring items={expiringCredentials} />
      </div>

      {/* Pipeline funnel — full-width. */}
      <section className="mb-6">
        <PipelineFunnel
          stageCounts={{
            submitted:
              stage30dCounts.open +
              stage30dCounts.screen +
              stage30dCounts.interview +
              stage30dCounts.offer +
              stage30dCounts.hired,
            reviewed:
              stage30dCounts.screen +
              stage30dCounts.interview +
              stage30dCounts.offer +
              stage30dCounts.hired,
            interview:
              stage30dCounts.interview +
              stage30dCounts.offer +
              stage30dCounts.hired,
            offer: stage30dCounts.offer + stage30dCounts.hired,
            hired: stage30dCounts.hired,
          }}
          windowLabel="Last 30 days"
          medianTimeToHireDays={null}
          href="/employer/applications"
        />
      </section>

      {/* Two-column row — Job health (Lane 2e) + ranked location list
          (replaces the density-map blob; component kept on disk). */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mb-6 items-start">
        <JobHealth rows={jobHealthRows} viewAllHref="/employer/pipeline" />
        <LocationPulse
          locations={miniMapLocations}
          href="/employer/locations"
        />
      </section>

    </EmployerShell>
  );
}

/**
 * Format an ISO date as a casual relative time
 * ("2h ago", "yesterday", "Mar 12"). Used by the activity feed.
 *
 * Takes `nowMs` as a parameter rather than calling `Date.now()` so the
 * caller can pass the request-snapshot timestamp captured at the top of
 * the server component. Keeps "now" stable across the page render.
 */
function relativeDate(iso: string, nowMs: number): string {
  const ms = nowMs - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/* ───── Local Quick-actions command tile ───── */

function CommandTile({
  href,
  icon: Icon,
  title,
  meta,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="group bg-white p-5 sm:p-6 flex items-center gap-4 hover:bg-ivory-deep transition-colors"
    >
      <div className="h-9 w-9 bg-ink text-ivory flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-extrabold text-ink tracking-[-0.2px]">
          {title}
        </div>
        <div className="text-[11px] text-slate-meta mt-0.5">{meta}</div>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage group-hover:translate-x-1 transition-all flex-shrink-0" />
    </Link>
  );
}

/**
 * Persistent scope-context bar for hiring managers — sits at the top of
 * the dashboard so an HM always knows which locations the data on this
 * page is scoped to. Trust signal + sales-demo answer to "will my
 * dentist owner see her competitor's candidates?" — no, scoped to her
 * practice only, and the product literally tells her so.
 */
function HmScopeContextBar({
  locations,
}: {
  locations: Array<{ name: string; state: string | null }>;
}) {
  const labels = locations.map((l) => (l.state ? `${l.name} · ${l.state}` : l.name));
  return (
    <div className="mb-6 border-l-2 border-heritage bg-cream/60 px-4 py-3">
      <div className="flex items-start gap-2 flex-wrap">
        <MapPin className="h-3.5 w-3.5 text-heritage-deep mt-1 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
            Your Hiring-Manager Scope
          </div>
          {labels.length === 0 ? (
            <p className="text-[13px] text-amber-800 leading-relaxed">
              No locations assigned to you yet. Reach out to whoever invited
              you so they can update your scope on the Team page — until then,
              you&apos;ll only see corporate-scoped jobs.
            </p>
          ) : (
            <>
              <p className="text-[13px] text-slate-body leading-relaxed">
                You&apos;re reviewing applications for{" "}
                {labels.length === 1 ? "this location" : `these ${labels.length} locations`}{" "}
                only. Other locations at this DSO won&apos;t appear anywhere
                in your view.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {labels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center px-2.5 py-0.5 bg-ivory border border-[var(--rule-strong)] text-[10px] font-semibold tracking-[0.4px] text-ink"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
