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
  Mail,
  MapPin,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { BillingBanner } from "@/components/employer/billing-banner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscriptionAnyStatus } from "@/lib/billing/subscription";
import {
  KANBAN_STAGES,
  STAGE_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import { HeroKpiTile } from "@/components/dashboard/hero-kpi-tile";
import {
  ActivityFeed,
  type ActivityEvent,
} from "@/components/dashboard/activity-feed";
import { StuckAlert } from "@/components/dashboard/stuck-alert";
import { PipelineFunnel } from "@/components/dashboard/pipeline-funnel";
import {
  JobLeaderboard,
  type LeaderboardJob,
} from "@/components/dashboard/job-leaderboard";
import { DashboardMiniMap } from "@/components/dashboard/dashboard-mini-map";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

// SLA threshold for stuck-candidate alerts. Pulled out as a constant so
// future config UI can override it per-DSO without touching the page.
const STUCK_SLA_DAYS = 5;

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
    .select("dso_id, role, full_name")
    .eq("auth_user_id", userId)
    .maybeSingle();

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

  const subscription = dsoId
    ? await getSubscriptionAnyStatus(supabase, dsoId)
    : null;

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

  // ── Pipeline funnel scaffolding (counts of CURRENT status, last 30 days
  // of submissions). v1: status-snapshot funnel. A flow-based funnel would
  // require querying application_status_events; that's a Phase 5E follow-up
  // when we wire up the analytics surface. ────────────────────────────
  const stage30dCounts: Record<(typeof KANBAN_STAGES)[number], number> = {
    new: 0,
    reviewed: 0,
    interviewing: 0,
    offered: 0,
    hired: 0,
  };
  let stageStripCounts: Array<{ key: string; label: string; count: number }> =
    [];

  // ── Per-job velocity leaderboard scaffolding ───────────────────────
  let leaderboardJobs: LeaderboardJob[] = [];

  // ── Mini-map scaffolding ───────────────────────────────────────────
  type MiniMapLocationRow = {
    id: string;
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
    status: ApplicationStatus;
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
    // All non-deleted jobs for this DSO. We need every job (any status) to
    // scope the application counts; the "open jobs" tile filters in JS.
    const { data: rawJobs } = await supabase
      .from("jobs")
      .select(
        "id, title, status, role_category, employment_type, applications_count",
      )
      .eq("dso_id", dsoId)
      .is("deleted_at", null);
    type JobWithStatus = DashboardJob & {
      status: string;
      role_category: string;
      employment_type: string;
      applications_count: number;
    };
    const jobs = (rawJobs ?? []) as JobWithStatus[];
    recentJobMap = new Map(
      jobs.map((j) => [j.id, { id: j.id, title: j.title }]),
    );
    const jobIds = jobs.map((j) => j.id);

    openJobsCount = jobs.filter((j) => j.status === "active").length;

    if (jobIds.length > 0) {
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
          .eq("status", "new"),
        supabase
          .from("applications")
          .select("created_at")
          .in("job_id", jobIds)
          .eq("status", "new")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("applications")
          .select("id, job_id, candidate_id, status, created_at")
          .in("job_id", jobIds)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("applications")
          .select("created_at")
          .in("job_id", jobIds)
          .gte("created_at", fourteenDaysAgo.toISOString()),
        // Stuck candidates — status='new' and created_at older than SLA.
        // We pull the row + candidate name in one go via FK join.
        supabase
          .from("applications")
          .select(
            "id, job_id, created_at, candidate_id, candidate:candidates(full_name)",
          )
          .in("job_id", jobIds)
          .eq("status", "new")
          .lte(
            "created_at",
            new Date(
              nowMs - STUCK_SLA_DAYS * 86400000,
            ).toISOString(),
          )
          .order("created_at", { ascending: true }),
        // Funnel: applications submitted in the last 30 days, by current status.
        supabase
          .from("applications")
          .select("status")
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
      recentApps = (recentAppsRes.data ?? []) as DashboardApp[];

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

      // ── Pipeline funnel ──────────────────────────────────────────
      type FunnelRow = { status: ApplicationStatus };
      for (const row of (funnel30dRes.data ?? []) as FunnelRow[]) {
        if ((row.status as string) in stage30dCounts) {
          stage30dCounts[row.status as keyof typeof stage30dCounts] += 1;
        }
      }
      // Hero stage strip — same data, different shape.
      stageStripCounts = [
        { key: "new", label: "New", count: stage30dCounts.new },
        {
          key: "reviewed",
          label: "Screening",
          count: stage30dCounts.reviewed,
        },
        {
          key: "interviewing",
          label: "Interview",
          count: stage30dCounts.interviewing,
        },
        { key: "offered", label: "Offer", count: stage30dCounts.offered },
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
      leaderboardJobs = jobs
        .filter((j) => j.status === "active")
        .map((j): LeaderboardJob => {
          const v = perJob.get(j.id) ?? {
            spark: Array(7).fill(0),
            thisWeek: 0,
            lastWeek: 0,
          };
          return {
            id: j.id,
            title: j.title,
            subline: HUMAN_EMP[j.employment_type] ?? j.employment_type,
            spark: v.spark,
            thisWeek: v.thisWeek,
            lastWeek: v.lastWeek,
            href: `/employer/jobs/${j.id}/applications`,
          };
        })
        .sort((a, b) => b.thisWeek - a.thisWeek)
        .slice(0, 5);
    }

    // ── Mini-map: locations + per-location application count ────────
    // We pull all locations (with coords) and counter-join applications
    // via job_locations + applications. RLS already scopes both.
    const { data: rawLocations } = await supabase
      .from("dso_locations")
      .select("id, city, state, latitude, longitude")
      .eq("dso_id", dsoId);
    type LocRow = {
      id: string;
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
        city: l.city,
        state: l.state,
        latitude: l.latitude,
        longitude: l.longitude,
        applicationCount: Math.round(locAppCount.get(l.id) ?? 0),
      }));
    } else {
      miniMapLocations = locs.map((l) => ({
        id: l.id,
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
  const heroHint =
    awaitingReviewCount === 0
      ? "Inbox is clear. New applications will appear here in real time as candidates apply."
      : oldestAwaitingDays !== null && oldestAwaitingDays > 0
        ? `Oldest unreviewed has been waiting ${oldestAwaitingDays} day${oldestAwaitingDays === 1 ? "" : "s"}. Move candidates forward to keep momentum.`
        : "New applications since you last logged in. Click in to start the review.";

  // Today's date stamp for the eyebrow row.
  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <EmployerShell active="dashboard">
      <header className="mb-10">
        <div className="flex items-center gap-3.5 mb-2 flex-wrap">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-heritage opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
          </span>
          <span className="text-[10px] font-extrabold tracking-[3px] uppercase text-heritage-deep">
            {dso?.status === "active" ? "Active" : "Onboarding"}
          </span>
          <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-l border-rule pl-3.5">
            {dateLabel}
          </span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Welcome back, {dsoUser?.full_name?.split(" ")[0] ?? "there"}.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          Here&apos;s where things stand at{" "}
          <strong className="text-ink font-bold">{dso?.name}</strong>.
        </p>
      </header>

      <BillingBanner subscription={subscription} />

      {/* KPI grid — navy hero (Awaiting Review) + 4 tonal supporting tiles.
          Hero spans the leftmost column across both rows; the four tonal
          tiles fill the right two columns in a 2×2. */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr] gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
        <div className="lg:row-span-2">
          <HeroKpiTile
            label="Awaiting Review"
            value={String(awaitingReviewCount)}
            live={awaitingReviewCount > 0}
            hint={heroHint}
            spark={appsLast7Days.some((v) => v > 0) ? appsLast7Days : undefined}
            stageStrip={stageStripCounts}
            stageStripMax={stageStripMax}
            href="/employer/applications?stage=new"
            ctaLabel="Open inbox"
          />
        </div>

        <KpiTile
          icon={Briefcase}
          value={String(openJobsCount)}
          label="Open Jobs"
          hint={
            openJobsCount > 0
              ? "Live on the board"
              : "Post your first to start receiving applications"
          }
          href="/employer/jobs?status=active"
          routeLabel="Manage jobs"
        />

        <KpiTile
          icon={Mail}
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
          routeLabel="Browse applications"
        />

        <KpiTile
          icon={Users}
          value={String(stage30dCounts.hired)}
          label="Hires · Last 30d"
          hint={
            stage30dCounts.hired > 0
              ? "Candidates moved to hired"
              : "When candidates are hired, they show up here"
          }
          href="/employer/applications?stage=hired"
          routeLabel="See hires"
        />

        <KpiTile
          icon={MapPin}
          value={String(locationsCount ?? 0)}
          label="Locations"
          hint={
            (locationsCount ?? 0) > 0
              ? `${locationsCount} on file`
              : "Add your first to enable job posting"
          }
          href="/employer/locations"
          routeLabel="Manage locations"
        />
      </section>

      {/* Stuck candidates — only renders when SLA breached. */}
      <StuckAlert
        candidates={stuckCandidates}
        totalCount={stuckTotalCount}
        slaDays={STUCK_SLA_DAYS}
        reviewAllHref="/employer/applications?stuck=1"
      />

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

      {/* Pipeline funnel — full-width. */}
      <section className="mb-6">
        <PipelineFunnel
          stageCounts={{
            submitted:
              stage30dCounts.new +
              stage30dCounts.reviewed +
              stage30dCounts.interviewing +
              stage30dCounts.offered +
              stage30dCounts.hired,
            reviewed:
              stage30dCounts.reviewed +
              stage30dCounts.interviewing +
              stage30dCounts.offered +
              stage30dCounts.hired,
            interview:
              stage30dCounts.interviewing +
              stage30dCounts.offered +
              stage30dCounts.hired,
            offer: stage30dCounts.offered + stage30dCounts.hired,
            hired: stage30dCounts.hired,
          }}
          windowLabel="Last 30 days"
          medianTimeToHireDays={null}
          href="/employer/applications"
        />
      </section>

      {/* Two-column row — Leaderboard + Mini-map. */}
      <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 mb-6">
        <JobLeaderboard
          jobs={leaderboardJobs}
          viewAllHref="/employer/jobs"
        />
        <DashboardMiniMap
          locations={miniMapLocations}
          href="/jobs"
        />
      </section>

      {/* Recent activity — unchanged from v2. */}
      <section className="mt-6">
        <div className="flex items-end justify-between gap-4 mb-4">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Recent Activity
          </div>
          {recentApps.length > 0 && (
            <Link
              href="/employer/applications"
              className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
            >
              View all
            </Link>
          )}
        </div>
        <ActivityFeed
          title=""
          emptyMessage="No applications yet — once candidates start applying, recent activity shows up here."
          events={recentApps.map((app): ActivityEvent => {
            const cand = recentCandMap.get(app.candidate_id);
            const job = recentJobMap.get(app.job_id);
            const name = candidateDisplayName({
              fullName: cand?.full_name,
              candidateId: app.candidate_id,
            });
            const stageLabel = STAGE_LABELS[app.status] ?? app.status;
            return {
              id: app.id,
              icon: app.status === "new" ? UserPlus : ArrowRightCircle,
              tone: app.status === "new" ? "positive" : "neutral",
              body: (
                <>
                  <strong className="font-semibold">{name}</strong> applied to{" "}
                  <span className="text-slate-body">
                    {job?.title ?? "Unknown job"}
                  </span>
                  {app.status !== "new" && (
                    <>
                      {" "}
                      · now in{" "}
                      <span className="text-slate-body">{stageLabel}</span>
                    </>
                  )}
                </>
              ),
              timestamp: relativeDate(app.created_at, nowMs),
              href: job
                ? `/employer/jobs/${job.id}/applications`
                : `/employer/applications/${app.id}`,
            };
          })}
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
