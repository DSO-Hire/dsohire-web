/**
 * /candidate/applications/saved — Phase 4.4 saved-jobs slice.
 *
 * Lists every job the candidate has bookmarked via the SaveJobButton.
 * Each row links into /jobs/[id] (where the bookmark control lives) so
 * the candidate can unsave directly from the row, then refresh.
 *
 * The full /candidate/applications surface gets the locked 7-tab IA
 * (All / Active / Interview / Offer / Closed / Saved / Hidden) in a
 * follow-up Phase 4.4 build. This route is the v1 of the Saved tab —
 * standalone for now so the table + bookmark control ship without
 * blocking on the bigger restructure.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { Bookmark, ArrowLeft, Building2, Briefcase, MapPin } from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Saved jobs" };

export default async function CandidateSavedJobsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/applications/saved");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/dashboard");

  // Pull saved jobs joined to job + DSO basics for display. We
  // intentionally exclude jobs that have been archived/closed — a
  // bookmarked role that's no longer hiring isn't useful.
  const { data: rawSaved } = await supabase
    .from("saved_jobs")
    .select(
      "id, saved_at, job:jobs(id, title, status, role_category, employment_type, dso_id, dsos:dsos(name, slug))"
    )
    .eq("candidate_id", candidate.id as string)
    .order("saved_at", { ascending: false });

  type SavedRow = {
    id: string;
    saved_at: string;
    job: {
      id: string;
      title: string;
      status: string;
      role_category: string;
      employment_type: string;
      dso_id: string;
      dsos: { name: string; slug: string | null } | null;
    } | null;
  };
  const saved = (rawSaved ?? []) as unknown as SavedRow[];
  const active = saved.filter((s) => s.job && s.job.status === "active");
  const inactive = saved.filter((s) => s.job && s.job.status !== "active");

  return (
    <CandidateShell active="applications">
      <Link
        href="/candidate/applications"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Back to applications
      </Link>

      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Saved jobs
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          {saved.length === 0
            ? "No saved jobs yet."
            : saved.length === 1
              ? "1 saved job"
              : `${saved.length} saved jobs`}
        </h1>
      </header>

      {saved.length === 0 ? (
        <div className="border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
          <Bookmark
            className="h-8 w-8 text-slate-meta mx-auto mb-4"
            strokeWidth={1.5}
          />
          <p className="text-[15px] text-ink leading-relaxed mb-2">
            You haven&apos;t saved any jobs yet.
          </p>
          <p className="text-[14px] text-slate-body leading-relaxed mb-6">
            Click <span className="font-semibold">Save</span> on any job page to
            bookmark it for later.
          </p>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Browse jobs
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <SavedList rows={active} title={`Active (${active.length})`} />
          )}
          {inactive.length > 0 && (
            <SavedList
              rows={inactive}
              title={`Closed or archived (${inactive.length})`}
              dimmed
            />
          )}
        </>
      )}
    </CandidateShell>
  );
}

function SavedList({
  rows,
  title,
  dimmed,
}: {
  rows: Array<{
    id: string;
    saved_at: string;
    job: {
      id: string;
      title: string;
      status: string;
      role_category: string;
      employment_type: string;
      dsos: { name: string; slug: string | null } | null;
    } | null;
  }>;
  title: string;
  dimmed?: boolean;
}) {
  return (
    <section className="mb-10">
      <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        {title}
      </h2>
      <ul className={`border border-[var(--rule)] bg-white ${dimmed ? "opacity-70" : ""}`}>
        {rows.map((row) => {
          const job = row.job!;
          const dsoName = job.dsos?.name ?? "DSO";
          return (
            <li key={row.id} className="border-b border-[var(--rule)] last:border-0">
              <Link
                href={`/jobs/${job.id}`}
                className="block p-5 hover:bg-cream transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold text-ink truncate">
                      {job.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-slate-body">
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3.5 text-slate-meta" />
                        {dsoName}
                      </span>
                      <span className="text-slate-meta">·</span>
                      <span className="inline-flex items-center gap-1">
                        <Briefcase className="size-3.5 text-slate-meta" />
                        {prettyEmploymentType(job.employment_type)}
                      </span>
                      <span className="text-slate-meta">·</span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5 text-slate-meta" />
                        {prettyRole(job.role_category)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-[12px] text-slate-meta">
                    Saved {timeAgo(new Date(row.saved_at))}
                    {job.status !== "active" && (
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mt-1">
                        {job.status}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function prettyEmploymentType(t: string): string {
  const map: Record<string, string> = {
    full_time: "Full Time",
    part_time: "Part Time",
    contract: "Contract",
    prn: "PRN",
    locum: "Locum",
  };
  return map[t] ?? t;
}

function prettyRole(r: string): string {
  const map: Record<string, string> = {
    associate_dentist: "Associate Dentist",
    specialist_dentist: "Specialist Dentist",
    dentist: "Dentist",
    hygienist: "Hygienist",
    dental_hygienist: "Dental Hygienist",
    assistant: "Dental Assistant",
    dental_assistant: "Dental Assistant",
    front_desk: "Front Desk",
    front_office: "Front Office",
    office_manager: "Office Manager",
    regional_manager: "Regional Manager",
  };
  return map[r] ?? r;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString();
}
