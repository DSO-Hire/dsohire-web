/**
 * /candidate/applications/[id] — candidate-side application detail.
 *
 * Lightweight version of the employer detail surface focused on what the
 * candidate cares about: the job they applied to, current status, applied
 * date, and the direct two-way messages thread with the DSO.
 *
 * Status copy uses the candidate-audience-specific labels (see
 * src/app/candidate/applications/page.tsx) — NOT the employer-side
 * STAGE_LABELS, by design.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Briefcase, Calendar, Building2 } from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MessagesThread } from "@/components/messaging/messages-thread";
import type { ApplicationMessageRow } from "@/lib/messages/actions";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Submitted",
  reviewed: "Reviewed",
  interviewing: "Interviewing",
  offered: "Offer extended",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Application ${id.slice(0, 8)}` };
}

export default async function CandidateApplicationDetailPage({
  params,
}: PageProps) {
  const { id: appId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in");

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/sign-up");

  const { data: rawApp } = await supabase
    .from("applications")
    .select(
      "id, job_id, candidate_id, status, created_at, updated_at"
    )
    .eq("id", appId)
    .maybeSingle();

  if (!rawApp) notFound();

  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  const app = rawApp as AppRow;
  if (app.candidate_id !== (candidate.id as string)) notFound();

  const { data: rawJob } = await supabase
    .from("jobs")
    .select("id, title, dso_id, role_category, employment_type")
    .eq("id", app.job_id)
    .maybeSingle();
  type JobRow = {
    id: string;
    title: string;
    dso_id: string;
    role_category: string;
    employment_type: string;
  };
  const job = (rawJob ?? null) as JobRow | null;

  const { data: rawDso } = job
    ? await supabase
        .from("dsos")
        .select("id, name")
        .eq("id", job.dso_id)
        .maybeSingle()
    : { data: null };
  type DsoRow = { id: string; name: string };
  const dso = (rawDso ?? null) as DsoRow | null;

  // Messages — RLS already gates by candidate ownership, so we just project.
  const { data: rawMessages } = await supabase
    .from("application_messages")
    .select(
      "id, application_id, sender_user_id, sender_role, sender_dso_user_id, body, read_at, created_at, updated_at, edited_at, deleted_at"
    )
    .eq("application_id", appId)
    .order("created_at", { ascending: true });

  type MessageRow = {
    id: string;
    application_id: string;
    sender_user_id: string;
    sender_role: "candidate" | "employer";
    sender_dso_user_id: string | null;
    body: string;
    read_at: string | null;
    created_at: string;
    updated_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  };
  const initialMessages = ((rawMessages ?? []) as MessageRow[]).map(
    (m): ApplicationMessageRow => ({
      ...m,
      sender_role:
        m.sender_role === "candidate" ? "candidate" : "employer",
    })
  );

  const submitted = new Date(app.created_at);
  const otherPartyName = dso?.name ?? "Hiring team";
  const candidateName = candidate.full_name?.trim() || "You";

  return (
    <CandidateShell active="applications">
      <div className="mb-6">
        <Link
          href="/candidate/applications"
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to My Applications
        </Link>
      </div>

      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Application · {STATUS_LABELS[app.status] ?? app.status}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-2">
          {job?.title ?? "Job removed"}
        </h1>
        {dso && (
          <div className="text-[14px] text-slate-body inline-flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            {dso.name}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
        <div className="space-y-10">
          {/* Status + applied date */}
          <section className="border border-[var(--rule)] bg-cream p-6">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              Status
            </div>
            <div className="text-xl font-bold text-ink mb-2">
              {STATUS_LABELS[app.status] ?? app.status}
            </div>
            <div className="text-[13px] text-slate-body inline-flex items-center gap-2">
              <Calendar className="h-3 w-3" />
              Submitted {submitted.toLocaleDateString()} at{" "}
              {submitted.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          </section>

          {/* Direct candidate ↔ DSO messages */}
          <section>
            <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
              Messages
            </h2>
            <p className="text-[13px] text-slate-meta mb-3">
              Direct conversation with{" "}
              <span className="font-bold text-ink">{otherPartyName}</span>{" "}
              about this application.
            </p>
            <MessagesThread
              applicationId={app.id}
              currentUserId={user.id}
              currentUserRole="candidate"
              currentUserName={candidateName}
              otherPartyName={otherPartyName}
              initialMessages={initialMessages}
            />
          </section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-8">
          {job && (
            <section className="border border-[var(--rule)] bg-white p-5">
              <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
                The Role
              </div>
              <Link
                href={`/jobs/${job.id}`}
                className="text-[15px] font-bold text-ink hover:text-heritage-deep transition-colors block mb-1.5"
              >
                {job.title}
              </Link>
              <div className="text-[13px] text-slate-body inline-flex items-center gap-1.5">
                <Briefcase className="h-3 w-3" />
                {job.role_category} · {job.employment_type}
              </div>
            </section>
          )}
        </aside>
      </div>
    </CandidateShell>
  );
}
