/**
 * /employer/applications — cross-job application inbox.
 *
 * Lists all applications across the DSO's jobs with filters by job + status.
 * Click into any row to see candidate detail + transition status.
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { redirect } from "next/navigation";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Applications" };

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewed: "Reviewed",
  interviewing: "Interviewing",
  offered: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STATUS_ORDER = [
  "new",
  "reviewed",
  "interviewing",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
];

interface PageProps {
  searchParams: Promise<{ job?: string; status?: string }>;
}

export default async function ApplicationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Auth check + DSO context (shell does this too, but we need dso_id here)
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // Pull all jobs for this DSO (for the filter dropdown + name lookup)
  const { data: rawJobs } = await supabase
    .from("jobs")
    .select("id, title, status")
    .eq("dso_id", dsoUser.dso_id as string)
    .is("deleted_at", null)
    .order("posted_at", { ascending: false, nullsFirst: false });

  type JobRow = { id: string; title: string; status: string };
  const jobs = (rawJobs ?? []) as JobRow[];
  const jobMap = new Map(jobs.map((j) => [j.id, j]));
  const dsoJobIds = jobs.map((j) => j.id);

  // Query applications scoped to this DSO's jobs
  let appQuery = supabase
    .from("applications")
    .select(
      "id, job_id, candidate_id, status, cover_letter, created_at, updated_at"
    )
    .in("job_id", dsoJobIds.length > 0 ? dsoJobIds : ["__none__"])
    .order("created_at", { ascending: false });

  if (sp.job) appQuery = appQuery.eq("job_id", sp.job);
  if (sp.status) appQuery = appQuery.eq("status", sp.status);

  const { data: rawApps } = await appQuery;

  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    status: string;
    cover_letter: string | null;
    created_at: string;
    updated_at: string;
  };
  const apps = (rawApps ?? []) as AppRow[];

  // Pull candidate info in one batch
  const candidateIds = Array.from(new Set(apps.map((a) => a.candidate_id)));
  const { data: rawCands } = candidateIds.length
    ? await supabase
        .from("candidates")
        .select("id, full_name, current_title, headline, years_experience")
        .in("id", candidateIds)
    : { data: [] };

  type CandRow = {
    id: string;
    full_name: string | null;
    current_title: string | null;
    headline: string | null;
    years_experience: number | null;
  };
  const cands = (rawCands ?? []) as CandRow[];
  const candMap = new Map(cands.map((c) => [c.id, c]));

  // Status counts for the tab strip
  const statusCounts: Record<string, number> = {};
  for (const a of apps) {
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
  }

  return (
    <EmployerShell active="applications">
      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Application Inbox
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          Applications
        </h1>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed max-w-[640px]">
          Every application sent to your jobs. Click into a row to review the
          candidate, read their cover letter, and update status.
        </p>
      </header>

      {/* Filters */}
      <div className="mb-7 flex flex-wrap items-center gap-3">
        <form method="get" className="flex flex-wrap gap-3 items-end">
          <FilterSelect
            label="Job"
            name="job"
            value={sp.job ?? ""}
            options={[
              { value: "", label: "All jobs" },
              ...jobs.map((j) => ({ value: j.id, label: j.title })),
            ]}
          />
          <FilterSelect
            label="Status"
            name="status"
            value={sp.status ?? ""}
            options={[
              { value: "", label: "All statuses" },
              ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
            ]}
          />
          <button
            type="submit"
            className="px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
          >
            Apply
          </button>
          {(sp.job || sp.status) && (
            <Link
              href="/employer/applications"
              className="px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Status summary chips */}
      <div className="mb-7 flex flex-wrap gap-2">
        {STATUS_ORDER.filter((s) => statusCounts[s]).map((s) => (
          <Link
            key={s}
            href={
              sp.status === s
                ? "/employer/applications"
                : `/employer/applications?status=${s}`
            }
            className={`text-[10px] font-bold tracking-[1.5px] uppercase px-3 py-1.5 transition-colors ${
              sp.status === s
                ? "bg-ink text-ivory"
                : "bg-cream text-ink hover:bg-[var(--rule)]"
            }`}
          >
            {STATUS_LABELS[s]} · {statusCounts[s]}
          </Link>
        ))}
      </div>

      {/* List */}
      {apps.length === 0 ? (
        <div className="border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
            No applications yet
          </div>
          <p className="text-[15px] text-ink leading-relaxed mb-2">
            {sp.job || sp.status
              ? "Nothing matches your current filters."
              : "Once candidates start applying to your jobs, they'll show up here."}
          </p>
          <p className="text-[13px] text-slate-body leading-relaxed">
            <Link
              href="/employer/jobs"
              className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
            >
              Make sure your jobs are active
            </Link>{" "}
            and visible on the public job board.
          </p>
        </div>
      ) : (
        <div className="border border-[var(--rule)] bg-white">
          {apps.map((app) => {
            const job = jobMap.get(app.job_id);
            const cand = candMap.get(app.candidate_id);
            return (
              <Link
                key={app.id}
                href={`/employer/applications/${app.id}`}
                className="block p-5 border-b border-[var(--rule)] last:border-0 hover:bg-cream transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className="text-[15px] font-bold text-ink truncate">
                        {cand?.full_name ?? "Anonymous candidate"}
                      </div>
                      <span
                        className={`text-[9px] font-bold tracking-[1.5px] uppercase px-2.5 py-1 ${statusBadgeClass(app.status)}`}
                      >
                        {STATUS_LABELS[app.status] ?? app.status}
                      </span>
                    </div>
                    <div className="text-[13px] text-slate-body mb-2">
                      Applied to <span className="font-semibold text-ink">{job?.title ?? "Unknown job"}</span>
                    </div>
                    <div className="text-[12px] text-slate-meta">
                      {[cand?.current_title, cand?.headline]
                        .filter(Boolean)
                        .join(" · ") || "Profile minimal"}
                      {cand?.years_experience !== null &&
                        cand?.years_experience !== undefined && (
                          <> · {cand.years_experience} yr exp</>
                        )}
                      {" · "}Applied {new Date(app.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-meta flex-shrink-0 mt-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </EmployerShell>
  );
}

function FilterSelect({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
        {label}
      </div>
      <select
        name={name}
        defaultValue={value}
        className="px-3 py-2.5 bg-white border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "new":
      return "bg-cream text-ink";
    case "reviewed":
      return "bg-blue-50 text-blue-900";
    case "interviewing":
      return "bg-heritage/10 text-heritage-deep";
    case "offered":
    case "hired":
      return "bg-emerald-50 text-emerald-900";
    case "rejected":
    case "withdrawn":
      return "bg-slate-100 text-slate-600";
    default:
      return "bg-cream text-ink";
  }
}
