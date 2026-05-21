/**
 * /employer/jobs — list of all jobs for the signed-in DSO.
 *
 * v3 polish (locked 2026-05-05):
 *
 *   Header                       ← page title + Post a Job CTA
 *   Aggregate stats strip        ← active jobs · 7d apps · top performer · need attention
 *   Status filter pills          ← All · Active · Draft · Paused · Expired (with counts)
 *   Hero job card                ← top-performing job (navy fill, sparkline rail, stat blocks)
 *   Refined job rows             ← bigger sparklines, hover states, sparkline goes red on declining jobs
 *
 * Auth-gated via EmployerShell. RLS guarantees we only see our own DSO's
 * jobs. Filter by status (all, draft, active, paused, expired).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  ChevronRight,
  Lock,
  Mail,
  MapPin,
  Plus,
  Star,
} from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sparkline } from "@/components/dashboard/sparkline";
import { TrendPill } from "@/components/dashboard/trend-pill";
import { getActiveLocationId } from "@/lib/employer/active-location";
import { JobsListControls } from "./jobs-list-controls";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Jobs" };

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
  { value: "expired", label: "Expired" },
] as const;

interface PageProps {
  searchParams: Promise<{
    status?: string;
    /**
     * Sort key. Defaults to recently-updated.
     *   updated — updated_at desc (default)
     *   posted  — posted_at desc, nulls last
     *   alpha   — title asc
     *   apps    — applications_count desc
     *   views   — views desc
     */
    sort?: string;
    /** dso_locations.id values to filter by (multi). */
    loc?: string | string[];
  }>;
}

