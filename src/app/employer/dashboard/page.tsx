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
import { ArrowRight, Briefcase, ChevronRight, Mail, MapPin, Users } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { BillingBanner } from "@/components/employer/billing-banner";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSubscriptionAnyStatus } from "@/lib/billing/subscription";
import {
  STAGE_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
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

      const [appsThisWeekRes, awaitingReviewRes, recentAppsRes] =
        await Promise.all([
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
            .select("id, job_id, candidate_id, status, created_at")
            .in("job_id", jobIds)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

      appsThisWeekCount = appsThisWeekRes.count ?? 0;
      // "Awaiting Review" = candidates that have landed but haven't been
      // touched yet (status 'new'). Once a recruiter moves them to
      // 'reviewed' or beyond, they fall off this tile. The old code
      // filtered to status='reviewed', which is the screening lane and
      // never the right number to surface as "needs action".
      awaitingReviewCount = awaitingReviewRes.count ?? 0;
      recentApps = (recentAppsRes.data ?? []) as DashboardApp[];

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

      {/* KPI cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        <KpiCard
          label="Open Jobs"
          value={String(openJobsCount)}
          icon={Briefcase}
          hint={openJobsCount > 0 ? "Live on the board" : "Post your first"}
        />
        <KpiCard
          label="Applications This Week"
          value={String(appsThisWeekCount)}
          icon={Mail}
          hint={appsThisWeekCount > 0 ? "Since Monday" : "No applications yet"}
        />
        <KpiCard
          label="Awaiting Review"
          value={String(awaitingReviewCount)}
          icon={Users}
          hint={
            awaitingReviewCount > 0
              ? "Move candidates forward"
              : "All caught up"
          }
        />
        <KpiCard
          label="Locations"
          value={String(locationsCount ?? 0)}
          icon={MapPin}
          hint={(locationsCount ?? 0) > 0 ? "Edit in Locations" : "Add your first"}
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

      {/* Recent applications — last 5 across all jobs. Each row links into
          that job's pipeline (kanban view), not the application detail. */}
      {recentApps.length > 0 && (
        <section className="mt-12">
          <div className="flex items-end justify-between gap-4 mb-4">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
              Recent Applications
            </div>
            <Link
              href="/employer/applications"
              className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="border border-[var(--rule)] bg-white">
            {recentApps.map((app) => {
              const cand = recentCandMap.get(app.candidate_id);
              const job = recentJobMap.get(app.job_id);
              return (
                <Link
                  key={app.id}
                  href={
                    job
                      ? `/employer/jobs/${job.id}/applications`
                      : `/employer/applications/${app.id}`
                  }
                  className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[var(--rule)] last:border-0 hover:bg-cream transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-ink truncate">
                      {candidateDisplayName({
                        fullName: cand?.full_name,
                        candidateId: app.candidate_id,
                      })}
                      <span className="ml-2 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                        {STAGE_LABELS[app.status] ?? app.status}
                      </span>
                    </div>
                    <div className="text-[12px] text-slate-body truncate mt-0.5">
                      Applied to {job?.title ?? "Unknown job"} ·{" "}
                      {new Date(app.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-meta flex-shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

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

function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
}) {
  return (
    <div className="bg-white p-6 sm:p-7">
      <div className="flex items-center justify-between mb-4">
        <Icon className="h-5 w-5 text-slate-meta" />
      </div>
      <div className="text-3xl sm:text-4xl font-extrabold tracking-[-1px] text-ink leading-none">
        {value}
      </div>
      <div className="mt-2 text-[10px] font-bold tracking-[1.8px] uppercase text-slate-body">
        {label}
      </div>
      {hint && (
        <div className="mt-3 text-[13px] text-slate-meta">{hint}</div>
      )}
    </div>
  );
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
