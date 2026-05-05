/**
 * /employer/dashboard — landing after sign-in.
 *
 * Shows the DSO's headline KPIs (open jobs, applications this week,
 * awaiting review, locations). Counts are scoped to the signed-in user's
 * DSO via the same jobs/applications joins used by the recent-applications
 * widget below; RLS handles the rest.
 *
 * "Applications This Week" uses date_trunc('week', now()) semantics — i.e.
 * a Monday-anchored UTC week — so the tile resets every Monday. Good enough
 * for v1; revisit with the user's locale week-start when we add tz support.
 */

import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  Mail,
  MapPin,
  Users,
  UserPlus,
  ArrowRightCircle,
} from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { BillingBanner } from "@/components/employer/billing-banner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscriptionAnyStatus } from "@/lib/billing/subscription";
import {
  STAGE_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { KpiTile } from "@/components/dashboard/kpi-tile";
import {
  ActivityFeed,
  type ActivityEvent,
} from "@/components/dashboard/activity-feed";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function EmployerDashboard() {
  const supabase = await createSupabaseServerClient();

  // Pull DSO context for header + KPI counts
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // user is non-null here because EmployerShell would have redirected;
  // guard for type narrowing
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

  // Count locations for the "complete onboarding" hint
  const { count: locationsCount } = await supabase
    .from("dso_locations")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "");

  // Count team members
  const { count: teamCount } = await supabase
    .from("dso_users")
    .select("*", { count: "exact", head: true })
    .eq("dso_id", dsoId ?? "");

  // Subscription status drives the billing banner at the top of the dashboard.
  const subscription = dsoId
    ? await getSubscriptionAnyStatus(supabase, dsoId)
    : null;

  // Recent applications across all jobs in this DSO. Day 7: lightweight
  // dashboard widget that links each row into the per-job pipeline so the
  // recruiter lands directly on the kanban view. RLS scopes to this DSO.
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

  // KPI tile counts — scoped to this DSO. Computed alongside the recent-apps
  // pull so we share the jobs query.
  let openJobsCount = 0;
  let appsThisWeekCount = 0;
  let awaitingReviewCount = 0;
  // Sparkline + trend-pill enrichments: applications received per day over
  // the last 14 days. The most recent 7 days drive the sparkline; the
  // delta vs. the prior 7 days drives the trend pill.
  let appsLast7Days: number[] = [];
  let appsWeekOverWeekDelta = 0;
  // Hint text for the "Awaiting Review" tile — how long the oldest pending
  // application has been sitting.
  let oldestAwaitingDays: number | null = null;

  let recentApps: DashboardApp[] = [];
  let recentJobMap = new Map<string, DashboardJob>();
  let recentCandMap = new Map<string, DashboardCandidate>();
  if (dsoId) {
    // All non-deleted jobs for this DSO. We need every job (any status) to
    // scope the application counts; the "open jobs" tile filters in JS.
    const { data: rawJobs } = await supabase
      .from("jobs")
      .select("id, title, status")
      .eq("dso_id", dsoId)
      .is("deleted_at", null);
    type JobWithStatus = DashboardJob & { status: string };
    const jobs = (rawJobs ?? []) as JobWithStatus[];
    recentJobMap = new Map(jobs.map((j) => [j.id, { id: j.id, title: j.title }]));
    const jobIds = jobs.map((j) => j.id);

    // Active Jobs tile — matches the 'active' enum value in public.jobs.status.
    openJobsCount = jobs.filter((j) => j.status === "active").length;

    if (jobIds.length > 0) {
      // Monday-anchored UTC week start. date_trunc('week', now()) in pg uses
      // ISO weeks (Monday). Mirror that here so the SSR-rendered count
      // matches what a SQL inspector would see.
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0=Sun..6=Sat
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

      // 14-day window for sparkline + week-over-week delta.
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

      const [
        appsThisWeekRes,
        awaitingReviewRes,
        oldestAwaitingRes,
        recentAppsRes,
        last14DaysRes,
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
        // Oldest pending application — drives the "Awaiting Review" hint.
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
        // 14-day raw application timestamps. Group in JS since Supabase's
        // client doesn't expose GROUP BY without a Postgres function.
        supabase
          .from("applications")
          .select("created_at")
          .in("job_id", jobIds)
          .gte("created_at", fourteenDaysAgo.toISOString()),
      ]);

      appsThisWeekCount = appsThisWeekRes.count ?? 0;
      // "Awaiting Review" = candidates that have landed but haven't been
      // touched yet (status 'new'). Once a recruiter moves them to
      // 'reviewed' or beyond, they fall off this tile. The old code
      // filtered to status='reviewed', which is the screening lane and
      // never the right number to surface as "needs action".
      awaitingReviewCount = awaitingReviewRes.count ?? 0;
      recentApps = (recentAppsRes.data ?? []) as DashboardApp[];

      // Compute oldest-awaiting age in days (for the KPI hint).
      const oldestAwaitingCreated = (
        oldestAwaitingRes.data as { created_at: string } | null
      )?.created_at;
      if (oldestAwaitingCreated) {
        const ageMs = Date.now() - new Date(oldestAwaitingCreated).getTime();
        oldestAwaitingDays = Math.max(0, Math.floor(ageMs / 86400000));
      }

      // Bucket the 14 days of timestamps into per-day counts. Index 0 =
      // 13 days ago, index 13 = today. We then slice the last 7 for the
      // sparkline and compare totals across the two halves for the delta.
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

      const candIds = Array.from(new Set(recentApps.map((a) => a.candidate_id)));
      if (candIds.length > 0) {
        const { data: rawCands } = await supabase
          .from("candidates")
          .select("id, full_name")
          .in("id", candIds);
        const cands = (rawCands ?? []) as DashboardCandidate[];
        recentCandMap = new Map(cands.map((c) => [c.id, c]));
      }
    }
  }

  return (
    <EmployerShell active="dashboard">
      <header className="mb-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          {dso?.status === "active" ? "Active" : "Onboarding"}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
          Welcome back, {dsoUser?.full_name?.split(" ")[0] ?? "there"}.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          Here&apos;s where things stand at <strong className="text-ink font-bold">{dso?.name}</strong>.
        </p>
      </header>

      {/* Billing alert — renders nothing when subscription is healthy */}
      <BillingBanner subscription={subscription} />

      {/* KPI tiles — now with sparklines, trend pills, and contextual
          secondary lines. Sparkline data only renders when there's actual
          7-day history; otherwise the tile gracefully omits the chart. */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        <KpiTile
          icon={Briefcase}
          value={String(openJobsCount)}
          label="Open Jobs"
          hint={
            openJobsCount > 0
              ? "Live on the board"
              : "Post your first to start receiving applications"
          }
        />
        <KpiTile
          icon={Mail}
          value={String(appsThisWeekCount)}
          label="Applications This Week"
          hint={
            appsThisWeekCount > 0
              ? `Since Monday`
              : "No applications yet — share the job board to drive traffic"
          }
          spark={appsLast7Days.some((v) => v > 0) ? appsLast7Days : undefined}
          delta={appsWeekOverWeekDelta}
          deltaLabel="vs last week"
        />
        <KpiTile
          icon={Users}
          value={String(awaitingReviewCount)}
          label="Awaiting Review"
          hint={
            awaitingReviewCount === 0
              ? "All caught up"
              : oldestAwaitingDays !== null && oldestAwaitingDays > 0
                ? `Oldest waiting ${oldestAwaitingDays}${oldestAwaitingDays === 1 ? " day" : " days"}`
                : "Move candidates forward"
          }
          trendIntent={
            oldestAwaitingDays !== null && oldestAwaitingDays >= 7
              ? "negative"
              : undefined
          }
        />
        <KpiTile
          icon={MapPin}
          value={String(locationsCount ?? 0)}
          label="Locations"
          hint={
            (locationsCount ?? 0) > 0
              ? `${locationsCount} on file · Edit in Locations`
              : "Add your first to enable job posting"
          }
        />
      </section>

      {/* Onboarding nudge */}
      {(locationsCount ?? 0) === 0 && (
        <section className="mt-10 p-8 bg-ink text-ivory border-l-4 border-heritage">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage mb-3">
            Finish Onboarding
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.6px] leading-tight mb-3">
            Add your first practice location to start posting jobs.
          </h2>
          <p className="text-[14px] text-ivory/70 leading-relaxed max-w-[560px] mb-6">
            DSO Hire posts jobs across your locations in one flow. We need at
            least one location to enable job posting.
          </p>
          <Link
            href="/employer/onboarding"
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-heritage text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-heritage-deep transition-colors"
          >
            Continue Onboarding
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      )}

      {/* Recent activity — uses the shared ActivityFeed primitive so the
          dashboard's "what's happening" surface matches the visual
          vocabulary used on the candidate dashboard and elsewhere. */}
      <section className="mt-12">
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
                  <strong className="font-semibold">{name}</strong>{" "}
                  applied to{" "}
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
              timestamp: relativeDate(app.created_at),
              href: job
                ? `/employer/jobs/${job.id}/applications`
                : `/employer/applications/${app.id}`,
            };
          })}
        />
      </section>

      {/* Quick links — admin/recruiter surface only. Hiring managers see
          a scoped variant focused on the work they actually do. */}
      <section className="mt-12">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
          Quick Actions
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {dsoUser?.role === "hiring_manager" ? (
            <>
              <QuickAction
                href="/employer/applications"
                title="Review applications"
                body="See what's new at your assigned locations."
              />
              <QuickAction
                href="/employer/jobs"
                title="Open jobs"
                body="Browse open postings at your locations."
              />
              <QuickAction
                href="/employer/settings"
                title="Account settings"
                body="Update your profile and notification preferences."
              />
            </>
          ) : (
            <>
              <QuickAction
                href="/employer/jobs/new"
                title="Post a job"
                body="Write once, deploy across all your practices."
              />
              <QuickAction
                href="/employer/locations"
                title="Manage locations"
                body={`${locationsCount ?? 0} location${(locationsCount ?? 0) === 1 ? "" : "s"} on file.`}
              />
              <QuickAction
                href="/employer/team"
                title="Invite teammates"
                body={`${teamCount ?? 1} team member${(teamCount ?? 1) === 1 ? "" : "s"}. Owner only.`}
              />
            </>
          )}
        </div>
      </section>
    </EmployerShell>
  );
}

/**
 * Format an ISO date string as a casual relative time
 * ("2h ago", "yesterday", "3d ago", "Mar 12"). Used by the
 * dashboard activity feed for human-readable timestamps.
 */
function relativeDate(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
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

function QuickAction({
  href,
  title,
  body,
}: {
  href: string;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group block bg-white p-7 hover:bg-cream transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="text-[16px] font-extrabold tracking-[-0.3px] text-ink mb-1.5">
            {title}
          </div>
          <div className="text-[14px] text-slate-body leading-snug">{body}</div>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors flex-shrink-0 mt-1" />
      </div>
    </Link>
  );
}
