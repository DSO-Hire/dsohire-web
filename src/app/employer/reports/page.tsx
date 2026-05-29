/**
 * /employer/reports — DSO-wide analytics dashboard
 * (Phase 5C / E6.2, shipped 2026-05-11).
 *
 * Replaces the Phase 4.6 stub. Surfaces:
 *   - Headline tile row: open roles, applications (30d), hires (this
 *     quarter), avg time-to-fill (days).
 *   - DSO-wide pipeline funnel.
 *   - Top jobs leaderboard.
 *   - "Coming this week" callout for cross-location + Annual Hiring
 *     Report (lands later in the Phase 5C run).
 *
 * Server component — all data fetched via the authenticated supabase
 * client, RLS gates appropriately.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Briefcase,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
  Download,
} from "lucide-react";
import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDsoAnalytics,
  getDsoCrossLocationStats,
  getRecruiterProductivity,
} from "@/lib/analytics/metrics";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { CrossLocationTable } from "@/components/analytics/cross-location-table";
import { RecruiterProductivityTable } from "@/components/analytics/recruiter-productivity-table";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
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

  const dsoId = dsoUser.dso_id as string;
  const [analytics, crossLocationRows, recruiterRows] = await Promise.all([
    getDsoAnalytics(supabase, dsoId),
    getDsoCrossLocationStats(supabase, dsoId),
    getRecruiterProductivity(supabase, dsoId, 30),
  ]);

  // Top jobs by application count.
  const { data: topJobs } = await supabase
    .from("jobs")
    .select(
      "id, title, employment_type, applications_count, posted_at, status"
    )
    .eq("dso_id", dsoId)
    .is("deleted_at", null)
    .neq("status", "draft")
    .order("applications_count", { ascending: false })
    .limit(5);

  const topJobsList =
    (topJobs ?? []) as Array<{
      id: string;
      title: string;
      employment_type: string;
      applications_count: number;
      posted_at: string | null;
      status: string;
    }>;

  return (
    <EmployerShell active="reports">
      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-[820px]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Reports
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-3">
            Hiring at a glance.
          </h1>
          <p className="text-[14px] text-slate-body leading-relaxed">
            DSO-wide metrics across every job, location, and recruiter.
            Updates live as candidates apply and you move them through the
            pipeline.
          </p>
        </div>
        <a
          href="/api/employer/applications.csv"
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-cream shrink-0"
          title="Download all applications as CSV"
        >
          <Download className="size-3.5" />
          Export CSV
        </a>
      </header>

      {/* Headline tiles */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Tile
          icon={Briefcase}
          label="Open roles"
          value={analytics.open_roles.toLocaleString()}
        />
        <Tile
          icon={Users}
          label="Apps · last 30d"
          value={analytics.applications_30d.toLocaleString()}
          secondary={`${analytics.applications_quarter.toLocaleString()} this quarter`}
        />
        <Tile
          icon={CheckCircle2}
          label="Hires · quarter"
          value={analytics.hires_quarter.toLocaleString()}
        />
        <Tile
          icon={Clock}
          label="Avg time-to-fill"
          value={
            analytics.avg_time_to_fill_days !== null
              ? `${analytics.avg_time_to_fill_days.toFixed(0)}d`
              : "—"
          }
          secondary={
            analytics.avg_time_to_fill_days !== null
              ? "posted → hired"
              : "no hires this quarter"
          }
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <FunnelChart rows={analytics.funnel} title="Pipeline funnel · all jobs" />

        <section className="border border-[var(--rule)] bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
              Top jobs by applications
            </div>
            <Link
              href="/employer/jobs"
              className="text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink inline-flex items-center gap-1"
            >
              All jobs <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {topJobsList.length === 0 ? (
            <p className="text-[13px] text-slate-meta italic">
              No jobs yet. Post a role to start seeing performance data.
            </p>
          ) : (
            <ol className="space-y-2">
              {topJobsList.map((job, i) => (
                <li key={job.id}>
                  <Link
                    href={`/employer/jobs/${job.id}`}
                    className="flex items-center gap-3 px-3 py-2 border border-[var(--rule)] hover:bg-cream/40 transition-colors"
                  >
                    <span className="font-bold tabular-nums text-slate-meta w-5 text-right text-[12px]">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[13px] font-semibold text-ink">
                        {job.title}
                      </div>
                      <div className="text-[11px] text-slate-meta uppercase tracking-wide">
                        {(job.employment_type || "")
                          .replace("_", " ")
                          .replace(/\b\w/g, (c) => c.toUpperCase())}{" "}
                        · {job.status}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[14px] font-extrabold tabular-nums text-ink leading-none">
                        {job.applications_count}
                      </div>
                      <div className="text-[10px] text-slate-meta uppercase tracking-wide mt-0.5">
                        apps
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      {crossLocationRows.length >= 2 && (
        <div className="mb-10">
          <CrossLocationTable rows={crossLocationRows} />
        </div>
      )}

      {recruiterRows.length >= 1 && (
        <div className="mb-10">
          <RecruiterProductivityTable rows={recruiterRows} windowDays={30} />
        </div>
      )}

      <section className="border border-[var(--rule)] bg-cream/40 p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Public report
        </div>
        <h2 className="text-lg font-extrabold tracking-[-0.3px] text-ink mb-2">
          Dental Hiring Report · 2026
        </h2>
        <p className="text-[13px] text-slate-body leading-relaxed max-w-[560px] mb-3">
          Anonymized, continuously-updated trend report drawn from the
          DSO Hire platform: compensation bands by role, role mix, top
          states by activity, time-to-fill. Public-facing, SEO-indexed,
          built for industry distribution.
        </p>
        <Link
          href="/dental-hiring-report"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink"
        >
          View the report <ArrowRight className="h-3 w-3" />
        </Link>
      </section>
    </EmployerShell>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  secondary,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="border border-[var(--rule)] bg-white p-5">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-3">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </div>
      <div className="text-3xl font-extrabold tracking-[-0.8px] text-ink leading-none mb-1">
        {value}
      </div>
      {secondary && (
        <div className="text-[11px] text-slate-body">{secondary}</div>
      )}
    </div>
  );
}
