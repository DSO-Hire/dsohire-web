/**
 * /candidate/dashboard — landing page after candidate sign-in.
 *
 * Shows: profile completeness, recent applications (last 5), quick CTA to
 * browse jobs and complete profile. Lighter than the employer dashboard.
 */

import Link from "next/link";
import { ArrowRight, Briefcase, FileText, UserCircle } from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Dashboard",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Submitted",
  reviewed: "Reviewed",
  interviewing: "Interviewing",
  offered: "Offer extended",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export default async function CandidateDashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // shell handles redirect

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, summary, current_title, years_experience, desired_roles, desired_locations, availability, resume_url, linkedin_url"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) return null;

  // Profile completeness — lightweight scoring
  const fields = [
    candidate.full_name,
    candidate.headline,
    candidate.current_title,
    candidate.years_experience !== null && candidate.years_experience !== undefined,
    candidate.desired_roles && (candidate.desired_roles as string[])?.length > 0,
    candidate.resume_url,
    candidate.availability,
  ];
  const filled = fields.filter(Boolean).length;
  const total = fields.length;
  const pct = Math.round((filled / total) * 100);

  // Recent applications
  const { data: rawApps } = await supabase
    .from("applications")
    .select("id, job_id, status, created_at")
    .eq("candidate_id", candidate.id)
    .order("created_at", { ascending: false })
    .limit(5);

  type AppRow = {
    id: string;
    job_id: string;
    status: string;
    created_at: string;
  };
  const apps = (rawApps ?? []) as AppRow[];

  // Pull job titles for the cards
  const jobIds = apps.map((a) => a.job_id);
  const { data: rawJobs } = jobIds.length
    ? await supabase.from("jobs").select("id, title, dso_id").in("id", jobIds)
    : { data: [] };

  type JobRow = { id: string; title: string; dso_id: string };
  const jobs = (rawJobs ?? []) as JobRow[];
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const { data: rawDsos } = dsoIds.length
    ? await supabase.from("dsos").select("id, name").in("id", dsoIds)
    : { data: [] };
  type DsoRow = { id: string; name: string };
  const dsos = (rawDsos ?? []) as DsoRow[];
  const dsoMap = new Map(dsos.map((d) => [d.id, d]));

  return (
    <CandidateShell active="dashboard">
      <header className="mb-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Welcome back
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          {candidate.full_name?.split(" ")[0] ?? "Hello"}.
        </h1>
      </header>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)] mb-12">
        <StatCard
          label="Profile Completeness"
          value={`${pct}%`}
          sub={pct < 100 ? `${total - filled} fields to go` : "Profile complete"}
          accent={pct < 50 ? "warn" : pct < 100 ? "neutral" : "good"}
        />
        <StatCard
          label="Active Applications"
          value={String(apps.filter((a) => !["hired", "rejected", "withdrawn"].includes(a.status)).length)}
          sub="In review with employers"
        />
        <StatCard
          label="Total Applications"
          value={String(apps.length)}
          sub="All-time"
        />
      </div>

      {/* Profile completion CTA */}
      {pct < 100 && (
        <div className="border-l-4 border-heritage bg-cream p-6 mb-12">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
                Finish Your Profile
              </div>
              <p className="text-[15px] text-ink leading-relaxed mb-1">
                A complete profile gets {pct < 50 ? "3×" : "2×"} more responses from employers.
              </p>
              <p className="text-[13px] text-slate-body leading-relaxed">
                Add your headline, target role, location preferences, and resume.
              </p>
            </div>
            <Link
              href="/candidate/profile"
              className="inline-flex items-center gap-2 px-5 py-3 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              <UserCircle className="h-4 w-4" />
              Complete Profile
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Recent applications */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-5">
          <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta">
            Recent Applications
          </h2>
          {apps.length > 0 && (
            <Link
              href="/candidate/applications"
              className="text-[11px] font-bold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
            >
              View all →
            </Link>
          )}
        </div>

        {apps.length === 0 ? (
          <div className="border border-[var(--rule)] bg-white p-10 text-center">
            <FileText className="h-8 w-8 text-slate-meta mx-auto mb-4" strokeWidth={1.5} />
            <p className="text-[15px] text-ink leading-relaxed mb-2">
              You haven&apos;t applied to any jobs yet.
            </p>
            <p className="text-[13px] text-slate-body leading-relaxed mb-6">
              Browse open roles at verified dental support organizations.
            </p>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              <Briefcase className="h-4 w-4" />
              Browse Jobs
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-px bg-[var(--rule)] border border-[var(--rule)]">
            {apps.map((app) => {
              const job = jobMap.get(app.job_id);
              const dso = job ? dsoMap.get(job.dso_id) : null;
              const submitted = new Date(app.created_at);
              return (
                <Link
                  key={app.id}
                  href={`/jobs/${app.job_id}`}
                  className="bg-white p-5 hover:bg-cream transition-colors flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold text-ink truncate mb-0.5">
                      {job?.title ?? "Job removed"}
                    </div>
                    <div className="text-[12px] text-slate-body truncate">
                      {dso?.name ?? "Unknown DSO"} · Applied {submitted.toLocaleDateString()}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold tracking-[1.5px] uppercase px-3 py-1.5 flex-shrink-0 ${statusBadgeClass(app.status)}`}
                  >
                    {STATUS_LABELS[app.status] ?? app.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </CandidateShell>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: "warn" | "neutral" | "good";
}) {
  const valueClass =
    accent === "warn"
      ? "text-amber-700"
      : accent === "good"
        ? "text-heritage-deep"
        : "text-ink";
  return (
    <div className="bg-white p-6">
      <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
        {label}
      </div>
      <div className={`text-4xl font-extrabold tracking-[-1px] leading-none mb-2 ${valueClass}`}>
        {value}
      </div>
      <div className="text-[12px] text-slate-body">{sub}</div>
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
