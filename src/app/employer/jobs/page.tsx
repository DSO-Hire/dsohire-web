/**
 * /employer/jobs — list of all jobs for the signed-in DSO.
 *
 * Auth-gated via EmployerShell. RLS guarantees we only see our own DSO's jobs.
 * Filter by status (all, draft, active, paused, expired).
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Briefcase, Plus } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Sparkline } from "@/components/dashboard/sparkline";
import { TrendPill } from "@/components/dashboard/trend-pill";
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
  searchParams: Promise<{ status?: string }>;
}

export default async function EmployerJobsPage({ searchParams }: PageProps) {
  const { status: statusParam } = await searchParams;
  const activeStatus =
    STATUS_FILTERS.find((f) => f.value === statusParam)?.value ?? "all";

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

  // RLS already filters by dso_id, but explicit eq lets the query planner use
  // the index more cleanly.
  let query = supabase
    .from("jobs")
    .select(
      "id, title, slug, status, employment_type, role_category, posted_at, applications_count, views, updated_at"
    )
    .eq("dso_id", dsoUser.dso_id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus);
  }

  const { data: jobs } = await query;
  const jobList = (jobs ?? []) as JobRow[];

  // 14-day application velocity per job — used for the per-row sparkline
  // and week-over-week trend pill on each card. We pull raw rows so we can
  // bucket per-day in JS (Postgres can group date-trunc here, but the row
  // count is small enough that JS-side grouping is simpler and lets us
  // share the same "build a 7-day spark series" helper as the dashboard).
  const jobIds = jobList.map((j) => j.id);
  const fourteenDaysAgo = new Date();
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

  // Build a Map<jobId, { spark: number[], thisWeek: number, lastWeek: number }>
  // The spark is 7 buckets covering the last 7 calendar days, oldest first.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
      (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysAgo >= 0 && daysAgo < 7) {
      // Sparkline runs oldest → newest, so bucket 0 is "6 days ago" and bucket 6 is "today".
      v.spark[6 - daysAgo] += 1;
      v.thisWeek += 1;
    } else if (daysAgo >= 7 && daysAgo < 14) {
      v.lastWeek += 1;
    }
  }

  return (
    <EmployerShell active="jobs">
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
            Jobs
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight text-ink">
            Your job listings
          </h1>
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
      </header>

      {/* Status filter */}
      <nav className="flex flex-wrap gap-px bg-[var(--rule)] border border-[var(--rule)] mb-8">
        {STATUS_FILTERS.map((filter) => {
          const isActive = filter.value === activeStatus;
          const href =
            filter.value === "all"
              ? "/employer/jobs"
              : `/employer/jobs?status=${filter.value}`;
          return (
            <Link
              key={filter.value}
              href={href}
              className={`px-5 py-3 text-[10px] font-bold tracking-[2px] uppercase transition-colors ${
                isActive
                  ? "bg-ink text-ivory"
                  : "bg-white text-slate-body hover:bg-cream hover:text-ink"
              }`}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {jobList.length === 0 ? (
        <EmptyState canPostJobs={canPostJobs} />
      ) : (
        <ul className="list-none border-t border-[var(--rule)]">
          {jobList.map((job) => {
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
              />
            );
          })}
        </ul>
      )}
    </EmployerShell>
  );
}

interface JobRow {
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
}

function JobRow({
  job,
  spark,
  thisWeek,
  lastWeek,
}: {
  job: JobRow;
  spark: number[];
  thisWeek: number;
  lastWeek: number;
}) {
  const updated = new Date(job.updated_at);
  const delta = thisWeek - lastWeek;
  // Only show the trend pill if there's actually any signal in either of
  // the two compared weeks — for a job with zero apps in a 14-day window,
  // showing "0 vs 0" is just noise.
  const hasTrendSignal = thisWeek > 0 || lastWeek > 0;
  // Sparkline only earns its space when the job has had at least one app
  // in the last 7 days; an all-zero spark looks like a glitch.
  const hasSparkSignal = spark.some((n) => n > 0);
  return (
    <li className="border-b border-[var(--rule)]">
      <Link
        href={`/employer/jobs/${job.id}`}
        className="group block py-5 hover:bg-cream/40 transition-colors -mx-2 px-2"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <StatusBadge status={job.status} />
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                {humanRoleCategory(job.role_category)}
              </span>
              <span className="text-[10px] tracking-[0.5px] text-slate-meta">
                {humanEmploymentType(job.employment_type)}
              </span>
            </div>
            <div className="text-[17px] font-extrabold tracking-[-0.3px] text-ink leading-tight mb-1 truncate">
              {job.title}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[12px] tracking-[0.3px] text-slate-meta">
                Updated {updated.toLocaleDateString()}
              </span>
              {hasTrendSignal && (
                <TrendPill delta={delta} label="vs last week" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-7 text-right flex-shrink-0">
            {/* 7-day apps velocity — gives at-a-glance "is this job warming up
                or cooling off?" without forcing the operator to click in. */}
            {hasSparkSignal && (
              <div className="hidden sm:flex flex-col items-end justify-center">
                <Sparkline
                  data={spark}
                  width={88}
                  height={28}
                  ariaLabel={`${thisWeek} applications in the last 7 days`}
                />
                <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-1">
                  7-day apps
                </div>
              </div>
            )}
            <Stat label="Apps" value={job.applications_count} />
            <Stat label="Views" value={job.views} />
            <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[16px] font-extrabold text-ink leading-none">
        {value}
      </div>
      <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-1">
        {label}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Active", cls: "bg-heritage text-ivory" },
    draft: { label: "Draft", cls: "bg-ivory-deep text-ink" },
    paused: { label: "Paused", cls: "bg-cream text-slate-body border border-[var(--rule-strong)]" },
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

function EmptyState({ canPostJobs }: { canPostJobs: boolean }) {
  return (
    <div className="border border-[var(--rule)] bg-cream p-12 text-center">
      <Briefcase className="h-10 w-10 text-slate-meta mx-auto mb-5" />
      <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-3">
        No jobs yet.
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed max-w-[440px] mx-auto mb-7">
        {canPostJobs
          ? "Post your first job to start getting applications. Multi-location posting is one flow — write the role once, assign it to as many practices as you need."
          : "There are no jobs at your assigned locations yet. Once an admin or recruiter posts a job to one of your locations, it'll appear here."}
      </p>
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
  );
}

/* ───── humanizers ───── */

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
