/**
 * /employer/applications/[id] — application detail.
 *
 * Shows candidate profile, screening responses, cover letter, signed resume
 * link (1-hour TTL), full-pipeline stage selector, status history, and a
 * notes editor.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  Briefcase,
  ExternalLink,
  FileText,
  Calendar,
  CheckSquare,
  ListChecks,
  ToggleLeft,
  Hash,
  AlignLeft,
  Type,
  Lock,
  MapPin,
  Phone,
  Sparkles,
  Clock,
  MessageSquare,
  Star,
  StickyNote,
  Users,
  History,
  ClipboardList,
  Layers,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmployerShell } from "@/components/employer/employer-shell";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { StageSelector } from "./stage-selector";
import { NotesEditor } from "./notes-editor";
import {
  CommentsThread,
  type CommentDsoUser,
  type InitialComment,
} from "./comments-thread";
import { MessagesThread } from "@/components/messaging/messages-thread";
import type { ApplicationMessageRow } from "@/lib/messages/actions";
import {
  ScorecardsSection,
  type InitialScorecard,
  type ScorecardReviewer,
} from "./scorecards-section";
import {
  getRubricForRole,
  parseAttributeScores,
  RECOMMENDATION_ORDER,
  type OverallRecommendation,
} from "@/lib/scorecards/rubric-library";
import {
  STAGE_COLORS,
  STAGE_LABELS,
  type ApplicationStatus,
  type KanbanStage,
} from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import type {
  ScreeningQuestion,
  ScreeningQuestionKind,
  ScreeningQuestionOption,
  ExistingAnswer,
} from "@/app/jobs/[id]/apply/types";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

const AVAILABILITY_LABEL: Record<string, string> = {
  immediate: "Immediately",
  "2_weeks": "Within 2 weeks",
  "1_month": "Within 1 month",
  passive: "Passively looking",
};

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

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
      "id, auth_user_id, full_name, phone, headline, summary, current_title, years_experience, desired_roles, desired_locations, availability, linkedin_url, resume_url, avatar_url, current_location_city, current_location_state"
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
    avatar_url: string | null;
    current_location_city: string | null;
    current_location_state: string | null;
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

  // Screening questions (in author-defined sort order) + this application's
  // answers. Two parallel selects rather than a join so RLS rules on each
  // table get a chance to filter independently and so the frontend can render
  // an "unanswered" state for a question even if no answer row exists.
  const { data: rawQuestions } = await supabase
    .from("job_screening_questions")
    .select("id, prompt, helper_text, kind, options, required, sort_order")
    .eq("job_id", app.job_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: rawAnswers } = await supabase
    .from("application_question_answers")
    .select(
      "question_id, answer_text, answer_choice, answer_choices, answer_number"
    )
    .eq("application_id", appId);

  const questions = ((rawQuestions ?? []) as Array<{
    id: string;
    prompt: string;
    helper_text: string | null;
    kind: ScreeningQuestionKind;
    options: ScreeningQuestionOption[] | null;
    required: boolean;
    sort_order: number;
  }>) as ScreeningQuestion[];
  const answers = (rawAnswers ?? []) as ExistingAnswer[];
  const answersByQuestionId = new Map<string, ExistingAnswer>(
    answers.map((a) => [a.question_id, a])
  );

  // ── DSO teammate roster (for @-mention autocomplete in the comments thread)
  // and initial comment list. Both are RLS-scoped, so we don't need to filter
  // beyond the dso_id / application_id we already verified above.
  const { data: rawDsoUsers } = await supabase
    .from("dso_users")
    .select("id, auth_user_id, full_name, role")
    .eq("dso_id", dsoUser.dso_id as string);

  type DsoUserRow = {
    id: string;
    auth_user_id: string;
    full_name: string | null;
    role: "owner" | "admin" | "recruiter";
  };
  const dsoUsersRows = (rawDsoUsers ?? []) as DsoUserRow[];
  const dsoUsersForThread: CommentDsoUser[] = dsoUsersRows.map((u) => ({
    id: u.id,
    authUserId: u.auth_user_id,
    fullName: u.full_name,
    role: u.role,
  }));

  // ── Direct candidate ↔ DSO messages thread (separate from internal
  // comments). Server-fetch in chronological order; the client component
  // renders + subscribes to realtime + handles read-receipts.
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
  // Unread count of messages from the candidate (we only badge inbound).
  const candidateUnreadCount = initialMessages.filter(
    (m) =>
      !m.deleted_at &&
      !m.read_at &&
      m.sender_role === "candidate"
  ).length;

  const { data: rawComments } = await supabase
    .from("application_comments")
    .select(
      "id, application_id, author_user_id, author_dso_user_id, body, mentioned_user_ids, created_at, updated_at, edited_at, deleted_at"
    )
    .eq("application_id", appId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  type CommentRow = {
    id: string;
    application_id: string;
    author_user_id: string;
    author_dso_user_id: string;
    body: string;
    mentioned_user_ids: string[];
    created_at: string;
    updated_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  };
  const commentRows = (rawComments ?? []) as CommentRow[];
  const dsoUserById = new Map(dsoUsersRows.map((u) => [u.id, u]));
  const initialComments: InitialComment[] = commentRows.map((c) => {
    const author = dsoUserById.get(c.author_dso_user_id) ?? null;
    return {
      ...c,
      author: author
        ? {
            id: author.id,
            fullName: author.full_name,
            role: author.role,
          }
        : null,
    };
  });

  // ── Scorecards: fetch the current viewer's row (any status) plus all
  // submitted rows from other reviewers. RLS lets every DSO member read
  // every row; we only filter out other reviewers' DRAFT rows here so the
  // detail page never leaks unsubmitted scores cross-reviewer.
  const scorecardSelect =
    "id, application_id, reviewer_user_id, reviewer_dso_user_id, rubric_id, attribute_scores, overall_recommendation, overall_note, status, created_at, updated_at, submitted_at";
  const { data: rawScorecards } = await supabase
    .from("application_scorecards")
    .select(scorecardSelect)
    .eq("application_id", appId)
    .or(`reviewer_user_id.eq.${user.id},status.eq.submitted`);

  type ScorecardRow = {
    id: string;
    application_id: string;
    reviewer_user_id: string;
    reviewer_dso_user_id: string;
    rubric_id: string;
    attribute_scores: unknown;
    overall_recommendation: string | null;
    overall_note: string | null;
    status: string;
    created_at: string;
    updated_at: string;
    submitted_at: string | null;
  };
  const scorecardRows = (rawScorecards ?? []) as ScorecardRow[];

  function rowToInitialScorecard(row: ScorecardRow): InitialScorecard {
    const reviewer = dsoUserById.get(row.reviewer_dso_user_id) ?? null;
    const status = row.status === "submitted" ? "submitted" : "draft";
    const recommendation =
      row.overall_recommendation &&
      (RECOMMENDATION_ORDER as string[]).includes(row.overall_recommendation)
        ? (row.overall_recommendation as OverallRecommendation)
        : null;
    return {
      id: row.id,
      application_id: row.application_id,
      reviewer_user_id: row.reviewer_user_id,
      reviewer_dso_user_id: row.reviewer_dso_user_id,
      rubric_id: row.rubric_id,
      attribute_scores: parseAttributeScores(row.attribute_scores),
      overall_recommendation: recommendation,
      overall_note: row.overall_note,
      status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      submitted_at: row.submitted_at,
      reviewer: reviewer
        ? {
            id: reviewer.id,
            authUserId: reviewer.auth_user_id,
            fullName: reviewer.full_name,
            role: reviewer.role,
          }
        : null,
    };
  }

  const myRow =
    scorecardRows.find((r) => r.reviewer_user_id === user.id) ?? null;
  const otherRows = scorecardRows.filter(
    (r) => r.reviewer_user_id !== user.id && r.status === "submitted"
  );

  const initialMyScorecard: InitialScorecard | null = myRow
    ? rowToInitialScorecard(myRow)
    : null;
  const initialOtherScorecards: InitialScorecard[] = otherRows.map(
    rowToInitialScorecard
  );
  // Sort other reviewers' submitted scorecards newest-submission-first so
  // the visible stack matches the realtime sort order applied in the client.
  initialOtherScorecards.sort((a, b) => {
    const at = new Date(a.submitted_at ?? a.updated_at).getTime();
    const bt = new Date(b.submitted_at ?? b.updated_at).getTime();
    return bt - at;
  });

  const scorecardReviewers: ScorecardReviewer[] = dsoUsersRows.map((u) => ({
    id: u.id,
    authUserId: u.auth_user_id,
    fullName: u.full_name,
    role: u.role,
  }));

  const scorecardRubric = getRubricForRole(job.role_category as string | null);

  // Tier gate for the AI rejection-reason suggester (Growth+ only). We
  // resolve to a simple "available | upgrade" state on the server so the
  // StageSelector can render the right surface without round-tripping. We
  // intentionally compute this once (not per-user) — it's a DSO-level gate.
  const { data: subTierRow } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("dso_id", dsoUser.dso_id as string)
    .maybeSingle();
  const subStatus = (subTierRow?.status as string | undefined) ?? null;
  const subTier = (subTierRow?.tier as string | undefined) ?? null;
  const aiSuggesterAvailable =
    subStatus !== null &&
    (subStatus === "active" || subStatus === "trialing") &&
    (subTier === "growth" || subTier === "enterprise");
  // Whether the application has enough signal to make AI suggestions
  // useful (≥1 screening answer OR ≥1 submitted scorecard).
  const aiSuggesterHasContext =
    answers.length > 0 ||
    scorecardRows.some((r) => r.status === "submitted");

  const submitted = new Date(app.created_at);
  const status = app.status as ApplicationStatus;

  // Display-name fallback. We have the candidate's auth email here from the
  // service-role lookup above, so prefer the email-username path
  // ("Candidate · jordan.r") over the candidate-id-prefix path that the
  // inbox falls back to.
  const displayName = candidateDisplayName({
    fullName: cand?.full_name,
    email: candidateEmail,
    candidateId: app.candidate_id,
  });

  // Header subtitle pieces — only render the line if at least one piece exists.
  const headerMetaParts: string[] = [];
  if (cand?.years_experience !== null && cand?.years_experience !== undefined) {
    headerMetaParts.push(`${cand.years_experience} yrs experience`);
  }
  if (cand?.availability) {
    headerMetaParts.push(
      AVAILABILITY_LABEL[cand.availability] ??
        cand.availability.replace(/_/g, " ")
    );
  }
  if (cand?.desired_roles && cand.desired_roles.length > 0) {
    const top = cand.desired_roles[0];
    headerMetaParts.push(ROLE_LABELS[top] ?? top.replace(/_/g, " "));
  }

  const titleLine = cand?.current_title ?? cand?.headline ?? null;

  // Location label for the candidate (preferred over their full address)
  const candidateLocation =
    [cand?.current_location_city, cand?.current_location_state]
      .filter(Boolean)
      .join(", ") || null;

  // The 10-section table-of-contents drives both the right-rail nav and
  // the section-header eyebrow numbers. Keep this list in sync with the
  // section IDs rendered below.
  const SECTIONS: Array<{
    num: string;
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { num: "01", id: "stage", label: "Pipeline stage", icon: Layers },
    { num: "02", id: "fit", label: "Practice Fit", icon: Sparkles },
    { num: "03", id: "resume", label: "Resume", icon: FileText },
    { num: "04", id: "snapshot", label: "Candidate snapshot", icon: Briefcase },
    { num: "05", id: "screening", label: "Screening responses", icon: ClipboardList },
    { num: "06", id: "messages", label: "Messages with candidate", icon: MessageSquare },
    { num: "07", id: "scorecards", label: "Scorecards", icon: Star },
    { num: "08", id: "comments", label: "Team comments", icon: Users },
    { num: "09", id: "notes", label: "Internal notes", icon: StickyNote },
    { num: "10", id: "activity", label: "Activity timeline", icon: History },
  ];

  return (
    <EmployerShell active="applications">
      {/* Top back-link strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6">
        <Link
          href="/employer/applications"
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to All Applications
        </Link>
        <Link
          href={`/employer/jobs/${job.id}`}
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors"
        >
          View in {String(job.title)} pipeline →
        </Link>
      </div>

      {/* Hero — avatar + name + meta + status pill + contact strip */}
      <header className="mb-8 border border-[var(--rule)] bg-white p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-5 min-w-0 flex-1">
            <Avatar
              name={cand?.full_name ?? displayName}
              imageUrl={cand?.avatar_url ?? null}
              size="2xl"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
                Application
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.05] text-ink mb-2">
                {displayName}
              </h1>
              {titleLine && (
                <div className="text-[15px] text-slate-body">{titleLine}</div>
              )}
              {(headerMetaParts.length > 0 || candidateLocation) && (
                <div className="text-[13px] text-slate-meta mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {candidateLocation && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {candidateLocation}
                    </span>
                  )}
                  {headerMetaParts.map((part, i) => (
                    <span key={i}>{i === 0 && candidateLocation ? `· ${part}` : part}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <span
            className={`text-[10px] font-bold tracking-[2px] uppercase px-3 py-2 ring-1 ring-inset ${statusBadgeClasses(status)}`}
          >
            {STAGE_LABELS[status] ?? status}
          </span>
        </div>

        {/* Contact strip — replaces the old sidebar Contact card */}
        <div className="mt-6 pt-5 border-t border-[var(--rule)] flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          {candidateEmail ? (
            <a
              href={`mailto:${candidateEmail}?subject=${encodeURIComponent(
                `Re: your application to ${job.title as string}`
              )}`}
              className="inline-flex items-center gap-1.5 text-heritage hover:text-heritage-deep font-semibold break-all"
            >
              <Mail className="h-3.5 w-3.5 flex-shrink-0" />
              {candidateEmail}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-meta italic">
              <Mail className="h-3.5 w-3.5" />
              Email unavailable
            </span>
          )}
          {cand?.phone && (
            <span className="inline-flex items-center gap-1.5 text-ink">
              <Phone className="h-3.5 w-3.5 text-slate-meta" />
              {cand.phone}
            </span>
          )}
          {cand?.linkedin_url && (
            <a
              href={cand.linkedin_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-heritage hover:text-heritage-deep font-semibold"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              LinkedIn
            </a>
          )}
          <span className="ml-auto text-slate-meta text-[12px]">
            Replies to your email also route to this application.
          </span>
        </div>

        {/* Job context bar */}
        <div className="mt-5 pt-5 border-t border-[var(--rule)] flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-body">
          <Briefcase className="h-3.5 w-3.5 text-heritage-deep" />
          <span>Applied to</span>
          <Link
            href={`/employer/jobs/${job.id}`}
            className="font-bold text-ink hover:text-heritage-deep transition-colors"
          >
            {job.title as string}
          </Link>
          <span className="text-slate-meta">·</span>
          <span>
            {ROLE_LABELS[String(job.role_category)] ?? String(job.role_category)} ·{" "}
            {String(job.employment_type).replace(/_/g, " ")}
          </span>
          <span className="text-slate-meta">·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3 text-slate-meta" />
            Submitted {submitted.toLocaleDateString()} at{" "}
            {submitted.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
      </header>

      {/* Two-column body — main 10-section column + sticky right-rail TOC */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-10">
        <div className="space-y-12 min-w-0">
          {/* 01 · Pipeline stage */}
          <DetailSection
            id="stage"
            num="01"
            title="Pipeline stage"
            icon={Layers}
          >
            <StageSelector
              applicationId={app.id}
              currentStatus={status}
              candidateName={displayName}
              jobTitle={String(job.title)}
              aiSuggesterAvailable={aiSuggesterAvailable}
              aiSuggesterHasContext={aiSuggesterHasContext}
            />
          </DetailSection>

          {/* 02 · Practice Fit (Phase 5D placeholder banner per scope §6.4) */}
          <DetailSection
            id="fit"
            num="02"
            title="Practice Fit"
            icon={Sparkles}
            subtitle="DISC-derived match score arriving in a future update."
          >
            <PracticeFitPlaceholderBanner />
          </DetailSection>

          {/* 03 · Resume */}
          <DetailSection
            id="resume"
            num="03"
            title="Resume"
            icon={FileText}
          >
            {resumeSignedUrl ? (
              <a
                href={resumeSignedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-5 py-4 border border-[var(--rule-strong)] bg-white hover:bg-cream transition-colors max-w-full"
              >
                <FileText className="h-5 w-5 text-heritage-deep flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-ink truncate">
                    {resumeFileName ?? "Resume"}
                  </div>
                  <div className="text-[12px] text-slate-body">
                    Click to open · expires in 1 hour
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-meta ml-2" />
              </a>
            ) : (
              <p className="text-[14px] text-slate-meta italic">
                No resume on file.
              </p>
            )}
          </DetailSection>

          {/* 04 · Candidate Snapshot — folds in cover letter + summary +
                preferences into one compact card. */}
          <DetailSection
            id="snapshot"
            num="04"
            title="Candidate snapshot"
            icon={Briefcase}
          >
            <div className="space-y-5">
              {app.cover_letter && (
                <div className="border border-[var(--rule)] bg-cream/40 p-5">
                  <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-2">
                    Cover letter
                  </div>
                  <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
                    {app.cover_letter}
                  </p>
                </div>
              )}
              {cand && (
                <div className="border border-[var(--rule)] bg-white p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                  {cand.headline && (
                    <DetailRow label="Headline" value={cand.headline} />
                  )}
                  {cand.availability && (
                    <DetailRow
                      label="Availability"
                      value={
                        AVAILABILITY_LABEL[cand.availability] ??
                        cand.availability.replace(/_/g, " ")
                      }
                    />
                  )}
                  {cand.desired_roles && cand.desired_roles.length > 0 && (
                    <DetailRow
                      label="Open to"
                      value={cand.desired_roles
                        .map((r) => ROLE_LABELS[r] ?? r.replace(/_/g, " "))
                        .join(", ")}
                    />
                  )}
                  {cand.desired_locations && cand.desired_locations.length > 0 && (
                    <DetailRow
                      label="Locations"
                      value={cand.desired_locations.join(", ")}
                    />
                  )}
                  {cand.summary && (
                    <div className="sm:col-span-2">
                      <DetailRow label="Summary" value={cand.summary} />
                    </div>
                  )}
                </div>
              )}
              {!app.cover_letter && !cand && (
                <p className="text-[14px] text-slate-meta italic">
                  No candidate snapshot data yet.
                </p>
              )}
            </div>
          </DetailSection>

          {/* 05 · Screening responses */}
          <DetailSection
            id="screening"
            num="05"
            title="Screening responses"
            icon={ClipboardList}
            subtitle={
              questions.length > 0
                ? `Answers to the ${questions.length} screening question${questions.length === 1 ? "" : "s"} on this job.`
                : undefined
            }
          >
            {questions.length === 0 ? (
              <p className="text-[14px] text-slate-meta italic">
                No screening questions on this job.
              </p>
            ) : (
              <div className="border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
                {questions.map((q) => (
                  <ScreeningResponseRow
                    key={q.id}
                    question={q}
                    answer={answersByQuestionId.get(q.id) ?? null}
                  />
                ))}
              </div>
            )}
          </DetailSection>

          {/* 06 · Messages with candidate — candidate-facing surface,
                rendered before the internal-workspace divider. */}
          <DetailSection
            id="messages"
            num="06"
            title="Messages with candidate"
            icon={MessageSquare}
            subtitle="Direct candidate ↔ DSO thread. Replies route to email."
            badge={
              candidateUnreadCount > 0
                ? `${candidateUnreadCount} unread`
                : undefined
            }
            tone="candidate"
          >
            <MessagesThread
              applicationId={app.id}
              currentUserId={user.id}
              currentUserRole="employer"
              currentUserName={
                dsoUsersRows.find((u) => u.auth_user_id === user.id)
                  ?.full_name ?? "You"
              }
              otherPartyName={displayName}
              initialMessages={initialMessages}
            />
          </DetailSection>

          {/* ───── Internal workspace divider ───── */}
          <div className="pt-2">
            <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-slate-meta text-center mb-2">
              Internal workspace · only your team sees this
            </div>
            <div className="border-t border-[var(--rule-strong)]" />
          </div>

          {/* 07 · Scorecards */}
          <DetailSection
            id="scorecards"
            num="07"
            title="Scorecards"
            icon={Star}
            tone="internal"
            subtitle={`Each reviewer scores against the ${scorecardRubric.label.toLowerCase()} rubric. Drafts stay private until submitted.`}
          >
            <ScorecardsSection
              applicationId={app.id}
              currentUserId={user.id}
              dsoUsers={scorecardReviewers}
              rubric={scorecardRubric}
              initialMyScorecard={initialMyScorecard}
              initialOtherScorecards={initialOtherScorecards}
            />
          </DetailSection>

          {/* 08 · Team comments */}
          <DetailSection
            id="comments"
            num="08"
            title="Team comments"
            icon={Users}
            tone="internal"
            subtitle="@-mention teammates by typing @. The candidate cannot see this."
          >
            <CommentsThread
              applicationId={app.id}
              currentUserId={user.id}
              dsoUsers={dsoUsersForThread}
              initialComments={initialComments}
            />
          </DetailSection>

          {/* 09 · Internal notes */}
          <DetailSection
            id="notes"
            num="09"
            title="Internal notes"
            icon={StickyNote}
            tone="internal"
            subtitle="Visible to your team only. The candidate cannot see this."
          >
            <NotesEditor
              applicationId={app.id}
              initialValue={app.employer_notes ?? ""}
            />
          </DetailSection>

          {/* 10 · Activity timeline */}
          <DetailSection
            id="activity"
            num="10"
            title="Activity timeline"
            icon={History}
            subtitle="Every stage transition captured for this application."
          >
            {events.length === 0 ? (
              <p className="text-[14px] text-slate-meta italic">
                No activity recorded yet.
              </p>
            ) : (
              <ol className="list-none space-y-4 border-l-2 border-[var(--rule)] pl-5">
                {events.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[27px] top-1.5 block w-3 h-3 bg-ink rounded-full border-2 border-ivory" />
                    <div className="text-[13px] font-bold text-ink">
                      {ev.from_status
                        ? `${STAGE_LABELS[ev.from_status as ApplicationStatus] ?? ev.from_status} → ${STAGE_LABELS[ev.to_status as ApplicationStatus] ?? ev.to_status}`
                        : `Submitted as ${STAGE_LABELS[ev.to_status as ApplicationStatus] ?? ev.to_status}`}
                    </div>
                    <div className="text-[12px] text-slate-meta mt-0.5">
                      {ev.actor_type} ·{" "}
                      {new Date(ev.created_at).toLocaleString()}
                    </div>
                    {ev.note && (
                      <div className="text-[13px] text-slate-body mt-1 leading-snug">
                        {ev.note}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </DetailSection>
        </div>

        {/* Sticky right-rail TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-6">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-meta mb-4">
              On this page
            </div>
            <ol className="list-none space-y-1.5">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="group flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded text-[13px] text-slate-body hover:bg-cream hover:text-ink transition-colors"
                    >
                      <span className="text-[10px] font-bold tracking-[1.5px] text-slate-meta group-hover:text-heritage-deep transition-colors w-5">
                        {s.num}
                      </span>
                      <Icon className="h-3.5 w-3.5 text-slate-meta group-hover:text-heritage-deep transition-colors flex-shrink-0" />
                      <span className="leading-snug">{s.label}</span>
                    </a>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>
      </div>
    </EmployerShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * Section shell — numbered eyebrow + title + optional subtitle/badge,
 * with anchored scroll-margin so the right-rail TOC links land cleanly.
 * `tone` lets a section opt into the candidate-facing or internal visual
 * accent without us repeating the markup at every call site.
 * ───────────────────────────────────────────────────────────────────── */

function DetailSection({
  id,
  num,
  title,
  subtitle,
  icon,
  tone,
  badge,
  children,
}: {
  id: string;
  num: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "candidate" | "internal";
  badge?: string;
  children: React.ReactNode;
}) {
  const Icon = icon;
  const eyebrowColor =
    tone === "internal"
      ? "text-slate-meta"
      : tone === "candidate"
        ? "text-heritage-deep"
        : "text-slate-meta";
  return (
    <section id={id} className="scroll-mt-6">
      <header className="mb-4">
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold tracking-[2.5px] uppercase ${eyebrowColor}`}
        >
          <span className="inline-flex items-center gap-2">
            {tone === "internal" && <Lock className="h-3 w-3" />}
            <Icon className="h-3.5 w-3.5" />
            <span>{num} · {title}</span>
          </span>
          {badge && (
            <span className="text-[9px] font-bold tracking-[1.5px] uppercase px-2 py-0.5 bg-heritage/15 text-heritage-deep">
              {badge}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[13px] text-slate-meta mt-2 leading-relaxed">
            {subtitle}
          </p>
        )}
      </header>
      <div>{children}</div>
    </section>
  );
}

/**
 * Practice Fit placeholder banner. Per parity-sprint scope §6.4, we ship
 * the surface contract NOW with three sub-bars (Skills / Culture /
 * Logistics) showing a "coming Phase 5D" treatment. Schema reservations
 * (`applications.fit_score`, `applications.fit_breakdown`) are not yet
 * wired here — when 5D ships the matching, this component reads from
 * those columns and switches off the placeholder treatment.
 */
function PracticeFitPlaceholderBanner() {
  const bars: Array<{ label: string; helper: string }> = [
    { label: "Skills", helper: "Procedure overlap, PMS familiarity" },
    { label: "Culture", helper: "DISC-derived working style match" },
    { label: "Logistics", helper: "Location, schedule, comp" },
  ];
  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-6">
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-ink mb-1">
            <Sparkles className="h-4 w-4 text-heritage-deep" />
            <span className="text-[14px] font-bold">Practice Fit · —</span>
          </div>
          <p className="text-[13px] text-slate-body leading-relaxed max-w-[520px]">
            Match score combining hard-skill overlap, working-style match,
            and logistics. We&apos;re building this in-house — schedule
            arrives in a future update.
          </p>
        </div>
        <span className="text-[10px] font-bold tracking-[1.5px] uppercase px-2 py-1 bg-white border border-[var(--rule-strong)] text-slate-meta">
          Coming soon
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {bars.map((b) => (
          <div key={b.label} className="bg-white border border-[var(--rule)] p-4">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
              {b.label}
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-slate-200"
                style={{ width: "30%" }}
              />
            </div>
            <p className="text-[11px] text-slate-meta leading-snug">
              {b.helper}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta mb-1">
        {label}
      </div>
      <div className="text-[14px] text-ink leading-snug">{value}</div>
    </div>
  );
}

/**
 * Render the kanban-matched stage badge for the header. For the active
 * KANBAN_STAGES we lift the bg/ring/text triple straight from STAGE_COLORS
 * (single source of truth shared with the kanban columns). For the closed
 * states (rejected/withdrawn) which aren't in the kanban map, we use a muted
 * slate treatment.
 */
function statusBadgeClasses(status: ApplicationStatus): string {
  const KANBAN_KEYS: readonly KanbanStage[] = [
    "new",
    "reviewed",
    "interviewing",
    "offered",
    "hired",
  ];
  if ((KANBAN_KEYS as readonly string[]).includes(status)) {
    const c = STAGE_COLORS[status as KanbanStage];
    return `${c.bg} ${c.ring} ${c.text}`;
  }
  // rejected / withdrawn — muted closed-lane treatment.
  return "bg-slate-100 ring-slate-200 text-slate-600";
}

const KIND_ICON: Record<
  ScreeningQuestionKind,
  React.ComponentType<{ className?: string }>
> = {
  short_text: Type,
  long_text: AlignLeft,
  yes_no: ToggleLeft,
  single_select: CheckSquare,
  multi_select: ListChecks,
  number: Hash,
};

const KIND_LABEL: Record<ScreeningQuestionKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  yes_no: "Yes / No",
  single_select: "Single choice",
  multi_select: "Multi choice",
  number: "Number",
};

function formatAnswer(
  question: ScreeningQuestion,
  answer: ExistingAnswer | null
): { display: string; missing: boolean } {
  if (!answer) return { display: "Not answered", missing: true };

  switch (question.kind) {
    case "short_text":
    case "long_text": {
      const v = (answer.answer_text ?? "").trim();
      if (!v) return { display: "Not answered", missing: true };
      return { display: v, missing: false };
    }
    case "yes_no": {
      const v = (answer.answer_choice ?? "").trim();
      if (v === "yes") return { display: "Yes", missing: false };
      if (v === "no") return { display: "No", missing: false };
      return { display: "Not answered", missing: true };
    }
    case "number": {
      if (answer.answer_number === null || answer.answer_number === undefined) {
        return { display: "Not answered", missing: true };
      }
      return { display: String(answer.answer_number), missing: false };
    }
    case "single_select": {
      const id = answer.answer_choice;
      if (!id) return { display: "Not answered", missing: true };
      const opt = question.options?.find((o) => o.id === id);
      return { display: opt?.label ?? id, missing: false };
    }
    case "multi_select": {
      const ids = answer.answer_choices ?? [];
      if (ids.length === 0) return { display: "Not answered", missing: true };
      const labels = ids.map(
        (id) => question.options?.find((o) => o.id === id)?.label ?? id
      );
      return { display: labels.join(", "), missing: false };
    }
    default:
      return { display: "Not answered", missing: true };
  }
}

function ScreeningResponseRow({
  question,
  answer,
}: {
  question: ScreeningQuestion;
  answer: ExistingAnswer | null;
}) {
  const Icon = KIND_ICON[question.kind] ?? Calendar;
  const { display, missing } = formatAnswer(question, answer);

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <Icon className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-[14px] font-semibold text-ink leading-snug">
              {question.prompt}
            </div>
            <span className="text-[9px] font-bold tracking-[2px] uppercase text-slate-meta">
              {KIND_LABEL[question.kind]}
            </span>
            {question.required && (
              <span className="text-[9px] font-bold tracking-[2px] uppercase text-heritage-deep">
                Required
              </span>
            )}
          </div>
          {question.helper_text && (
            <div className="text-[13px] text-slate-meta mt-0.5 leading-snug">
              {question.helper_text}
            </div>
          )}
          <div
            className={`mt-2 text-[14px] leading-relaxed whitespace-pre-wrap ${
              missing ? "italic text-slate-meta" : "text-ink"
            }`}
          >
            {display}
          </div>
          {missing && question.required && (
            <div className="mt-1.5 text-[12px] font-bold tracking-[1px] uppercase text-red-700">
              Required question — no response
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
