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
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { EeoSelfId } from "@/app/jobs/[id]/apply/eeo-self-id";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { MessagesThread } from "@/components/messaging/messages-thread";
import {
  CandidateInterviewPicker,
  type CandidateInterviewProposal,
} from "@/components/interviews/candidate-interview-picker";
import type { ApplicationMessageRow } from "@/lib/messages/actions";
import {
  APPLICATION_MESSAGE_SELECT,
  projectApplicationMessageRow,
} from "@/lib/inbox/queries";
import {
  CANDIDATE_KIND_LABELS,
  type StageKind,
} from "@/lib/applications/stages";
import { PracticeFitChip } from "@/components/practice-fit/practice-fit-chip";
import { WhyThisMatch } from "@/components/practice-fit/why-this-match";
import { classifyPlaceholderReason } from "@/components/practice-fit/placeholder";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

// Candidate-friendly labels are imported from the shared lib so the
// list page + detail page + inbox previews all source from one place.
// See CANDIDATE_KIND_LABELS in @/lib/applications/stages for the
// canonical funnel-labels intent (Option A locked 2026-05-12 PM).
const STATUS_LABELS = CANDIDATE_KIND_LABELS;

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
    .select("id, full_name, desired_roles")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) redirect("/candidate/sign-up");
  const candidateDesiredRoles =
    ((candidate as Record<string, unknown>).desired_roles as
      | string[]
      | null) ?? [];

  // RLS-scoped read of the candidate's own application row.
  const { data: rawApp } = await supabase
    .from("applications")
    .select("id, job_id, candidate_id, stage_id, created_at, updated_at")
    .eq("id", appId)
    .maybeSingle();

  if (!rawApp) notFound();

  // Voluntary EEO self-ID safety net (E2.17). The apply success screen also
  // offers it, but a re-navigation there can yank it before the candidate
  // answers — so we also surface it here (where they reliably land) when
  // they haven't recorded a response yet. RLS lets the candidate read their
  // own row.
  const { count: eeoCount } = await supabase
    .from("application_eeo_responses")
    .select("*", { count: "exact", head: true })
    .eq("application_id", appId);
  const showEeoCard = (eeoCount ?? 0) === 0;

  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    stage_id: string;
    /** Resolved kind for the current stage. */
    status: string;
    created_at: string;
    updated_at: string;
  };
  const appRaw = rawApp as Record<string, unknown>;
  // Resolve the stage_id → kind via service-role (RLS on
  // dso_pipeline_stages is DSO-scoped, candidates can't read it).
  let resolvedKind = "open";
  const stageId = appRaw.stage_id as string | undefined;
  if (stageId) {
    const admin = createSupabaseServiceRoleClient();
    const { data: stageRow } = await admin
      .from("dso_pipeline_stages")
      .select("kind")
      .eq("id", stageId)
      .maybeSingle();
    resolvedKind = (stageRow as { kind: string } | null)?.kind ?? "open";
  }
  const app: AppRow = {
    id: appRaw.id as string,
    job_id: appRaw.job_id as string,
    candidate_id: appRaw.candidate_id as string,
    stage_id: appRaw.stage_id as string,
    status: resolvedKind,
    created_at: appRaw.created_at as string,
    updated_at: appRaw.updated_at as string,
  };
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
  // Embeds application_message_attachments (single-level hop) so the
  // composer renders bubbles + attachments without a refetch.
  const { data: rawMessages, error: rawMessagesError } = await supabase
    .from("application_messages")
    .select(APPLICATION_MESSAGE_SELECT)
    .eq("application_id", appId)
    .order("created_at", { ascending: true });
  if (rawMessagesError) {
    console.error(
      "[candidate/applications] messages fetch",
      rawMessagesError
    );
  }
  const initialMessages = (
    (rawMessages ?? []) as Array<Record<string, unknown>>
  ).map(
    (row) =>
      projectApplicationMessageRow(row) as unknown as ApplicationMessageRow
  );

  const submitted = new Date(app.created_at);

  // Affiliation display — candidate viewer (Phase 4.5.b launch-blocker).
  // Falls back to "Hiring team" when the helper can't resolve (rare —
  // shouldn't happen for live applications). When the job is privately
  // affiliated, this returns the practice name (or "Multiple
  // locations") unless the DSO's reveal policy + application state
  // grants reveal. The same value drives both the inbox peer name
  // ("From: <X>") and the header "<Building2> <X>" line below.
  const displayed = job
    ? await getDisplayedDsoName({
        jobId: app.job_id,
        viewer: { role: "candidate", applicationId: app.id as string },
      })
    : null;
  const otherPartyName = displayed?.name ?? dso?.name ?? "Hiring team";
  const candidateName = candidate.full_name?.trim() || "You";

  // PracticeFit (Phase 5D v1.4 — wired into the candidate detail page).
  // Returns null when role-filtered or compute hasn't populated yet.
  // When null, we classify the reason against the candidate's own
  // desired_roles + the job's role to decide whether to render an
  // explanation panel (role_mismatch) or stay silent (unavailable).
  const practiceFit = await getPracticeFit(
    candidate.id as string,
    app.job_id
  );
  const practiceFitReason = practiceFit
    ? null
    : classifyPlaceholderReason(candidateDesiredRoles, job?.role_category);

  // Phase 5A — interview proposals to show the candidate. Picker
  // priority: most-recent BOOKED beats most-recent PENDING. If the
  // employer hits "Propose new times" on a confirmed booking without
  // rescheduling, a stale pending row coexists with the booking; the
  // booking is still the candidate's source of truth until cancelled.
  // We pull up to 5 active rows so the JS picker can pick correctly
  // regardless of created_at ordering.
  const { data: proposalRows } = await supabase
    .from("interview_proposals")
    .select(
      "id, status, interview_kind, duration_minutes, location_text, message_to_candidate, interview_proposal_options(id, start_at, sort_order), interview_bookings(id, selected_option_id, candidate_confirmed_at), applications!inner(jobs!inner(dso_id, dsos(name)))"
    )
    .eq("application_id", app.id)
    .in("status", ["pending", "booked"])
    .order("created_at", { ascending: false })
    .limit(5);
  let activeProposal: CandidateInterviewProposal | null = null;
  if (proposalRows && proposalRows.length > 0) {
    const pickedRow =
      proposalRows.find(
        (row) => (row as { status?: string }).status === "booked"
      ) ?? proposalRows[0];
    // interview_bookings has UNIQUE(proposal_id) — PostgREST returns
    // this as an OBJECT (one-to-one), not an array. Accept both shapes
    // — older Supabase versions and the typed cast both expected
    // arrays. Same root cause as the employer-side "booked shows as
    // Waiting on candidate" bug.
    type CandidateBookingShape = {
      id: string;
      selected_option_id: string;
      candidate_confirmed_at: string;
    };
    const p = pickedRow as unknown as {
      id: string;
      status: CandidateInterviewProposal["status"];
      interview_kind: CandidateInterviewProposal["interview_kind"];
      duration_minutes: number;
      location_text: string | null;
      message_to_candidate: string | null;
      interview_proposal_options: Array<{
        id: string;
        start_at: string;
        sort_order: number;
      }>;
      interview_bookings:
        | CandidateBookingShape
        | Array<CandidateBookingShape>
        | null;
      applications: Array<{
        jobs: Array<{
          dso_id: string;
          dsos: Array<{ name: string }>;
        }>;
      }>;
    };
    const bookingRel = p.interview_bookings;
    const booking: CandidateBookingShape | null = Array.isArray(bookingRel)
      ? bookingRel[0] ?? null
      : bookingRel ?? null;
    // Use the page-resolved `otherPartyName` (from getDisplayedDsoName)
    // rather than the nested embed — embed silently returns empty under
    // candidate-RLS, so dsoName was always falling back to "the practice".
    // otherPartyName also honors affiliation-reveal policy so private-DSO
    // candidates see the practice-level name not the corporate name.
    const dsoName =
      otherPartyName ||
      p.applications?.[0]?.jobs?.[0]?.dsos?.[0]?.name ||
      "the practice";
    activeProposal = {
      proposal_id: p.id,
      status: p.status,
      interview_kind: p.interview_kind,
      duration_minutes: p.duration_minutes,
      location_text: p.location_text,
      message_to_candidate: p.message_to_candidate,
      dso_name: dsoName,
      options: (p.interview_proposal_options ?? []).sort(
        (a, b) => a.sort_order - b.sort_order
      ),
      booked_option_id: booking?.selected_option_id ?? null,
      booked_at: booking?.candidate_confirmed_at ?? null,
    };
  }

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

      {activeProposal && (
        <CandidateInterviewPicker proposal={activeProposal} />
      )}

      {showEeoCard && (
        <div className="mb-8">
          <EeoSelfId applicationId={app.id} />
        </div>
      )}

      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Application ·{" "}
          {STATUS_LABELS[app.status as StageKind] ?? app.status}
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-2">
          {job?.title ?? "Job removed"}
        </h1>
        <div className="flex items-center gap-3 flex-wrap">
          {displayed && (
            <div className="text-[14px] text-slate-body inline-flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {displayed.name}
            </div>
          )}
          {practiceFit && (
            <PracticeFitChip fit={practiceFit} size="sm" />
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10">
        <div className="space-y-10">
          {/* Status + applied date */}
          <section className="border border-[var(--rule)] bg-cream p-6">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              Status
            </div>
            <div className="text-xl font-bold text-ink mb-2">
              {STATUS_LABELS[app.status as StageKind] ?? app.status}
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

          {/* PracticeFit. When we have a scored fit we render
              WhyThisMatch (with inline editors for lift-your-match
              flow); when fit is null but the reason is a role-mismatch,
              we render an explanation panel so the candidate isn't
              left wondering. Generic "unavailable" stays silent —
              compute usually populates within seconds. */}
          {practiceFit ? (
            <section>
              <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
                PracticeFit
              </h2>
              <WhyThisMatch
                fit={practiceFit}
                candidateId={candidate.id as string}
                jobId={app.job_id}
                audience="candidate"
              />
            </section>
          ) : practiceFitReason === "role_mismatch" ? (
            <section>
              <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-3">
                PracticeFit
              </h2>
              <div className="border border-[var(--rule)] bg-cream/40 p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-4 w-4 text-heritage-deep mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-ink mb-1">
                      This role isn&apos;t in your preferences
                    </p>
                    <p className="text-[13px] text-slate-body leading-relaxed mb-3">
                      PracticeFit only scores roles you&apos;ve told us
                      you&apos;re interested in. Your application still
                      stands — but if your goals have changed, update
                      your preferred roles to start seeing fit scores
                      on roles like this one.
                    </p>
                    <Link
                      href="/candidate/profile#roles"
                      className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
                    >
                      Update preferred roles
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

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
