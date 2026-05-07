/**
 * /candidate/jobs — candidate-shelled jobs hub (Phase 4.6.c).
 *
 * Fixes the "Browse Jobs" kick-out bug: previously the rail's Jobs entry
 * pointed at /jobs which is wrapped in SiteShell (marketing nav), bouncing
 * the candidate out of their authed CandidateShell context.
 *
 * Now the rail points here. This page stays inside CandidateShell and
 * surfaces a focused jobs view: a top recent-jobs list + a prominent
 * "View the full board" CTA to /jobs for the wider filter experience.
 *
 * Lean by design — candidates who want the full filter set (state, posted-
 * within-days, map view, etc.) click through to /jobs. This hub is for
 * the "show me what's new today" use case.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Briefcase, MapPin, Search } from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Jobs · DSO Hire" };

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

const EMP_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  prn: "PRN",
  locum: "Locum",
};

interface JobRow {
  id: string;
  title: string;
  role_category: string;
  employment_type: string;
  compensation_min: number | null;
  compensation_max: number | null;
  compensation_period: string | null;
  compensation_visible: boolean;
  posted_at: string | null;
  dso_id: string;
  dso_name: string | null;
}

export default async function CandidateJobsPage() {
  const supabase = await createSupabaseServerClient();

  // Recent active jobs across all DSOs. Public read on `jobs` covers this.
  const { data: rawJobs } = await supabase
    .from("jobs")
    .select(
      "id, title, role_category, employment_type, compensation_min, compensation_max, compensation_period, compensation_visible, posted_at, dso_id"
    )
    .eq("status", "active")
    .is("deleted_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(20);

  const jobs = (rawJobs ?? []) as Array<{
    id: string;
    title: string;
    role_category: string;
    employment_type: string;
    compensation_min: number | null;
    compensation_max: number | null;
    compensation_period: string | null;
    compensation_visible: boolean;
    posted_at: string | null;
    dso_id: string;
  }>;

  // Pull DSO names in one batch.
  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const dsoNameById = new Map<string, string>();
  if (dsoIds.length > 0) {
    const { data: dsoRows } = await supabase
      .from("dsos")
      .select("id, name")
      .in("id", dsoIds);
    for (const d of (dsoRows ?? []) as Array<{ id: string; name: string }>) {
      dsoNameById.set(d.id, d.name);
    }
  }

  // Pull job_locations for chip rendering.
  const jobIds = jobs.map((j) => j.id);
  const locationsByJob = new Map<
    string,
    Array<{ city: string | null; state: string | null }>
  >();
  if (jobIds.length > 0) {
    const { data: jobLocs } = await supabase
      .from("job_locations")
      .select("job_id, location:dso_locations(city, state)")
      .in("job_id", jobIds);
    for (const row of (jobLocs ?? []) as unknown as Array<{
      job_id: string;
      location: { city: string | null; state: string | null } | null;
    }>) {
      if (!row.location) continue;
      const list = locationsByJob.get(row.job_id) ?? [];
      list.push(row.location);
      locationsByJob.set(row.job_id, list);
    }
  }

  const enriched: JobRow[] = jobs.map((j) => ({
    ...j,
    dso_name: dsoNameById.get(j.dso_id) ?? null,
  }));

  return (
    <CandidateShell active="jobs">
      <div className="space-y-8 max-w-[920px]">
        {/* Header */}
        <header className="space-y-3">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Jobs
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            Recently posted at verified DSOs.
          </h1>
          <p className="text-sm text-slate-body leading-relaxed max-w-[640px]">
            Twenty most-recent active roles. Use the full board for state
            filters, role filters, and the map view.
          </p>
          <div className="pt-2">
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft"
            >
              <Search className="size-3.5" />
              View the full board
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </header>

        {/* Recent jobs */}
        <section>
          <div className="flex items-baseline justify-between gap-4 mb-4">
            <h2 className="font-display text-xl font-bold text-ink">
              Recent
            </h2>
            <span className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
              {enriched.length === 0
                ? "No jobs right now"
                : enriched.length === 1
                  ? "1 role"
                  : `${enriched.length} roles`}
            </span>
          </div>

          {enriched.length === 0 ? (
            <div className="border border-[var(--rule)] bg-cream p-8 text-center">
              <Briefcase className="h-7 w-7 text-slate-meta mx-auto mb-3" />
              <p className="text-[14px] text-slate-body leading-relaxed">
                No active jobs right now. Check back soon — DSOs post
                throughout the week.
              </p>
            </div>
          ) : (
            <ul className="list-none border-t border-[var(--rule)]">
              {enriched.map((job) => (
                <JobRowItem
                  key={job.id}
                  job={job}
                  locations={locationsByJob.get(job.id) ?? []}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </CandidateShell>
  );
}

function JobRowItem({
  job,
  locations,
}: {
  job: JobRow;
  locations: Array<{ city: string | null; state: string | null }>;
}) {
  return (
    <li className="border-b border-[var(--rule)]">
      <Link
        href={`/jobs/${job.id}`}
        className="group relative block py-5 -mx-4 pl-5 pr-4 border-l-4 border-l-transparent transition-all duration-150 hover:border-l-heritage-deep hover:bg-white hover:shadow-[0_2px_18px_-12px_rgba(20,35,63,0.25)]"
      >
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                {ROLE_LABELS[job.role_category] ?? job.role_category}
              </span>
              <span className="text-[10px] tracking-[0.5px] text-slate-meta">
                {EMP_LABELS[job.employment_type] ?? job.employment_type}
              </span>
            </div>
            <div className="text-[17px] font-extrabold tracking-[-0.3px] text-ink leading-tight mb-1 transition-colors group-hover:text-heritage-deep">
              {job.title}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-meta">
              {job.dso_name && (
                <span className="font-semibold text-slate-body">
                  {job.dso_name}
                </span>
              )}
              {locations.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {formatLocations(locations)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 text-right flex-shrink-0">
            {job.compensation_visible && job.compensation_min !== null && (
              <div>
                <div className="text-[15px] font-extrabold text-ink leading-none">
                  {formatCompensation(job)}
                </div>
                {job.compensation_period && (
                  <div className="text-[9px] tracking-[1.2px] uppercase text-slate-meta mt-1.5 font-semibold">
                    {compensationPeriodLabel(job.compensation_period)}
                  </div>
                )}
              </div>
            )}
            <ArrowRight className="h-4 w-4 text-slate-meta transition-all duration-150 group-hover:text-heritage-deep group-hover:translate-x-1" />
          </div>
        </div>
      </Link>
    </li>
  );
}

function formatLocations(
  locs: Array<{ city: string | null; state: string | null }>
): string {
  if (locs.length === 0) return "";
  if (locs.length === 1) {
    return [locs[0].city, locs[0].state].filter(Boolean).join(", ");
  }
  const states = Array.from(new Set(locs.map((l) => l.state).filter(Boolean)));
  if (states.length === 1) return `${locs.length} locations · ${states[0]}`;
  return `${locs.length} locations`;
}

function formatCompensation(job: JobRow): string {
  if (job.compensation_min === null) return "";
  const fmt = new Intl.NumberFormat("en-US");
  if (job.compensation_max === null) return `$${fmt.format(job.compensation_min)}`;
  if (job.compensation_period === "annual") {
    const minK = Math.round(job.compensation_min / 1000);
    const maxK = Math.round(job.compensation_max / 1000);
    return `$${minK}K–$${maxK}K`;
  }
  return `$${fmt.format(job.compensation_min)}–$${fmt.format(job.compensation_max)}`;
}

function compensationPeriodLabel(p: string): string {
  return { hourly: "Per hour", daily: "Per day", annual: "Annual" }[p] ?? p;
}