const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "posted", label: "Recently posted" },
  { value: "alpha", label: "Alphabetical" },
  { value: "apps", label: "Most applications" },
  { value: "views", label: "Most views" },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export default async function EmployerJobsPage({ searchParams }: PageProps) {
  const nowMs = new Date().getTime();
  const sp = await searchParams;
  const statusParam = sp.status;
  const activeStatus =
    STATUS_FILTERS.find((f) => f.value === statusParam)?.value ?? "all";
  const sortKey: SortKey =
    (SORT_OPTIONS.find((s) => s.value === sp.sort)?.value as SortKey | undefined) ??
    "updated";
  const locFilters = Array.isArray(sp.loc)
    ? sp.loc
    : sp.loc
      ? [sp.loc]
      : [];

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const canPostJobs = dsoUser.role !== "hiring_manager";

  // ── Multi-location filter (Phase 4.6.d). When an active location is
  // set, restrict the jobs query to jobs tagged with that location. ─
  const activeLocationId = await getActiveLocationId();
  let locationFilteredJobIds: string[] | null = null;
  if (activeLocationId) {
    const { data: jobLocRows } = await supabase
      .from("job_locations")
      .select("job_id")
      .eq("location_id", activeLocationId);
    locationFilteredJobIds = ((jobLocRows ?? []) as Array<{ job_id: string }>).map(
      (r) => r.job_id
    );
  }

  // ── Pull all jobs once. RLS scopes to this DSO. We need the full list
  // so the aggregate strip + status filter counts come from the same set. ─
  let jobsQuery = supabase
    .from("jobs")
    .select(
      "id, title, slug, status, employment_type, role_category, posted_at, applications_count, views, updated_at, visibility",
    )
    .eq("dso_id", dsoUser.dso_id)
    .is("deleted_at", null);
  if (locationFilteredJobIds !== null) {
    // Empty filter list → restrict to a sentinel that matches nothing,
    // so the page renders an empty state for "no jobs at this location".
    jobsQuery = jobsQuery.in(
      "id",
      locationFilteredJobIds.length > 0
        ? locationFilteredJobIds
        : ["00000000-0000-0000-0000-000000000000"]
    );
  }
  const { data: allJobsRaw } = await jobsQuery.order("updated_at", {
    ascending: false,
  });
  type AllJobRow = {
    id: string;
    title: string;
    slug: string;
    status: string;
    employment_type: string;
    role_category: string;
    posted_at: string | null;
    applications_count: number;
    views: number;
    updated_at: string;
    visibility: string;
  };
  const allJobs = (allJobsRaw ?? []) as AllJobRow[];

  // Pull every job's location associations in one batch — drives the
  // chip rendering on each row AND the location filter dropdown. We
  // also use the linked-location set to apply the page-level multi-
  // select filter below.
  const allJobIds = allJobs.map((j) => j.id);
  const locationsByJob = new Map<
    string,
    Array<{ id: string; name: string; city: string | null; state: string | null }>
  >();
  if (allJobIds.length > 0) {
    const { data: jlRows } = await supabase
      .from("job_locations")
      .select(
        "job_id, dso_locations:dso_locations(id, name, city, state)"
      )
      .in("job_id", allJobIds);
    for (const row of (jlRows ?? []) as unknown as Array<{
      job_id: string;
      dso_locations: Array<{
        id: string;
        name: string;
        city: string | null;
        state: string | null;
      }> | {
        id: string;
        name: string;
        city: string | null;
        state: string | null;
      } | null;
    }>) {
      const dl = Array.isArray(row.dso_locations)
        ? row.dso_locations[0]
        : row.dso_locations;
      if (!dl) continue;
      const list = locationsByJob.get(row.job_id) ?? [];
      list.push(dl);
      locationsByJob.set(row.job_id, list);
    }
  }

  // Pull all DSO locations for the filter dropdown — RLS scopes to the
  // DSO automatically. Skipping when the rail-level location switcher
  // is already active (the rail did the narrowing; the per-page
  // multi-select would be redundant in that mode).
  let allLocationsForFilter: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  }> = [];
  if (!activeLocationId) {
    const { data: locRows } = await supabase
      .from("dso_locations")
      .select("id, name, city, state")
      .eq("dso_id", dsoUser.dso_id)
      .order("name", { ascending: true });
    allLocationsForFilter = (locRows ?? []) as typeof allLocationsForFilter;
  }

  // Apply sort. Default `updated` matches the DB ordering already in
  // place, so it's a no-op for that key. Other keys re-sort in JS.
  const sortedJobs = [...allJobs];
  switch (sortKey) {
    case "posted":
      sortedJobs.sort((a, b) => {
        const ta = a.posted_at ? new Date(a.posted_at).getTime() : 0;
        const tb = b.posted_at ? new Date(b.posted_at).getTime() : 0;
        return tb - ta;
      });
      break;
    case "alpha":
      sortedJobs.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
      );
      break;
    case "apps":
      sortedJobs.sort(
        (a, b) => (b.applications_count ?? 0) - (a.applications_count ?? 0)
      );
      break;
    case "views":
      sortedJobs.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
      break;
    case "updated":
    default:
      // already ordered by updated_at desc from the query
      break;
  }

  // Apply page-level location filter (multi-select). A job qualifies
  // when at least one of its linked locations is in the selected set.
  const locFilteredJobs =
    locFilters.length > 0
      ? sortedJobs.filter((j) => {
          const locs = locationsByJob.get(j.id) ?? [];
          return locs.some((l) => locFilters.includes(l.id));
        })
      : sortedJobs;

  // Filter for the rendered list view.
  const filteredJobs =
    activeStatus === "all"
      ? locFilteredJobs
      : locFilteredJobs.filter((j) => j.status === activeStatus);

  // ── 14-day per-job application velocity ────────────────────────────
  const jobIds = allJobs.map((j) => j.id);
  const fourteenDaysAgo = new Date(nowMs);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const { data: rawAppEvents } = jobIds.length
    ? await supabase
        .from("applications")
        .select("job_id, created_at")
        .in("job_id", jobIds)
        .gte("created_at", fourteenDaysAgo.toISOString())
    : { data: [] };
  type AppEventRow = { job_id: string; created_at: string };
  const appEvents = (rawAppEvents ?? []) as AppEventRow[];

  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);

  // Build a Map<jobId, { spark: number[], thisWeek, lastWeek }>.
  const velocityByJob = new Map<
    string,
    { spark: number[]; thisWeek: number; lastWeek: number }
  >();
  for (const id of jobIds) {
    velocityByJob.set(id, {
      spark: Array(7).fill(0),
      thisWeek: 0,
      lastWeek: 0,
    });
  }
  for (const ev of appEvents) {
    const v = velocityByJob.get(ev.job_id);
    if (!v) continue;
    const created = new Date(ev.created_at);
    created.setHours(0, 0, 0, 0);
    const daysAgo = Math.round(
      (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysAgo >= 0 && daysAgo < 7) {
      v.spark[6 - daysAgo] += 1;
      v.thisWeek += 1;
    } else if (daysAgo >= 7 && daysAgo < 14) {
      v.lastWeek += 1;
    }
  }

  // ── Aggregate metrics for the summary strip ────────────────────────
  const activeJobsCount = allJobs.filter((j) => j.status === "active").length;
  const apps7dTotal = Array.from(velocityByJob.values()).reduce(
    (sum, v) => sum + v.thisWeek,
    0,
  );
  const apps7dPriorTotal = Array.from(velocityByJob.values()).reduce(
    (sum, v) => sum + v.lastWeek,
    0,
  );
  const apps7dDelta = apps7dTotal - apps7dPriorTotal;

  // Top performer (active job with most 7-day apps).
  const topPerformer =
    allJobs
      .filter((j) => j.status === "active")
      .map((j) => ({
        job: j,
        velocity: velocityByJob.get(j.id) ?? {
          spark: Array(7).fill(0),
          thisWeek: 0,
          lastWeek: 0,
        },
      }))
      .sort((a, b) => b.velocity.thisWeek - a.velocity.thisWeek)[0] ?? null;

  // "Need attention" — active jobs with no apps in last 14 days.
  const needAttentionJobs = allJobs
    .filter((j) => j.status === "active")
    .filter((j) => {
      const v = velocityByJob.get(j.id);
      if (!v) return true;
      return v.thisWeek === 0 && v.lastWeek === 0;
    });

  // ── Status filter counts ──────────────────────────────────────────
  const statusCounts: Record<string, number> = { all: allJobs.length };
  for (const f of STATUS_FILTERS) {
    if (f.value === "all") continue;
    statusCounts[f.value] = allJobs.filter((j) => j.status === f.value).length;
  }

  // ── Hero job: only on the "all" or "active" view, only if there is
  // a clear top performer with 7-day apps > 0. ───────────────────────
  const showHeroJob =
    (activeStatus === "all" || activeStatus === "active") &&
    topPerformer !== null &&
    topPerformer.velocity.thisWeek > 0;

  // The hero job is excluded from the list rows so it doesn't render twice.
  const listJobs = showHeroJob
    ? filteredJobs.filter((j) => j.id !== topPerformer.job.id)
    : filteredJobs;

  // ── Today's date stamp ─────────────────────────────────────────────
  const dateLabel = new Date(nowMs).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <EmployerShell active="jobs">
      <header className="mb-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-3.5 mb-2 flex-wrap">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-heritage opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
              </span>
              <span className="text-[10px] font-extrabold tracking-[3px] uppercase text-heritage-deep">
                Jobs
              </span>
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta border-l border-rule pl-3.5">
                {dateLabel}
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight text-ink">
              Your job listings
            </h1>
            <p className="mt-2 text-[14px] text-slate-body">
              {allJobs.length === 0
                ? "Post your first job to start receiving applications."
                : `${activeJobsCount} active · ${apps7dTotal} application${apps7dTotal === 1 ? "" : "s"} in the last 7 days.`}
            </p>
          </div>
          {canPostJobs && (
            <Link
              href="/employer/jobs/new"
              className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
            >
              <Plus className="h-4 w-4" />
              Post a Job
            </Link>
          )}
        </div>
      </header>

      {/* Aggregate stats strip — only when there's at least one job */}
      {allJobs.length > 0 && (
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-6">
          <SummaryTile
            href="/employer/jobs?status=active"
            icon={Briefcase}
            label="Active jobs"
            value={String(activeJobsCount)}
            meta="Live on the public board"
          />
          <SummaryTile
            href="/employer/applications?range=7d"
            icon={Mail}
            label="Apps · last 7d"
            value={String(apps7dTotal)}
            trendPillDelta={apps7dDelta}
            trendPillLabel="vs last week"
          />
          <SummaryTile
            href={
              topPerformer
                ? `/employer/jobs/${topPerformer.job.id}/applications`
                : "/employer/jobs?status=active"
            }
            icon={Star}
            label="Top performer"
            value={String(topPerformer?.velocity.thisWeek ?? 0)}
            meta={
              topPerformer
                ? `${topPerformer.job.title}`
                : "Will rank once jobs receive apps"
            }
          />
          <SummaryTile
            href="/employer/jobs?attention=1"
            icon={AlertTriangle}
            label="Need attention"
            value={String(needAttentionJobs.length)}
            meta={
              needAttentionJobs.length === 0
                ? "Every job is generating activity"
                : "No apps in the last 14 days"
            }
            warn={needAttentionJobs.length > 0}
          />
        </section>
      )}

      {/* Status filter pills — preserve sort + loc filters in the URL
          when toggling so the user doesn't lose their narrowing on
          status flip. */}
      <nav className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((filter) => {
          const isActive = filter.value === activeStatus;
          const params = new URLSearchParams();
          if (filter.value !== "all") params.set("status", filter.value);
          if (sortKey !== "updated") params.set("sort", sortKey);
          for (const id of locFilters) params.append("loc", id);
          const href = params.size
            ? `/employer/jobs?${params.toString()}`
            : "/employer/jobs";
          const count = statusCounts[filter.value] ?? 0;
          return (
            <Link
              key={filter.value}
              href={href}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-[10px] font-extrabold tracking-[1.6px] uppercase transition-colors border ${
                isActive
                  ? "bg-ink text-ivory border-ink"
                  : "bg-white text-slate-body border-rule hover:border-rule-strong hover:text-ink"
              }`}
            >
              {filter.label}
              <span
                className={`px-1.5 py-0 text-[9px] tracking-[-0.2px] ${
                  isActive
                    ? "bg-white/15 text-ivory"
                    : "bg-cream text-slate-meta"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Sort + location filter controls — Cam 2026-05-08 PM. The
          location filter is hidden when the rail-level switcher is
          already narrowing to a single location. */}
      {allJobs.length > 0 && (
        <JobsListControls
          sortOptions={SORT_OPTIONS}
          activeSort={sortKey}
          locations={allLocationsForFilter}
          activeLocationIds={locFilters}
          hideLocationFilter={Boolean(activeLocationId)}
        />
      )}

      {/* Hero job card */}
      {showHeroJob && topPerformer && (
        <HeroJobCard
          jobId={topPerformer.job.id}
          title={topPerformer.job.title}
          roleCategory={humanRoleCategory(topPerformer.job.role_category)}
          employmentType={humanEmploymentType(topPerformer.job.employment_type)}
          status={topPerformer.job.status}
          updatedAt={topPerformer.job.updated_at}
          spark={topPerformer.velocity.spark}
          thisWeek={topPerformer.velocity.thisWeek}
          lastWeek={topPerformer.velocity.lastWeek}
          totalApps={topPerformer.job.applications_count}
          views={topPerformer.job.views}
          locations={locationsByJob.get(topPerformer.job.id) ?? []}
        />
      )}

      {/* Job list */}
      {filteredJobs.length === 0 ? (
        <EmptyState
          canPostJobs={canPostJobs}
          activeStatus={activeStatus}
          totalJobs={allJobs.length}
        />
      ) : listJobs.length === 0 ? (
        // The only filtered job was the hero — nothing else to show.
        <div className="text-[12px] text-slate-meta italic px-1 py-2">
          That&apos;s your only {activeStatus === "all" ? "job" : `${activeStatus} job`} for now.
        </div>
      ) : (
        <div className="bg-white border border-[var(--rule)]">
          {listJobs.map((job, i) => {
            const v = velocityByJob.get(job.id) ?? {
              spark: [],
              thisWeek: 0,
              lastWeek: 0,
            };
            return (
              <JobRow
                key={job.id}
                job={job}
                spark={v.spark}
                thisWeek={v.thisWeek}
                lastWeek={v.lastWeek}
                isLast={i === listJobs.length - 1}
                locations={locationsByJob.get(job.id) ?? []}
              />
            );
          })}
        </div>
      )}
    </EmployerShell>
  );
}

/* ───── Aggregate summary tile ───── */

function SummaryTile({
  href,
  icon: Icon,
  label,
  value,
  meta,
  trendPillDelta,
  trendPillLabel,
  warn,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  meta?: string;
  trendPillDelta?: number;
  trendPillLabel?: string;
  warn?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group bg-white p-4 sm:p-5 hover:bg-ivory-deep transition-colors flex flex-col"
    >
      <div
        className={`flex items-center gap-2 text-[9px] font-extrabold tracking-[1.8px] uppercase mb-2.5 ${
          warn ? "text-amber-700" : "text-heritage-deep"
        }`}
      >
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="text-[28px] font-black tracking-[-1px] text-ink leading-none mb-1.5">
        {value}
      </div>
      {meta && (
        <div className="text-[11px] text-slate-meta line-clamp-1">{meta}</div>
      )}
      {typeof trendPillDelta === "number" && (
        <div className="mt-1.5">
          <TrendPill delta={trendPillDelta} label={trendPillLabel} />
        </div>
      )}
    </Link>
  );
}

/* ───── Hero job card ───── */

function HeroJobCard({
  jobId,
  title,
  roleCategory,
  employmentType,
  status,
  updatedAt,
  spark,
  thisWeek,
  lastWeek,
  totalApps,
  views,
  locations,
}: {
  jobId: string;
  title: string;
  roleCategory: string;
  employmentType: string;
  status: string;
  updatedAt: string;
  spark: number[];
  thisWeek: number;
  lastWeek: number;
  totalApps: number;
  views: number;
  /** Same shape as JobRow's locations — first 2 inline + "+N more" overflow. */
  locations: Array<{ id: string; name: string; city: string | null; state: string | null }>;
}) {
  const updated = new Date(updatedAt);
  const delta = thisWeek - lastWeek;
  return (
    <Link
      href={`/employer/jobs/${jobId}/applications`}
      className="group relative overflow-hidden flex text-ivory bg-ink p-7 sm:p-8 hover:bg-ink-soft transition-colors mb-4"
      style={{
        backgroundImage:
          "radial-gradient(circle at 100% 0%, rgba(77,122,96,0.18), transparent 55%), radial-gradient(circle at 0% 100%, rgba(77,122,96,0.10), transparent 50%)",
      }}
    >
      {/* Heritage gradient left rule */}
      <span
        className="absolute top-0 left-0 bottom-0 w-1"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, var(--color-heritage, #4D7A60), #8db8a3)",
        }}
        aria-hidden
      />
      <ChevronRight className="absolute top-5 right-5 h-4 w-4 text-ivory/50 group-hover:text-[#8db8a3] group-hover:translate-x-1 transition-all" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 lg:gap-10 w-full items-stretch">
        <div>
          <div
            className="inline-flex items-center gap-1.5 px-2 py-1 mb-3 text-[9px] font-extrabold tracking-[1.5px] uppercase text-[#8db8a3]"
            style={{ background: "rgba(141,184,163,0.18)" }}
          >
            <Star className="h-2.5 w-2.5" strokeWidth={2.5} />
            Top Performer · Last 7 Days
          </div>
          <div className="flex items-center gap-3 flex-wrap mb-2.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 text-[9px] font-extrabold tracking-[1.5px] uppercase ${
                status === "active"
                  ? "bg-heritage text-ivory"
                  : "bg-ivory-deep text-ink"
              }`}
            >
              {status}
            </span>
            <span className="text-[10px] font-bold tracking-[1.4px] uppercase text-[#8db8a3]">
              {roleCategory}
            </span>
            <span className="text-[10px] font-bold tracking-[1.4px] uppercase text-[#8db8a3]">
              {employmentType}
            </span>
          </div>
          <h2 className="text-[24px] font-extrabold tracking-[-0.6px] leading-tight text-ivory mb-1.5">
            {title}
          </h2>
          {/* Location pills — same shape as JobRow but tuned for the navy hero
              background. Multi-location DSOs need to scan which practice a
              top-performer belongs to without clicking through. */}
          {locations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mb-2.5">
              <MapPin className="h-3 w-3 text-[#8db8a3]" />
              {locations.slice(0, 2).map((loc) => (
                <span
                  key={loc.id}
                  className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.3px] text-ivory border border-ivory/20"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  {loc.name}
                  {loc.state ? ` · ${loc.state}` : ""}
                </span>
              ))}
              {locations.length > 2 && (
                <span className="text-[10px] font-semibold tracking-[0.3px] text-ivory/55">
                  +{locations.length - 2} more
                </span>
              )}
            </div>
          )}
          <div className="text-[11px] text-ivory/55 tracking-[0.4px] mb-5">
            Updated {updated.toLocaleDateString()}
          </div>

          <div className="flex gap-7 sm:gap-9 items-end">
            <div>
              <div className="text-[9px] font-extrabold tracking-[1.6px] uppercase text-ivory/55">
                Apps · 7d
              </div>
              <div className="text-[36px] font-black tracking-[-1.2px] text-ivory leading-none mt-1">
                {thisWeek}
              </div>
              {(thisWeek > 0 || lastWeek > 0) && (
                <div className="mt-1.5">
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.4px] text-[#8db8a3]"
                    style={{ background: "rgba(141,184,163,0.18)" }}
                  >
                    {delta > 0 ? "↗" : delta < 0 ? "↘" : "—"}{" "}
                    {delta > 0 ? `+${delta}` : delta} vs last week
                  </span>
                </div>
              )}
            </div>
            <div>
              <div className="text-[9px] font-extrabold tracking-[1.6px] uppercase text-ivory/55">
                Total apps
              </div>
              <div className="text-[36px] font-black tracking-[-1.2px] text-ivory leading-none mt-1">
                {totalApps}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-extrabold tracking-[1.6px] uppercase text-ivory/55">
                Views
              </div>
              <div className="text-[36px] font-black tracking-[-1.2px] text-ivory leading-none mt-1">
                {views}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-stretch lg:items-end justify-between gap-5 lg:min-w-[260px]">
          <HeroJobSpark data={spark} />
          <div className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[1.8px] uppercase text-[#8db8a3] self-start lg:self-end">
            Open job
            <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function HeroJobSpark({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const width = 240;
  const height = 56;
  const padding = 4;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = innerW / (data.length - 1);
  const points = data.map((v, i) => ({
    x: padding + i * stepX,
    y: padding + innerH - ((v - min) / range) * innerH,
  }));
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(
    2,
  )} ${(height - padding).toFixed(2)} L ${points[0].x.toFixed(2)} ${(
    height - padding
  ).toFixed(2)} Z`;
  const last = points[points.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="max-w-[260px]"
    >
      <defs>
        <linearGradient id="hjsGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8db8a3" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8db8a3" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#hjsGrad)" />
      <path
        d={linePath}
        fill="none"
        stroke="#8db8a3"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={3.5} fill="#8db8a3" />
    </svg>
  );
}

/* ───── Job row ───── */

interface JobRowData {
  id: string;
  title: string;
  status: string;
  employment_type: string;
  role_category: string;
  applications_count: number;
  views: number;
  updated_at: string;
  visibility: string;
}

function JobRow({
  job,
  spark,
  thisWeek,
  lastWeek,
  isLast,
  locations,
}: {
  job: JobRowData;
  spark: number[];
  thisWeek: number;
  lastWeek: number;
  isLast: boolean;
  /**
   * Per-job location associations — drives the location chip(s) under
   * the title so 50+ practice DSOs can tell which job belongs where
   * at a glance (Cam 2026-05-08 PM).
   */
  locations: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  }>;
}) {
  const updated = new Date(job.updated_at);
  const delta = thisWeek - lastWeek;
  const intent =
    delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
  const sparkStroke = delta < 0 ? "#b91c1c" : "var(--color-heritage, #4D7A60)";
  const sparkFill =
    delta < 0 ? "rgba(185,28,28,0.10)" : "rgba(77,122,96,0.12)";
  const hasSparkSignal = spark.some((n) => n > 0);
  const hasTrendSignal = thisWeek > 0 || lastWeek > 0;

  return (
    <Link
      href={`/employer/jobs/${job.id}`}
      className={`group grid grid-cols-[auto_1fr_auto_auto_auto_16px] gap-4 sm:gap-6 items-center px-5 sm:px-6 py-4 sm:py-5 hover:bg-ivory-deep transition-colors ${
        isLast ? "" : "border-b border-[var(--rule)]"
      }`}
    >
      <StatusBadge status={job.status} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3 mb-1.5 text-[10px] font-bold tracking-[1.4px] uppercase text-slate-meta">
          <span>{humanRoleCategory(job.role_category)}</span>
          <span>{humanEmploymentType(job.employment_type)}</span>
          {job.visibility === "internal_only" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 border border-[var(--rule-strong)] text-ink">
              <Lock className="h-2.5 w-2.5" />
              Internal
            </span>
          )}
        </div>
        <div className="text-[16px] font-extrabold tracking-[-0.2px] leading-tight text-ink truncate mb-1">
          {job.title}
        </div>
        {/* Location chips — show first 2 inline, "+N" overflow when
            more. Falls through to "No locations" only on legitimately
            unscoped jobs (corporate/regional). */}
        {locations.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <MapPin className="h-3 w-3 text-slate-meta" />
            {locations.slice(0, 2).map((loc) => (
              <span
                key={loc.id}
                className="inline-flex items-center px-1.5 py-0.5 bg-cream border border-[var(--rule-strong)] text-[10px] font-semibold tracking-[0.3px] text-ink"
              >
                {loc.name}
                {loc.state ? ` · ${loc.state}` : ""}
              </span>
            ))}
            {locations.length > 2 && (
              <span className="text-[10px] font-semibold tracking-[0.3px] text-slate-meta">
                +{locations.length - 2} more
              </span>
            )}
          </div>
        ) : null}
        <div className="text-[11px] text-slate-meta tracking-[0.3px]">
          Updated {updated.toLocaleDateString()}
        </div>
      </div>

      {/* Sparkline cell */}
      <div className="hidden sm:flex flex-col items-end gap-1 min-w-[88px]">
        {hasSparkSignal ? (
          <Sparkline
            data={spark}
            width={88}
            height={28}
            stroke={sparkStroke}
            fill={sparkFill}
            ariaLabel={`${thisWeek} applications in the last 7 days`}
          />
        ) : (
          <div className="h-[28px] flex items-center text-[11px] text-slate-meta italic">
            No 7d activity
          </div>
        )}
        <span className="text-[9px] font-bold tracking-[1.4px] uppercase text-slate-meta">
          7-day apps
        </span>
      </div>

      {/* Apps count */}
      <div className="flex flex-col items-end gap-1">
        <span className="text-[18px] font-black tracking-[-0.5px] text-ink leading-none">
          {job.applications_count}
        </span>
        <span className="text-[9px] font-bold tracking-[1.4px] uppercase text-slate-meta">
          Apps
        </span>
        {hasTrendSignal && <TrendPill delta={delta} intent={intent} />}
      </div>

      {/* Views count */}
      <div className="flex flex-col items-end gap-1">
        <span className="text-[18px] font-black tracking-[-0.5px] text-ink leading-none">
          {job.views}
        </span>
        <span className="text-[9px] font-bold tracking-[1.4px] uppercase text-slate-meta">
          Views
        </span>
      </div>

      <ChevronRight className="h-4 w-4 text-slate-meta group-hover:text-heritage group-hover:translate-x-1 transition-all" />
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-heritage text-ivory" },
    draft: { label: "Draft", cls: "bg-ivory-deep text-ink" },
    paused: {
      label: "Paused",
      cls: "bg-cream text-slate-body border border-[var(--rule-strong)]",
    },
    expired: { label: "Expired", cls: "bg-slate-meta text-ivory" },
    filled: { label: "Filled", cls: "bg-ink text-heritage" },
    archived: { label: "Archived", cls: "bg-cream text-slate-meta" },
  };
  const m = map[status] ?? { label: status, cls: "bg-cream text-slate-body" };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[9px] font-bold tracking-[1.5px] uppercase ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

