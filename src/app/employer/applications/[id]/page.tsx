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
  FileSignature,
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
  ShieldCheck,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmployerShell } from "@/components/employer/employer-shell";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { StageSelector } from "./stage-selector";
import {
  EmployerInterviewSection,
  type InterviewProposalState,
} from "@/components/interviews/interview-section";
import { AffiliationCard } from "./affiliation-card";
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
  CredentialsSection,
  type CredentialLicenseRow,
  type CredentialCertificationRow,
} from "./credentials-section";
import {
  ReferencesSection,
  type ReferenceRequestRow,
} from "./references-section";
import {
  OfferSection,
  type OfferTemplateOption,
  type OfferSendRow,
} from "./offer-section";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import {
  getRubricForRole,
  parseAttributeScores,
  RECOMMENDATION_ORDER,
  type OverallRecommendation,
} from "@/lib/scorecards/rubric-library";
import {
  KIND_DEFAULT_LABELS,
  colorTripleFor,
  findStage,
  isTerminalKind,
  type PipelineStage,
  type StageKind,
} from "@/lib/applications/stages";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import { WhyThisMatch } from "@/components/practice-fit/why-this-match";
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
      "id, job_id, candidate_id, stage_id, cover_letter, resume_url, employer_notes, created_at, updated_at, affiliation_revealed, affiliation_revealed_at, affiliation_revealed_by_dso_user_id"
    )
    .eq("id", appId)
    .maybeSingle();

  if (!rawApp) notFound();

  // Practice Fit (Phase 5D v0) — RLS blocks the read when the
  // candidate's consent is 'off', so a null result means either
  // consent off or compute-not-yet-run. Either way, render the
  // consent-off banner.
  const fitCandidateId = (rawApp as Record<string, unknown>)
    .candidate_id as string;
  const fitJobId = (rawApp as Record<string, unknown>).job_id as string;
  const practiceFit = await getPracticeFit(fitCandidateId, fitJobId);

  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    stage_id: string;
    cover_letter: string | null;
    resume_url: string | null;
    employer_notes: string | null;
    created_at: string;
    updated_at: string;
    affiliation_revealed: boolean;
    affiliation_revealed_at: string | null;
    affiliation_revealed_by_dso_user_id: string | null;
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

  // Pull affiliation context for the AffiliationCard. Three things:
  //   1. Whether the job is publicly DSO-affiliated (uses the SQL
  //      helper we added with the launch-blocker migration so the
  //      most-private-inherits + corporate/regional logic stays in
  //      one place — no risk of drift between this page and the
  //      public surfaces).
  //   2. The DSO's name + reveal policy.
  //   3. The display name of the dso_users row that flipped the bit
  //      (if it's been flipped). Optional — we only show "Revealed
  //      by X" when both are present.
  const [
    { data: isPublicRpcRaw },
    { data: dsoForAffiliation },
    revealedByLookup,
  ] = await Promise.all([
    supabase.rpc("job_is_publicly_dso_affiliated", { p_job_id: app.job_id }),
    supabase
      .from("dsos")
      .select("id, name, affiliation_reveal_policy")
      .eq("id", dsoUser.dso_id)
      .maybeSingle(),
    app.affiliation_revealed_by_dso_user_id
      ? supabase
          .from("dso_users")
          .select("full_name")
          .eq("id", app.affiliation_revealed_by_dso_user_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const isPublicAffiliated = isPublicRpcRaw === true;
  const dsoNameForAffiliation =
    (dsoForAffiliation?.name as string | undefined) ?? "your DSO";
  const affiliationPolicy =
    (dsoForAffiliation?.affiliation_reveal_policy as
      | "never"
      | "after_hire"
      | "per_application"
      | undefined) ?? "never";
  const revealedByName =
    (revealedByLookup?.data?.full_name as string | null | undefined) ?? null;

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

  // Status history — snapshots both kind and label so the timeline
  // shows the DSO-customized stage name (e.g., "Interview → Phone
  // Screening") when two stages share a kind. Falls back to the
  // kind default for events recorded before the label-snapshot
  // migration landed.
  const { data: rawEvents } = await supabase
    .from("application_status_events")
    .select(
      "id, from_stage_kind, to_stage_kind, from_stage_label, to_stage_label, actor_type, note, created_at"
    )
    .eq("application_id", appId)
    .order("created_at", { ascending: true });

  type EventRow = {
    id: string;
    from_stage_kind: string | null;
    to_stage_kind: string;
    from_stage_label: string | null;
    to_stage_label: string | null;
    actor_type: string;
    note: string | null;
    created_at: string;
  };
  const events = (rawEvents ?? []) as EventRow[];

  // DSO pipeline stages — drives the StageSelector (per-DSO labels +
  // colors). Fetched once at the page level so the segmented control +
  // any future surface on this page can share.
  const { data: rawStages, error: stagesErr } = await supabase
    .from("dso_pipeline_stages")
    .select(
      "id, dso_id, kind, label, slug, sort_order, is_hidden, is_default, color_class"
    )
    .eq("dso_id", dsoUser.dso_id as string)
    .order("sort_order", { ascending: true });
  if (stagesErr) {
    console.warn("[application detail] stages fetch failed", stagesErr);
  }
  const stages = (rawStages ?? []) as PipelineStage[];
  const currentStageRow = findStage(stages, app.stage_id);
  const currentKind: StageKind = (currentStageRow?.kind ?? "open") as StageKind;
  const currentStageLabel =
    currentStageRow?.label ?? KIND_DEFAULT_LABELS[currentKind];

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
      "id, application_id, sender_user_id, sender_role, sender_dso_user_id, body, read_at, created_at, updated_at, edited_at, deleted_at, event_kind"
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

  // Phase 5A — interview proposals + their options + bookings.
  const { data: proposalRows } = await supabase
    .from("interview_proposals")
    .select(
      "id, status, interview_kind, duration_minutes, location_text, message_to_candidate, created_at, interview_proposal_options(id, start_at, sort_order), interview_bookings(id, selected_option_id, candidate_confirmed_at, candidate_notes)"
    )
    .eq("application_id", app.id)
    .order("created_at", { ascending: false });
  // interview_bookings has UNIQUE(proposal_id) — PostgREST treats this
  // as a one-to-one and returns an OBJECT, not an array. Older Supabase
  // versions returned arrays. Accept both shapes defensively — the
  // wrong assumption was the root cause of the "booked proposal shows
  // as Waiting on candidate" bug (active.booking falls to null and the
  // render falls through to PendingView).
  type BookingShape = {
    id: string;
    selected_option_id: string;
    candidate_confirmed_at: string;
    candidate_notes: string | null;
  };
  const interviewProposals: InterviewProposalState[] = (
    (proposalRows ?? []) as unknown as Array<{
      id: string;
      status: InterviewProposalState["status"];
      interview_kind: InterviewProposalState["interview_kind"];
      duration_minutes: number;
      location_text: string | null;
      message_to_candidate: string | null;
      created_at: string;
      interview_proposal_options: Array<{
        id: string;
        start_at: string;
        sort_order: number;
      }>;
      interview_bookings:
        | BookingShape
        | Array<BookingShape>
        | null;
    }>
  ).map((p) => {
    const bookingRel = p.interview_bookings;
    const bookingRow: BookingShape | null = Array.isArray(bookingRel)
      ? bookingRel[0] ?? null
      : bookingRel ?? null;
    return {
      proposal_id: p.id,
      status: p.status,
      interview_kind: p.interview_kind,
      duration_minutes: p.duration_minutes,
      location_text: p.location_text,
      message_to_candidate: p.message_to_candidate,
      created_at: p.created_at,
      options: (p.interview_proposal_options ?? []).sort(
        (a, b) => a.sort_order - b.sort_order
      ),
      booking: bookingRow
        ? {
            id: bookingRow.id,
            selected_option_id: bookingRow.selected_option_id,
            candidate_confirmed_at: bookingRow.candidate_confirmed_at,
            candidate_notes: bookingRow.candidate_notes,
          }
        : null,
    };
  });

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

  // ── Credentials (Phase 5B v1)
  // RLS on candidate_licenses + candidate_certifications grants DSO members
  // a SELECT scoped to candidates who applied to one of their jobs, so the
  // RLS-gated client is enough for the read here. Both selects are fired
  // in parallel.
  const [
    { data: rawLicenses, error: licensesErr },
    { data: rawCertifications, error: certificationsErr },
    { data: rawReferences, error: referencesErr },
  ] = await Promise.all([
    supabase
      .from("candidate_licenses")
      .select(
        "id, license_type, license_number, state, issued_date, expires_date, display_number, document_path, verification_status, verified_at"
      )
      .eq("candidate_id", app.candidate_id)
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_certifications")
      .select(
        "id, kind, level, issued_date, expires_date, document_path, verification_status, verified_at"
      )
      .eq("candidate_id", app.candidate_id)
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("reference_requests")
      .select(
        "id, reference_name, reference_email, reference_role, relationship, status, sent_at, completed_at, response_data, decline_reason, created_at"
      )
      .eq("application_id", app.id)
      .order("created_at", { ascending: false }),
  ]);
  if (licensesErr) {
    console.warn("[applications] candidate_licenses fetch failed", licensesErr);
  }
  if (certificationsErr) {
    console.warn(
      "[applications] candidate_certifications fetch failed",
      certificationsErr
    );
  }
  if (referencesErr) {
    console.warn("[applications] reference_requests fetch failed", referencesErr);
  }
  // Cast through unknown — display_number defaults false at the schema
  // level so a column-missing error would have surfaced above. We honor
  // display_number in the client component (never render the number
  // when false).
  const credentialLicenses = ((rawLicenses ?? []) as unknown) as CredentialLicenseRow[];
  const credentialCertifications = ((rawCertifications ?? []) as unknown) as CredentialCertificationRow[];
  const referenceRequests = ((rawReferences ?? []) as unknown) as ReferenceRequestRow[];

  // ── Offer letters (Phase 5A Track E + Track E completion)
  //
  // The section was originally gated on `currentKind === 'offer'` only,
  // which meant it disappeared the moment a candidate accepted (stage
  // flips to hired). That dropped the "Accepted by Jordan with typed
  // name X" indicator off the page entirely. Now we run the fetch
  // whenever the application *could* show an offer — i.e. on the offer
  // stage OR if any send rows exist for this application — and surface
  // the section accordingly. Two cheap indexed reads keep the gate
  // simple without the extra round trip.
  const onOfferStage = currentKind === "offer";
  let offerTemplates: OfferTemplateOption[] = [];
  let offerSends: OfferSendRow[] = [];
  // Candidate-view DSO name (affiliation-masked) + job location + an
  // employment-type label, used by OfferSection's preview so it
  // matches what the candidate will actually receive. The server
  // action re-resolves these for the real send; we duplicate the
  // resolution here so the preview is honest.
  let offerSectionDsoName: string = dsoNameForAffiliation;
  let offerSectionJobLocation: string = "";
  let offerSectionJobEmploymentType: string = "";
  {
    const [
      { data: rawTemplates, error: templatesErr },
      { data: rawSends, error: sendsErr },
    ] = await Promise.all([
      supabase
        .from("dso_offer_letter_templates")
        .select("id, name, body, is_archived, updated_at")
        .eq("dso_id", dsoUser.dso_id as string)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false }),
      supabase
        .from("application_offer_sends")
        .select(
          "id, template_id, recipient_email, subject, body_html, merge_values, sent_at, sent_by_user_id, dso_offer_letter_templates:dso_offer_letter_templates(id, name)"
        )
        .eq("application_id", app.id)
        .order("sent_at", { ascending: false }),
    ]);
    if (templatesErr) {
      console.warn("[applications] offer templates fetch failed", templatesErr);
    }
    if (sendsErr) {
      console.warn("[applications] offer sends fetch failed", sendsErr);
    }
    offerTemplates = ((rawTemplates ?? []) as Array<{
      id: string;
      name: string;
      body: string;
    }>).map((t) => ({ id: t.id, name: t.name, body: t.body }));

    // Resolve sender names for the offer-sends list. RLS lets a DSO
    // member read any dso_users row in their DSO, so this is a single
    // batch lookup keyed off the auth user ids.
    type RawSend = {
      id: string;
      template_id: string | null;
      recipient_email: string;
      subject: string;
      body_html: string;
      merge_values: Record<string, string> | null;
      sent_at: string;
      sent_by_user_id: string | null;
      dso_offer_letter_templates:
        | { id: string; name: string }
        | Array<{ id: string; name: string }>
        | null;
    };
    const rawSendRows = (rawSends ?? []) as unknown as RawSend[];
    const senderAuthIds = Array.from(
      new Set(
        rawSendRows
          .map((r) => r.sent_by_user_id)
          .filter((v): v is string => !!v)
      )
    );
    const senderNameByAuthId = new Map<string, string>();
    if (senderAuthIds.length > 0) {
      const { data: senderRows } = await supabase
        .from("dso_users")
        .select("auth_user_id, full_name")
        .in("auth_user_id", senderAuthIds)
        .eq("dso_id", dsoUser.dso_id as string);
      for (const row of (senderRows ?? []) as Array<{
        auth_user_id: string;
        full_name: string | null;
      }>) {
        if (row.full_name) senderNameByAuthId.set(row.auth_user_id, row.full_name);
      }
    }
    // Pull the candidate's Accept / Decline responses (Track E
    // completion) so the LatestSendCard can render "Accepted by Jordan
    // on May 12 at 3:42pm" inline. One response per send, max — the
    // unique(offer_send_id) constraint guarantees this.
    type RawResponse = {
      offer_send_id: string;
      response: string;
      responded_at: string;
      reason: string | null;
      signed_name: string | null;
    };
    const responseByOfferSendId = new Map<string, RawResponse>();
    const offerSendIds = rawSendRows.map((r) => r.id);
    if (offerSendIds.length > 0) {
      const { data: rawResponses, error: responsesErr } = await supabase
        .from("application_offer_responses")
        .select("offer_send_id, response, responded_at, reason, signed_name")
        .in("offer_send_id", offerSendIds);
      if (responsesErr) {
        console.warn(
          "[applications] offer responses fetch failed",
          responsesErr
        );
      }
      for (const row of (rawResponses ?? []) as RawResponse[]) {
        responseByOfferSendId.set(row.offer_send_id, row);
      }
    }

    offerSends = rawSendRows.map((r) => {
      const tplRel = r.dso_offer_letter_templates;
      const tpl = Array.isArray(tplRel) ? tplRel[0] ?? null : tplRel;
      const resp = responseByOfferSendId.get(r.id) ?? null;
      return {
        id: r.id,
        template_id: r.template_id,
        template_name: tpl?.name ?? null,
        recipient_email: r.recipient_email,
        subject: r.subject,
        body_html: r.body_html,
        merge_values: (r.merge_values ?? {}) as Record<string, string>,
        sent_at: r.sent_at,
        sender_name: r.sent_by_user_id
          ? senderNameByAuthId.get(r.sent_by_user_id) ?? null
          : null,
        response: resp
          ? {
              kind: resp.response as "accepted" | "declined",
              responded_at: resp.responded_at,
              reason: resp.reason,
              signed_name: resp.signed_name,
            }
          : null,
      };
    });

    // Resolve the candidate-view DSO name. Honors per-DSO affiliation
    // reveal policy + per-location private flags so the preview shows
    // the practice name (e.g. "67 Dental"), not the corporate parent
    // (e.g. "dso hire") when this job is privately affiliated. Same
    // posture as proposeInterview + reference flow + /r/[token].
    try {
      const displayed = await getDisplayedDsoName({
        jobId: app.job_id as string,
        viewer: { role: "candidate", applicationId: app.id },
      });
      if (displayed.name) offerSectionDsoName = displayed.name;
    } catch (e) {
      console.warn("[offer-section] dso name resolve failed", e);
    }

    // Job location — "City, State" from the first linked dso_location.
    const { data: jobLocRow } = await supabase
      .from("job_locations")
      .select("dso_locations:dso_locations(city, state)")
      .eq("job_id", app.job_id as string)
      .limit(1)
      .maybeSingle();
    if (jobLocRow) {
      const locRel = (jobLocRow as Record<string, unknown>).dso_locations as
        | Record<string, unknown>
        | Array<Record<string, unknown>>
        | null;
      const loc = Array.isArray(locRel) ? locRel[0] ?? null : locRel;
      if (loc) {
        const city = (loc.city as string | null) ?? "";
        const state = (loc.state as string | null) ?? "";
        offerSectionJobLocation = [city, state]
          .filter(Boolean)
          .join(", ");
      }
    }

    // Humanize employment_type ("full_time" → "Full-time").
    const rawEmp = (job.employment_type as string | null) ?? "";
    offerSectionJobEmploymentType = rawEmp
      ? rawEmp.charAt(0).toUpperCase() + rawEmp.slice(1).replace(/_/g, "-")
      : "";
  }

  // Section visibility — render the Offer section any time it's
  // current-stage relevant OR has historical state. The post-acceptance
  // flow flips stage to 'hired' and we still want the recruiter to
  // see the response card with the typed-name soft-sig.
  const showOfferSection = onOfferStage || offerSends.length > 0;

  const titleLine = cand?.current_title ?? cand?.headline ?? null;

  // Location label for the candidate (preferred over their full address)
  const candidateLocation =
    [cand?.current_location_city, cand?.current_location_state]
      .filter(Boolean)
      .join(", ") || null;

  // The 13-section table-of-contents drives both the right-rail nav and
  // the section-header eyebrow numbers. The "Offer" entry (07) is
  // gated on the application's current stage kind being 'offer' — when
  // it's not, the section + the TOC entry both disappear, so the
  // downstream Internal Workspace numbers still read 08-13.
  type SectionEntry = {
    num: string;
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  };
  const SECTIONS: SectionEntry[] = [
    { num: "01", id: "stage", label: "Pipeline stage", icon: Layers },
    { num: "02", id: "fit", label: "Practice Fit", icon: Sparkles },
    { num: "03", id: "resume", label: "Resume", icon: FileText },
    { num: "04", id: "snapshot", label: "Candidate snapshot", icon: Briefcase },
    { num: "05", id: "screening", label: "Screening responses", icon: ClipboardList },
    { num: "06", id: "messages", label: "Messages with candidate", icon: MessageSquare },
    ...(showOfferSection
      ? ([{ num: "07", id: "offer", label: "Offer", icon: FileSignature }] as SectionEntry[])
      : ([] as SectionEntry[])),
    { num: showOfferSection ? "08" : "07", id: "credentials", label: "Credentials", icon: ShieldCheck },
    { num: showOfferSection ? "09" : "08", id: "references", label: "References", icon: Mail },
    { num: showOfferSection ? "10" : "09", id: "scorecards", label: "Scorecards", icon: Star },
    { num: showOfferSection ? "11" : "10", id: "comments", label: "Team comments", icon: Users },
    { num: showOfferSection ? "12" : "11", id: "notes", label: "Internal notes", icon: StickyNote },
    { num: showOfferSection ? "13" : "12", id: "activity", label: "Activity timeline", icon: History },
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
            className={`text-[10px] font-bold tracking-[2px] uppercase px-3 py-2 ring-1 ring-inset ${statusBadgeClasses(currentKind)}`}
          >
            {currentStageLabel}
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
          {/* DSO Affiliation card — only renders when the job has at
              least one private-affiliation location. Self-suppresses
              for publicly-affiliated jobs. Sits above the numbered
              detail sections so the recruiter sees the affiliation
              context first. */}
          <AffiliationCard
            isPublicAffiliated={isPublicAffiliated}
            policy={affiliationPolicy}
            applicationStatus={currentKind}
            alreadyRevealed={app.affiliation_revealed}
            revealedAt={app.affiliation_revealed_at}
            revealedByName={revealedByName}
            applicationId={app.id}
            dsoName={dsoNameForAffiliation}
            candidateFirstName={displayName.split(" ")[0] ?? "Candidate"}
          />

          {/* 01 · Pipeline stage */}
          <DetailSection
            id="stage"
            num="01"
            title="Pipeline stage"
            icon={Layers}
          >
            <StageSelector
              applicationId={app.id}
              currentStageId={app.stage_id}
              currentKind={currentKind}
              stages={stages}
              candidateName={displayName}
              jobTitle={String(job.title)}
              aiSuggesterAvailable={aiSuggesterAvailable}
              aiSuggesterHasContext={aiSuggesterHasContext}
            />

            <div className="mt-6">
              <EmployerInterviewSection
                applicationId={app.id}
                candidateName={displayName}
                proposals={interviewProposals}
              />
            </div>
          </DetailSection>

          {/* 02 · Practice Fit (Phase 5D v0 — structured-feature scoring) */}
          <DetailSection
            id="fit"
            num="02"
            title="Practice Fit"
            icon={Sparkles}
            subtitle="Proprietary match score across role, comp, location, skills, employment type, and DSO size."
          >
            {practiceFit ? (
              <WhyThisMatch
                fit={practiceFit}
                candidateId={fitCandidateId}
                jobId={fitJobId}
                audience="employer"
              />
            ) : (
              <PracticeFitConsentOffBanner />
            )}
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
                    {displayName !== "Candidate"
                      ? `${displayName}'s resume`
                      : "Candidate resume"}
                  </div>
                  <div className="text-[12px] text-slate-body">
                    {resumeFileName
                      ? `${resumeFileName} · click to open · expires in 1 hour`
                      : "Click to open · expires in 1 hour"}
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

          {/* 07 · Offer — candidate-facing surface, only renders when
                the application's current stage kind is 'offer'. The
                downstream Internal Workspace sections renumber to
                08-13 when this is visible; otherwise they stay 07-12. */}
          {showOfferSection && (
            <DetailSection
              id="offer"
              num="07"
              title="Offer"
              icon={FileSignature}
              subtitle={`Send a templated offer letter to ${displayName} via email. Past sends are snapshotted as the legal record.`}
              tone="candidate"
            >
              <OfferSection
                applicationId={app.id}
                candidateName={displayName}
                candidateEmail={candidateEmail}
                dsoName={offerSectionDsoName}
                jobTitle={String(job.title)}
                jobLocation={offerSectionJobLocation}
                jobEmploymentType={offerSectionJobEmploymentType}
                templates={offerTemplates}
                sends={offerSends}
              />
            </DetailSection>
          )}

          {/* ───── Internal workspace ─────
              Visually differentiated so employers don't accidentally
              treat scorecards / comments / notes as candidate-visible.
              All workspace sections (07-12, or 08-13 when the
              candidate-facing Offer section is showing) wrap in a
              heritage-tinted box with a prominent header pill. v1.7
              bumped the wash from /[0.04] to /15 per Cam — barely-there
              tint wasn't reading as "this is private" at a glance. The
              white DetailSection cards inside still pop cleanly against
              the green wash. */}
          <div className="-mx-4 sm:-mx-6 mt-10 px-4 sm:px-6 py-8 bg-heritage/15 border-y-2 border-heritage/40">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-5 py-2 bg-heritage-deep text-ivory text-[12px] font-extrabold tracking-[3px] uppercase">
                <Lock className="h-3.5 w-3.5" />
                Internal Workspace
              </div>
              <p className="mt-3 text-[12px] text-slate-meta max-w-[480px] mx-auto leading-relaxed">
                Only your team sees what&apos;s below. Credentials,
                references, scorecards, comments, and notes never reach
                the candidate — keep anything candidate-bound in the
                Messages section above.
              </p>
            </div>

            <div className="space-y-10">

          {/* 08 (or 07 when no Offer section) · Credentials — licenses + certifications with verification + document download */}
          <DetailSection
            id="credentials"
            num={showOfferSection ? "08" : "07"}
            title="Credentials"
            icon={ShieldCheck}
            tone="internal"
            subtitle="Licenses + certifications the candidate has added. Mark items verified after reviewing — your action is logged for the audit trail."
          >
            <CredentialsSection
              applicationId={app.id}
              licenses={credentialLicenses}
              certifications={credentialCertifications}
            />
          </DetailSection>

          {/* 09 (or 08) · References — 2-3 professional references requested
                from the candidate's contacts. Available once past the
                screen stage; gating handled in the section component. */}
          <DetailSection
            id="references"
            num={showOfferSection ? "09" : "08"}
            title="References"
            icon={Mail}
            tone="internal"
            subtitle="Email 2-3 professional references a private link to a short 7-question form. Responses appear inline when they finish."
          >
            <ReferencesSection
              applicationId={app.id}
              candidateName={cand?.full_name ?? null}
              requests={referenceRequests}
              currentStageKind={currentKind}
            />
          </DetailSection>

          {/* 10 (or 09) · Scorecards */}
          <DetailSection
            id="scorecards"
            num={showOfferSection ? "10" : "09"}
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

          {/* 11 (or 10) · Team comments */}
          <DetailSection
            id="comments"
            num={showOfferSection ? "11" : "10"}
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

          {/* 12 (or 11) · Internal notes */}
          <DetailSection
            id="notes"
            num={showOfferSection ? "12" : "11"}
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

          {/* 13 (or 12) · Activity timeline */}
          <DetailSection
            id="activity"
            num={showOfferSection ? "13" : "12"}
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
                {events.map((ev) => {
                  // Prefer the DSO-customized label snapshot (recorded
                  // at event time) over the kind default. Events from
                  // before the label-snapshot migration only have kind,
                  // so we fall back gracefully.
                  const fromLabel = ev.from_stage_label
                    ? ev.from_stage_label
                    : ev.from_stage_kind
                      ? KIND_DEFAULT_LABELS[ev.from_stage_kind as StageKind] ??
                        ev.from_stage_kind
                      : null;
                  const toLabel = ev.to_stage_label
                    ? ev.to_stage_label
                    : KIND_DEFAULT_LABELS[ev.to_stage_kind as StageKind] ??
                      ev.to_stage_kind;
                  return (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[27px] top-1.5 block w-3 h-3 bg-ink rounded-full border-2 border-ivory" />
                    <div className="text-[13px] font-bold text-ink">
                      {fromLabel
                        ? `${fromLabel} → ${toLabel}`
                        : `Submitted as ${toLabel}`}
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
                  );
                })}
              </ol>
            )}
          </DetailSection>
            </div>
          </div>
          {/* ───── End internal workspace ───── */}
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
/**
 * Fit-unavailable banner — appears when getPracticeFit returns null.
 * v1.2 made the copy honest about the multiple causes:
 *   • candidate has practice_fit_consent='off' (RLS blocks the read)
 *   • role-as-filter rejected the pair (candidate's desired_roles
 *     doesn't include this job's role_category, post-canonicalization)
 *   • score hasn't been computed yet (rare — first-render races)
 *
 * We don't disambiguate here because RLS prevents us from knowing
 * whether the candidate has consent off vs role-filtered without
 * leaking whether the candidate exists. Generic copy + neutral tone.
 */
function PracticeFitConsentOffBanner() {
  return (
    <div className="border border-[var(--rule)] bg-cream/40 p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="h-4 w-4 text-heritage-deep mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-semibold text-ink mb-1">
            Practice Fit isn&apos;t available for this pair
          </p>
          <p className="text-[13px] text-slate-body leading-relaxed">
            This can happen when the candidate&apos;s privacy settings
            keep their score private, or when their role preferences
            don&apos;t cover this posting. Their application stands on
            its own — Practice Fit is informational only and never
            gates hiring decisions.
          </p>
        </div>
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
 * Render the kanban-matched stage badge for the header. For non-terminal
 * kinds we resolve the kind's default color triple via colorTripleFor();
 * for terminal kinds (rejected/withdrawn) we use a muted slate treatment.
 */
function statusBadgeClasses(kind: StageKind): string {
  if (isTerminalKind(kind)) {
    return "bg-slate-100 ring-slate-200 text-slate-600";
  }
  const c = colorTripleFor(null, kind);
  return `${c.bg} ${c.ring} ${c.text}`;
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
