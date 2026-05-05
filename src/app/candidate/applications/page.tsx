/**
 * /candidate/applications — full list of the candidate's applications.
 */

import Link from "next/link";
import { ChevronRight, Briefcase, MessageCircle } from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Applications" };

const STATUS_LABELS: Record<string, string> = {
  new: "Submitted",
  reviewed: "Reviewed",
  interviewing: "Interviewing",
  offered: "Offer extended",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export default async function CandidateApplicationsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return null;

  const { data: rawApps } = await supabase
    .from("applications")
    .select("id, job_id, status, created_at, updated_at")
    .eq("candidate_id", candidate.id as string)
    .order("created_at", { ascending: false });

  type AppRow = {
    id: string;
    job_id: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  const apps = (rawApps ?? []) as AppRow[];

  const jobIds = apps.map((a) => a.job_id);
  const { data: rawJobs } = jobIds.length
    ? await supabase
        .from("jobs")
        .select("id, title, dso_id, role_category, employment_type")
        .in("id", jobIds)
    : { data: [] };
  type JobRow = {
    id: string;
    title: string;
    dso_id: string;
    role_category: string;
    employment_type: string;
  };
  const jobs = (rawJobs ?? []) as JobRow[];
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  const dsoIds = Array.from(new Set(jobs.map((j) => j.dso_id)));
  const { data: rawDsos } = dsoIds.length
    ? await supabase.from("dsos").select("id, name").in("id", dsoIds)
    : { data: [] };
  type DsoRow = { id: string; name: string };
  const dsos = (rawDsos ?? []) as DsoRow[];
  const dsoMap = new Map(dsos.map((d) => [d.id, d]));

  // Unread inbound messages per application — view filters by participant
  // RLS, so we only see counts on applications we own. We only care about
  // employer-sent messages here (the badge surfaces "they replied to you").
  const appIds = apps.map((a) => a.id);
  const { data: rawUnread } = appIds.length
    ? await supabase
        .from("application_message_unread_counts")
        .select("application_id, sender_role, unread_count")
        .in("application_id", appIds)
        .eq("sender_role", "employer")
    : { data: [] };
  type UnreadRow = {
    application_id: string;
    sender_role: string;
    unread_count: number;
  };
  const unread = (rawUnread ?? []) as UnreadRow[];
  const unreadByAppId = new Map(
    unread.map((u) => [u.application_id, u.unread_count])
  );

  return (
    <CandidateShell active="applications">
      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          My Applications
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          {apps.length === 0
            ? "No applications yet."
            : apps.length === 1
              ? "1 application"
              : `${apps.length} applications`}
        </h1>
      </header>

      {apps.length === 0 ? (
        <div className="border border-[var(--rule)] bg-white p-12 text-center max-w-[680px]">
          <Briefcase className="h-8 w-8 text-slate-meta mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-[15px] text-ink leading-relaxed mb-2">
            You haven&apos;t applied to any jobs yet.
          </p>
          <p className="text-[14px] text-slate-body leading-relaxed mb-6">
            Browse open roles at verified dental support organizations.
          </p>
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2 px-6 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Browse Jobs
          </Link>
        </div>
      ) : (
        <div className="border border-[var(--rule)] bg-white">
          {apps.map((app) => {
            const job = jobMap.get(app.job_id);
            const dso = job ? dsoMap.get(job.dso_id) : null;
            const unreadCount = unreadByAppId.get(app.id) ?? 0;
            return (
              <Link
                key={app.id}
                href={`/candidate/applications/${app.id}`}
                className="block p-5 border-b border-[var(--rule)] last:border-0 hover:bg-cream transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1 flex-wrap">
                      <div className="text-[15px] font-bold text-ink truncate">
                        {job?.title ?? "Job removed"}
                      </div>
                      <span
                        className={`text-[9px] font-bold tracking-[1.5px] uppercase px-2.5 py-1 ${statusBadgeClass(app.status)}`}
                      >
                        {STATUS_LABELS[app.status] ?? app.status}
                      </span>
                      {unreadCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold tracking-[1.5px] uppercase px-2 py-1 bg-heritage/15 text-heritage-deep">
                          <MessageCircle className="h-3 w-3" />
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] text-slate-body">
                      {dso?.name ?? "Unknown DSO"} · Applied {new Date(app.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-meta flex-shrink-0 mt-1" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </CandidateShell>
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