/* ───── Empty state ───── */

function EmptyState({
  canPostJobs,
  activeStatus,
  totalJobs,
}: {
  canPostJobs: boolean;
  activeStatus: string;
  totalJobs: number;
}) {
  // Different copy depending on whether they have NO jobs at all vs. just
  // none in this filter.
  const hasJobsButFiltered = totalJobs > 0 && activeStatus !== "all";
  return (
    <div className="border border-[var(--rule)] bg-cream p-12 text-center">
      <Briefcase className="h-10 w-10 text-slate-meta mx-auto mb-5" strokeWidth={1.5} />
      <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
        {hasJobsButFiltered
          ? `No ${activeStatus} jobs.`
          : "No jobs yet."}
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[440px] mx-auto mb-7">
        {hasJobsButFiltered
          ? `Switch the filter to see your other jobs, or post a new one in this status.`
          : canPostJobs
            ? "Post your first job to start getting applications. Multi-location posting is one flow — write the role once, assign it to as many practices as you need."
            : "There are no jobs at your assigned locations yet. Once an admin or recruiter posts a job to one of your locations, it'll appear here."}
      </p>
      {canPostJobs && !hasJobsButFiltered && (
        <Link
          href="/employer/jobs/new"
          className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ink-soft transition-colors"
        >
          <Plus className="h-4 w-4" />
          Post a Job
        </Link>
      )}
    </div>
  );
}

/* ───── Humanizers ───── */

function humanRoleCategory(c: string) {
  const map: Record<string, string> = {
    dentist: "Dentist",
    dental_hygienist: "Hygienist",
    dental_assistant: "Dental Assistant",
    front_office: "Front Office",
    office_manager: "Office Manager",
    regional_manager: "Regional Manager",
    specialist: "Specialist",
    other: "Other",
  };
  return map[c] ?? c;
}

function humanEmploymentType(e: string) {
  const map: Record<string, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    contract: "Contract",
    prn: "PRN",
    locum: "Locum",
  };
  return map[e] ?? e;
}
