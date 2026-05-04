/**
 * /employer/applications/[id] — application detail.
 *
 * Shows candidate profile, cover letter, signed resume link (1-hour TTL),
 * status transition controls, status history, and a notes editor.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Briefcase,
  ExternalLink,
  FileText,
} from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { StatusControls } from "./status-controls";
import { NotesEditor } from "./notes-editor";
import {
  STAGE_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/stages";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Application ${id.slice(0, 8)}` };
}

export default async function ApplicationDetailPage({ params }: PageProps) {
  const { id: appId } = await params;
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

  const { data: rawApp } = await supabase
    .from("applications")
    .select(
      "id, job_id, candidate_id, status, cover_letter, resume_url, employer_notes, created_at, updated_at"
    )
    .eq("id", appId)
    .maybeSingle();

  if (!rawApp) notFound();

  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    status: string;
    cover_letter: string | null;
    resume_url: string | null;
    employer_notes: string | null;
    created_at: string;
    updated_at: string;
  };
  const app = rawApp as AppRow;

  // Make sure this application is on a job that belongs to the current DSO
  // (RLS would block it anyway, but we want a clean 404 if not).
  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, dso_id, role_category, employment_type")
    .eq("id", app.job_id)
    .maybeSingle();
  if (!job || (job.dso_id as string) !== (dsoUser.dso_id as string)) notFound();

  const { data: rawCand } = await supabase
    .from("candidates")
    .select(
      "id, auth_user_id, full_name, phone, headline, summary, current_title, years_experience, desired_roles, desired_locations, availability, linkedin_url, resume_url"
    )
    .eq("id", app.candidate_id)
    .maybeSingle();

  type CandRow = {
    id: string;
    auth_user_id: string;
    full_name: string | null;
    phone: string | null;
    headline: string | null;
    summary: string | null;
    current_title: string | null;
    years_experience: number | null;
    desired_roles: string[] | null;
    desired_locations: string[] | null;
    availability: string | null;
    linkedin_url: string | null;
    resume_url: string | null;
  };
  const cand = (rawCand ?? null) as CandRow | null;

  // Pull the candidate's email from auth.users via service-role lookup.
  // candidates.auth_user_id → auth.users.email. The candidate row itself
  // doesn't store email (it's an auth-system-of-record value), so we go
  // through admin.getUserById. Failures are non-fatal — the rest of the
  // page renders without the contact email if anything goes wrong.
  let candidateEmail: string | null = null;
  if (cand?.auth_user_id) {
    try {
      const admin = createSupabaseServiceRoleClient();
      const { data: authUser } = await admin.auth.admin.getUserById(
        cand.auth_user_id
      );
      candidateEmail = authUser?.user?.email ?? null;
    } catch (err) {
      console.warn("[applications] candidate email lookup failed", err);
    }
  }

  // Resume signed URL (1-hour expiry). Resume can come from the application
  // override or fall back to the candidate's saved resume.
  const resumePath = app.resume_url ?? cand?.resume_url ?? null;
  let resumeSignedUrl: string | null = null;
  let resumeFileName: string | null = null;
  if (resumePath) {
    const { data: signed } = await supabase.storage
      .from("resumes")
      .createSignedUrl(resumePath, 60 * 60);
    resumeSignedUrl = signed?.signedUrl ?? null;
    resumeFileName = resumePath.split("/").pop()?.replace(/^\d+-/, "") ?? null;
  }

  // Status history
  const { data: rawEvents } = await supabase
    .from("application_status_events")
    .select("id, from_status, to_status, actor_type, note, created_at")
    .eq("application_id", appId)
    .order("created_at", { ascending: true });

  type EventRow = {
    id: string;
    from_status: string | null;
    to_status: string;
    actor_type: string;
    note: string | null;
    created_at: string;
  };
  const events = (rawEvents ?? []) as EventRow[];

  const submitted = new Date(app.created_at);

  return (
    <EmployerShell active="applications">
      <Link
        href="/employer/applications"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to All Applications
      </Link>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
            Application · {STAGE_LABELS[app.status as ApplicationStatus] ?? app.status}
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-2">
            {cand?.full_name ?? "Anonymous candidate"}
          </h1>
          <div className="text-[14px] text-slate-body">
            {cand?.current_title ?? cand?.headline ?? "Profile minimal"}
            {cand?.years_experience !== null && cand?.years_experience !== undefined && (
              <> · {cand.years_experience} years experience</>
            )}
          </div>
        </div>
        <span
          className={`text-[10px] font-bold tracking-[2px] uppercase px-3 py-2 ${statusBadgeClass(app.status)}`}
        >
          {STAGE_LABELS[app.status as ApplicationStatus] ?? app.status}
        </span>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
        {/* Main column */}
        <div className="space-y-10">
          {/* Job + applied date */}
          <section className="border border-[var(--rule)] bg-cream p-6">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              Applied To
            </div>
            <Link
              href={`/employer/jobs/${job.id}`}
              className="text-xl font-bold text-ink hover:text-heritage-deep transition-colors block mb-1.5"
            >
              {job.title as string}
            </Link>
            <div className="text-[12px] text-slate-body">
              <Briefcase className="inline h-3 w-3 mr-1 align-text-top" />
              {String(job.role_category)} · {String(job.employment_type)} ·
              Submitted {submitted.toLocaleDateString()} at {submitted.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </div>
          </section>

          {/* Status controls */}
          <section>
            <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-4">
              Update Status
            </h2>
            <StatusControls applicationId={app.id} currentStatus={app.status} />
          </section>

          {/* Cover letter */}
          {app.cover_letter && (
            <section>
              <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
                Cover Letter
              </h2>
              <div className="border border-[var(--rule)] bg-white p-6">
                <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
                  {app.cover_letter}
                </p>
              </div>
            </section>
          )}

          {/* Resume */}
          <section>
            <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
              Resume
            </h2>
            {resumeSignedUrl ? (
              <a
                href={resumeSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-5 py-4 border border-[var(--rule-strong)] bg-white hover:bg-cream transition-colors max-w-full"
              >
                <FileText className="h-5 w-5 text-heritage-deep flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">
                    {resumeFileName ?? "Resume"}
                  </div>
                  <div className="text-[11px] text-slate-body">
                    Click to open · expires in 1 hour
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-meta ml-2" />
              </a>
            ) : (
              <p className="text-[13px] text-slate-meta italic">
                No resume on file.
              </p>
            )}
          </section>

          {/* Candidate details */}
          {cand && (
            <section>
              <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
                Candidate Details
              </h2>
              <div className="border border-[var(--rule)] bg-white p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                {cand.headline && (
                  <DetailRow label="Headline" value={cand.headline} />
                )}
                {cand.availability && (
                  <DetailRow label="Availability" value={cand.availability.replace(/_/g, " ")} />
                )}
                {cand.desired_roles && cand.desired_roles.length > 0 && (
                  <DetailRow label="Open To" value={cand.desired_roles.join(", ")} />
                )}
                {cand.desired_locations && cand.desired_locations.length > 0 && (
                  <DetailRow label="Locations" value={cand.desired_locations.join(", ")} />
                )}
                {cand.summary && (
                  <div className="sm:col-span-2">
                    <DetailRow label="Summary" value={cand.summary} />
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Notes */}
          <section>
            <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
              Internal Notes
            </h2>
            <p className="text-[12px] text-slate-meta mb-3">
              Visible to your team only. The candidate cannot see this.
            </p>
            <NotesEditor
              applicationId={app.id}
              initialValue={app.employer_notes ?? ""}
            />
          </section>
        </div>

        {/* Sidebar — contact + history */}
        <aside className="space-y-8">
          <section className="border border-[var(--rule)] bg-white p-5">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
              Contact
            </div>

            {candidateEmail ? (
              <a
                href={`mailto:${candidateEmail}?subject=${encodeURIComponent(
                  `Re: your application to ${job.title as string}`
                )}`}
                className="inline-flex items-start gap-1.5 text-[13px] text-heritage hover:text-heritage-deep font-semibold mb-1.5 break-all leading-snug"
              >
                <Mail className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                {candidateEmail}
              </a>
            ) : (
              <div className="text-[12px] text-slate-meta italic mb-1.5">
                Email unavailable — reply to the application notification
                email instead.
              </div>
            )}

            {cand?.phone && (
              <div className="text-[13px] text-ink mt-2 mb-1.5">
                {cand.phone}
              </div>
            )}

            {cand?.linkedin_url && (
              <a
                href={cand.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-heritage hover:text-heritage-deep font-semibold mt-1"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                LinkedIn profile
              </a>
            )}

            <div className="text-[11px] text-slate-meta mt-4 pt-3 border-t border-[var(--rule)] leading-relaxed">
              Replying to the candidate&apos;s email also routes back to the
              application. Internal notes below are not visible to the candidate.
            </div>
          </section>

          <section>
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-4">
              Status History
            </div>
            <ol className="list-none space-y-4 border-l-2 border-[var(--rule)] pl-5">
              {events.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[27px] top-1.5 block w-3 h-3 bg-ink rounded-full border-2 border-ivory" />
                  <div className="text-[12px] font-bold text-ink">
                    {ev.from_status
                      ? `${STAGE_LABELS[ev.from_status as ApplicationStatus] ?? ev.from_status} → ${STAGE_LABELS[ev.to_status as ApplicationStatus] ?? ev.to_status}`
                      : `Submitted as ${STAGE_LABELS[ev.to_status as ApplicationStatus] ?? ev.to_status}`}
                  </div>
                  <div className="text-[11px] text-slate-meta mt-0.5">
                    {ev.actor_type} · {new Date(ev.created_at).toLocaleString()}
                  </div>
                  {ev.note && (
                    <div className="text-[12px] text-slate-body mt-1 leading-snug">
                      {ev.note}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </EmployerShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1">
        {label}
      </div>
      <div className="text-[13px] text-ink leading-snug">{value}</div>
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
