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
  Lock,
  Sparkles,
  MessageSquare,
  Star,
  StickyNote,
  Users,
  History,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { StageSelector } from "./stage-selector";
import {
  SendCustomEmailButton,
  type CustomTemplateOption,
} from "./send-custom-email-button";
import {
  EmployerInterviewSection,
  type InterviewProposalState,
} from "@/components/interviews/interview-section";
import { AffiliationCard } from "./affiliation-card";
import { NotesEditor } from "./notes-editor";
import { AssigneePicker } from "./assignee-picker";
import { TagsSection } from "./tags-section";
import { MoveCopyCard } from "./move-copy-card";
import {
  isTagColor,
  type ApplicationTag,
  type TagColor,
} from "@/lib/applications/tags";
import {
  CommentsThread,
  type CommentDsoUser,
  type InitialComment,
} from "./comments-thread";
import { MessagesThread } from "@/components/messaging/messages-thread";
import type { ApplicationMessageRow } from "@/lib/messages/actions";
import {
  APPLICATION_MESSAGE_SELECT,
  projectApplicationMessageRow,
} from "@/lib/inbox/queries";
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
import { dsoCanUseOfferApprovals } from "@/lib/offers/approval-tier";
import { jobRangeForGuardrail } from "@/lib/offers/comp-guardrail";
import { dsoCanUseSequences } from "@/lib/sequences/tier";
import {
  SequenceEnrollControl,
  type ActiveEnrollmentView,
} from "./sequence-enroll-control";
import {
  parseOfferApprovalPolicy,
  isEmpoweredSender,
} from "@/lib/offers/approval-policy";
import { effectivePermissions } from "@/lib/permissions/capabilities";
import {
  getRubricForRole,
  parseAttributeScores,
  RECOMMENDATION_ORDER,
  type OverallRecommendation,
} from "@/lib/scorecards/rubric-library";
import {
  KIND_DEFAULT_LABELS,
  findStage,
  type PipelineStage,
  type StageKind,
} from "@/lib/applications/stages";
// Lane 3 commit 1 — workspace chrome extracted from this file (markup
// unchanged): hero, section shell, screening/verification rows, timeline.
import { CandidateHero } from "./candidate-hero";
import {
  DetailRow,
  DetailSection,
  PracticeFitConsentOffBanner,
  RailCard,
} from "./detail-section";
import { ScreeningResponseRow, VerificationRow } from "./screening-rows";
import { ActivityTimeline } from "./activity-timeline";
import { WorkspaceTabs } from "./workspace-tabs";
import { AssistantContextRegistrar } from "@/components/support/assistant-context-registrar";
import { ReviewNav } from "./review-nav";
import { candidateDisplayName } from "@/lib/applications/candidate-display";
import { getPracticeFit } from "@/lib/practice-fit/get-or-compute";
import { WhyThisMatch } from "@/components/practice-fit/why-this-match";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import type {
  ScreeningQuestion,
  ScreeningQuestionKind,
  ScreeningQuestionOption,
  ExistingAnswer,
} from "@/app/jobs/[id]/apply/types";
import {
  VERIFICATION_TYPE_LABELS,
  getVerificationType,
  type VerificationTypeValue,
} from "@/lib/verifications/types";
import {
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
  type CanonicalOption,
} from "@/lib/candidate/canonical-lists";
import type { Metadata } from "next";

// Label maps for resolving linked-credential summaries in the
// Verifications block (5G.e Tier 2).
const LICENSE_LABEL_MAP = new Map<string, string>(
  LICENSE_TYPES.map((o: CanonicalOption) => [o.value, o.label])
);
const CERTIFICATION_LABEL_MAP = new Map<string, string>(
  CERTIFICATION_KINDS.map((o: CanonicalOption) => [o.value, o.label])
);
function licenseLabel(value: string): string {
  return LICENSE_LABEL_MAP.get(value) ?? value;
}
function certificationLabel(value: string): string {
  return CERTIFICATION_LABEL_MAP.get(value) ?? value;
}

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
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("applications")
      .select("candidate:candidates(full_name)")
      .eq("id", id)
      .maybeSingle();
    const rel = (data as Record<string, unknown> | null)?.candidate as
      | { full_name: string | null }
      | Array<{ full_name: string | null }>
      | null;
    const cand = Array.isArray(rel) ? rel[0] ?? null : rel;
    const name = (cand?.full_name ?? "").trim();
    if (name) return { title: `${name} · Application` };
  } catch {
    // fall through to the generic title
  }
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
    .select("dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // #83 Phase 2 — effective capability map for this viewer (role preset +
  // per-teammate overrides). Gates below: apps.view (whole page),
  // comp.view (offer history + comp-expectation answers), offers.draft
  // (compose), plus per-control flags threaded into the sections.
  const viewerPerms = effectivePermissions(
    dsoUser.role as string,
    (dsoUser as Record<string, unknown>).permission_overrides
  );
  if (!viewerPerms["apps.view"]) redirect("/employer/dashboard");

  const { data: rawApp } = await supabase
    .from("applications")
    .select(
      "id, job_id, candidate_id, stage_id, assigned_to_dso_user_id, cover_letter, resume_url, employer_notes, created_at, updated_at, affiliation_revealed, affiliation_revealed_at, affiliation_revealed_by_dso_user_id, knockout_failed_questions, knockout_failed_at"
    )
    .eq("id", appId)
    .maybeSingle();

  if (!rawApp) notFound();

  // PracticeFit (Phase 5D v0) — RLS blocks the read when the
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
    assigned_to_dso_user_id: string | null;
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
    .select("id, title, dso_id, role_category, employment_type, compensation_min, compensation_max, compensation_period, benefits, comp_model, est_annual_min, est_annual_max")
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
      .select("id, name, affiliation_reveal_policy, offer_approval_policy")
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
  const allAnswers = (rawAnswers ?? []) as ExistingAnswer[];

  // #83 Phase 2 — comp.view gate. Viewers without the capability never
  // receive compensation-expectation screening Q&A (stripped server-side,
  // not hidden in CSS). Library comp questions all match on prompt; custom
  // employer comp questions are caught by the same keywords.
  const compMasked = !viewerPerms["comp.view"];
  const COMP_PROMPT_RE =
    /compensation|salary|pay rate|pay range|pay expectation|hourly rate|daily rate|wage|production|collections/i;
  const visibleQuestions = compMasked
    ? questions.filter((q) => !COMP_PROMPT_RE.test(q.prompt))
    : questions;
  const visibleQuestionIds = new Set(visibleQuestions.map((q) => q.id));
  const answers = compMasked
    ? allAnswers.filter((a) => visibleQuestionIds.has(a.question_id))
    : allAnswers;
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
  // Teammate options for the manual assignee picker (id + display name).
  const assigneeTeammates = dsoUsersRows.map((u) => ({
    id: u.id,
    name: u.full_name || "Teammate",
  }));

  // ── Direct candidate ↔ DSO messages thread (separate from internal
  // comments). Server-fetch in chronological order; the client component
  // renders + subscribes to realtime + handles read-receipts.
  //
  // Embeds application_message_attachments (single-level hop) so the
  // composer doesn't have to refetch on first render.
  const { data: rawMessages, error: rawMessagesError } = await supabase
    .from("application_messages")
    .select(APPLICATION_MESSAGE_SELECT)
    .eq("application_id", appId)
    .order("created_at", { ascending: true });
  if (rawMessagesError) {
    console.error(
      "[employer/applications] messages fetch",
      rawMessagesError
    );
  }
  const initialMessages = (
    (rawMessages ?? []) as Array<Record<string, unknown>>
  ).map(
    (row) =>
      projectApplicationMessageRow(row) as unknown as ApplicationMessageRow
  );
  // Unread count of messages from the candidate (we only badge inbound).
  const candidateUnreadCount = initialMessages.filter(
    (m) =>
      !m.deleted_at &&
      !m.read_at &&
      m.sender_role === "candidate"
  ).length;

  const { data: rawTags } = await supabase
    .from("application_tags")
    .select("id, label, color")
    .eq("application_id", appId)
    .order("created_at", { ascending: true });
  const initialTags: ApplicationTag[] = (rawTags ?? []).map((t) => ({
    id: t.id as string,
    label: t.label as string,
    color: (isTagColor(t.color as string) ? (t.color as TagColor) : "slate"),
  }));

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
    (subTier === "growth" || subTier === "scale" || subTier === "enterprise");

  // Same Growth+ gate unlocks the "Send custom email" button next to the
  // StageSelector. When unlocked, pull all the DSO's custom + non-archived
  // templates so the button's dialog has them ready (no client-side fetch).
  const canSendCustomEmail = aiSuggesterAvailable;
  let customTemplateOptions: CustomTemplateOption[] = [];
  if (canSendCustomEmail) {
    const { data: tplRows } = await supabase
      .from("email_templates")
      .select("id, kind, name, description, subject, body_html")
      .eq("dso_id", dsoUser.dso_id as string)
      .eq("is_custom", true)
      .eq("is_archived", false)
      .order("name", { ascending: true });
    customTemplateOptions = ((tplRows ?? []) as Array<{
      id: string;
      kind: string;
      name: string | null;
      description: string | null;
      subject: string;
      body_html: string;
    }>).map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name ?? "(unnamed)",
      description: row.description,
      subject: row.subject,
      body_html: row.body_html,
    }));
  }
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
    { data: rawEducation, error: educationErr },
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
    // Education rows — only needed to resolve linked-credential summaries
    // for the Verifications block below.
    supabase
      .from("candidate_education")
      .select("id, school_name, degree, field_of_study, end_year")
      .eq("candidate_id", app.candidate_id),
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
  if (educationErr) {
    console.warn("[applications] candidate_education fetch failed", educationErr);
  }
  // Cast through unknown — display_number defaults false at the schema
  // level so a column-missing error would have surfaced above. We honor
  // display_number in the client component (never render the number
  // when false).
  const credentialLicenses = ((rawLicenses ?? []) as unknown) as CredentialLicenseRow[];
  const credentialCertifications = ((rawCertifications ?? []) as unknown) as CredentialCertificationRow[];
  const referenceRequests = ((rawReferences ?? []) as unknown) as ReferenceRequestRow[];
  const educationRows = (rawEducation ?? []) as Array<{
    id: string;
    school_name: string;
    degree: string | null;
    field_of_study: string | null;
    end_year: number | null;
  }>;

  // ── Verifications (5G.e Tier 2)
  // What the job requires (job_verification_requirements) + what this
  // candidate self-attested at apply time (application_verifications).
  // Two parallel selects; if the job lists zero requirements the block
  // below renders nothing (mirrors the screening block's empty-hide).
  const [
    { data: rawVerifReqs, error: verifReqsErr },
    { data: rawAppVerifs, error: appVerifsErr },
  ] = await Promise.all([
    supabase
      .from("job_verification_requirements")
      .select("verification_type, required")
      .eq("job_id", app.job_id),
    supabase
      .from("application_verifications")
      .select(
        "verification_type, attested, attested_at, note, application_verification_credentials(credential_type, credential_id)"
      )
      .eq("application_id", appId),
  ]);
  if (verifReqsErr) {
    console.warn(
      "[applications] job_verification_requirements fetch failed",
      verifReqsErr
    );
  }
  if (appVerifsErr) {
    console.warn(
      "[applications] application_verifications fetch failed",
      appVerifsErr
    );
  }
  const verificationRequirements = (rawVerifReqs ?? []) as Array<{
    verification_type: string;
    required: boolean;
  }>;
  // 5G.e Tier 2 (multi-credential, migration ...004): each
  // application_verifications row carries 0..N linked credentials via the
  // application_verification_credentials join table, embedded here.
  const applicationVerifications = (rawAppVerifs ?? []) as unknown as Array<{
    verification_type: string;
    attested: boolean;
    attested_at: string | null;
    note: string | null;
    application_verification_credentials:
      | Array<{ credential_type: string; credential_id: string }>
      | null;
  }>;
  const appVerifByType = new Map(
    applicationVerifications.map((v) => [v.verification_type, v])
  );

  // Resolve a linked profile credential to a short human-readable summary.
  // Lightweight in-memory lookup against the rows already fetched above.
  function resolveLinkedCredential(
    type: string | null,
    id: string | null
  ): string | null {
    if (!type || !id) return null;
    if (type === "candidate_license") {
      const row = credentialLicenses.find((r) => r.id === id);
      if (!row) return "Linked license (no longer on profile)";
      const parts = [licenseLabel(row.license_type)];
      if (row.state) parts.push(row.state);
      return parts.join(" · ");
    }
    if (type === "candidate_certification") {
      const row = credentialCertifications.find((r) => r.id === id);
      if (!row) return "Linked certification (no longer on profile)";
      const parts = [certificationLabel(row.kind)];
      if (row.level) parts.push(row.level);
      return parts.join(" · ");
    }
    if (type === "candidate_education") {
      const row = educationRows.find((r) => r.id === id);
      if (!row) return "Linked education (no longer on profile)";
      const parts: string[] = [];
      if (row.degree) parts.push(row.degree);
      if (row.field_of_study) parts.push(row.field_of_study);
      const lead = parts.length > 0 ? parts.join(", ") : row.school_name;
      const tail =
        parts.length > 0
          ? row.school_name + (row.end_year ? ` (${row.end_year})` : "")
          : row.end_year
            ? `(${row.end_year})`
            : "";
      return tail ? `${lead} — ${tail}` : lead;
    }
    return null;
  }

  // Resolve 0..N linked credentials to human-readable summaries + a
  // `linkable` flag — true when the credential is a license/certification
  // that still exists on the candidate's profile, so the Verifications
  // section can deep-link to its row (document + verify controls) in the
  // Credentials section below. Education has no Credentials-section row
  // and no document, so it stays plain text.
  function resolveLinkedCredentials(
    creds:
      | Array<{ credential_type: string; credential_id: string }>
      | null
      | undefined
  ): Array<{ id: string; type: string; summary: string; linkable: boolean }> {
    if (!creds || creds.length === 0) return [];
    const out: Array<{
      id: string;
      type: string;
      summary: string;
      linkable: boolean;
    }> = [];
    for (const c of creds) {
      const summary = resolveLinkedCredential(
        c.credential_type,
        c.credential_id
      );
      if (summary === null) continue;
      let linkable = false;
      if (c.credential_type === "candidate_license") {
        linkable = credentialLicenses.some((r) => r.id === c.credential_id);
      } else if (c.credential_type === "candidate_certification") {
        linkable = credentialCertifications.some(
          (r) => r.id === c.credential_id
        );
      }
      out.push({
        id: c.credential_id,
        type: c.credential_type,
        summary,
        linkable,
      });
    }
    return out;
  }

  const verificationRows = verificationRequirements.map((req) => {
    const att = appVerifByType.get(req.verification_type) ?? null;
    return {
      verificationType: req.verification_type,
      label:
        VERIFICATION_TYPE_LABELS[
          req.verification_type as VerificationTypeValue
        ] ??
        getVerificationType(req.verification_type)?.label ??
        req.verification_type,
      required: req.required,
      attested: att?.attested ?? false,
      attestedAt: att?.attested_at ?? null,
      linkedCredentials: resolveLinkedCredentials(
        att?.application_verification_credentials
      ),
      note: att?.note ?? null,
    };
  });

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
  let offerSectionState: string | null = null;
  let offerSectionLocationId: string | null = null;
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
          "id, template_id, recipient_email, subject, body_html, merge_values, sent_at, sent_by_user_id, approval_status, approval_note, base_amount, base_period, revised_from_offer_send_id, dso_offer_letter_templates:dso_offer_letter_templates(id, name)"
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
      approval_status: string | null;
      approval_note: string | null;
      base_amount: number | null;
      base_period: string | null;
      revised_from_offer_send_id: string | null;
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
        approval_status:
          (r.approval_status as OfferSendRow["approval_status"]) ?? "not_required",
        approval_note: r.approval_note ?? null,
        base_amount: r.base_amount ?? null,
        base_period: (r.base_period as "hourly" | "annual" | null) ?? null,
        revised_from_offer_send_id: r.revised_from_offer_send_id ?? null,
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
      .select("dso_locations:dso_locations(id, city, state)")
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
        offerSectionState = state || null;
        offerSectionLocationId = (loc.id as string | null) ?? null;
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

  // #128 Phase D — job-side range for the offer guardrail (percentage
  // models → est. annual range; see lib/offers/comp-guardrail.ts).
  const offerGuardrailRange = jobRangeForGuardrail({
    compModel: (job.comp_model as string | null) ?? null,
    compensationMin: (job.compensation_min as number | null) ?? null,
    compensationMax: (job.compensation_max as number | null) ?? null,
    compensationPeriod:
      (job.compensation_period as "hourly" | "daily" | "annual" | null) ??
      null,
    estAnnualMin: (job.est_annual_min as number | null) ?? null,
    estAnnualMax: (job.est_annual_max as number | null) ?? null,
  });

  // N12 Phase 2 — offer-approval context for the OfferSection.
  // #83 Phase 2 — both flags now come from the capability model (role preset
  // + per-teammate overrides); the legacy can_send_offers_directly column is
  // dead.
  const offerViewerRole = (dsoUser.role as string) ?? "";
  const offerViewerCanApprove = viewerPerms["offers.approve"];
  const offerSenderEmpowered = isEmpoweredSender(
    offerViewerRole,
    viewerPerms["offers.send_direct"]
  );
  const offerApprovalPolicy = parseOfferApprovalPolicy(
    (dsoForAffiliation as Record<string, unknown> | null)?.offer_approval_policy
  );
  const offerApprovalsEnabled = showOfferSection
    ? await dsoCanUseOfferApprovals(supabase, dsoUser.dso_id as string)
    : false;

  // ── N16 v2 — manual drip-sequence control data.
  const sequencesEnabled = await dsoCanUseSequences(
    supabase,
    dsoUser.dso_id as string
  );
  let activeEnrollment: ActiveEnrollmentView | null = null;
  let enrollableSequences: { id: string; name: string; stepCount: number }[] = [];
  {
    const { data: enrRow } = await supabase
      .from("automation_sequence_enrollments")
      .select("id, sequence_id, current_step, next_send_at")
      .eq("application_id", app.id)
      .eq("status", "active")
      .maybeSingle();
    if (enrRow) {
      const sid = (enrRow as Record<string, unknown>).sequence_id as string;
      const [{ data: seqInfo }, { count: totalSteps }] = await Promise.all([
        supabase.from("automation_sequences").select("name").eq("id", sid).maybeSingle(),
        supabase
          .from("automation_sequence_steps")
          .select("id", { count: "exact", head: true })
          .eq("sequence_id", sid),
      ]);
      activeEnrollment = {
        id: (enrRow as Record<string, unknown>).id as string,
        sequenceName:
          ((seqInfo as Record<string, unknown> | null)?.name as string | null) ??
          "Sequence",
        currentStep:
          ((enrRow as Record<string, unknown>).current_step as number | null) ?? 0,
        totalSteps: totalSteps ?? 0,
        nextSendAt:
          ((enrRow as Record<string, unknown>).next_send_at as string | null) ?? null,
      };
    }
    if (sequencesEnabled && !activeEnrollment) {
      const { data: seqRows } = await supabase
        .from("automation_sequences")
        .select("id, name")
        .eq("dso_id", dsoUser.dso_id as string)
        .eq("is_enabled", true)
        .order("created_at", { ascending: true });
      const seqList = (seqRows as Array<Record<string, unknown>> | null) ?? [];
      if (seqList.length > 0) {
        const ids = seqList.map((s) => s.id as string);
        const { data: stepRows } = await supabase
          .from("automation_sequence_steps")
          .select("sequence_id")
          .in("sequence_id", ids);
        const countBySeq = new Map<string, number>();
        for (const st of (stepRows as Array<Record<string, unknown>> | null) ?? []) {
          const sid = st.sequence_id as string;
          countBySeq.set(sid, (countBySeq.get(sid) ?? 0) + 1);
        }
        enrollableSequences = seqList
          .map((s) => ({
            id: s.id as string,
            name: s.name as string,
            stepCount: countBySeq.get(s.id as string) ?? 0,
          }))
          .filter((s) => s.stepCount > 0);
      }
    }
  }

  // ── Review Mode cursor (Lane 3 commit 3) ─────────────────────────
  // Sibling applications in this job's pipeline, same ordering the
  // pipeline surfaces use (newest first). RLS scopes the read; one
  // cheap indexed query. >500 apps on one job: cursor covers the
  // newest 500 and hides itself if the current app falls outside.
  let reviewPrevId: string | null = null;
  let reviewNextId: string | null = null;
  let reviewPosition = 0;
  let reviewTotal = 0;
  {
    const { data: siblingRows } = await supabase
      .from("applications")
      .select("id")
      .eq("job_id", job.id as string)
      .order("created_at", { ascending: false })
      .limit(500);
    const siblingIds = ((siblingRows ?? []) as Array<{ id: string }>).map(
      (r) => r.id
    );
    const idx = siblingIds.indexOf(app.id as string);
    if (idx !== -1) {
      reviewTotal = siblingIds.length;
      reviewPosition = idx + 1;
      reviewPrevId = idx > 0 ? siblingIds[idx - 1] : null;
      reviewNextId =
        idx < siblingIds.length - 1 ? siblingIds[idx + 1] : null;
    }
  }

  const titleLine = cand?.current_title ?? cand?.headline ?? null;

  // Location label for the candidate (preferred over their full address)
  const candidateLocation =
    [cand?.current_location_city, cand?.current_location_state]
      .filter(Boolean)
      .join(", ") || null;

  // Lane 3 commit 2 (Model 03): the 13-section scroll + right-rail TOC
  // is replaced by the evidence tabs (WorkspaceTabs) + pipeline rail.
  // Section ids survive as anchors inside their tabs — WorkspaceTabs
  // maps incoming hashes (#message-*, #credential-*, section ids) to
  // the owning tab, so existing deep links keep working.

  return (
    <EmployerShell active="applications">
      {/* Lane 8: tell the support assistant what we're viewing (id verified
          server-side under RLS; label is the already-masked display name). */}
      <AssistantContextRegistrar
        kind="application"
        id={String(app.id)}
        label={displayName}
        secondary={`${String(job.title)} · ${currentStageLabel}`}
      />
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
        {/* Review Mode cursor — j/k through this job's pipeline. */}
        <ReviewNav
          prevHref={
            reviewPrevId ? `/employer/applications/${reviewPrevId}` : null
          }
          nextHref={
            reviewNextId ? `/employer/applications/${reviewNextId}` : null
          }
          position={reviewPosition}
          total={reviewTotal}
        />
      </div>

      {/* Hero — avatar + name + meta + status pill + contact strip
          (extracted to CandidateHero, Lane 3 commit 1) */}
      <CandidateHero
        displayName={displayName}
        avatarName={cand?.full_name ?? displayName}
        avatarUrl={cand?.avatar_url ?? null}
        titleLine={titleLine}
        candidateLocation={candidateLocation}
        headerMetaParts={headerMetaParts}
        currentKind={currentKind}
        currentStageLabel={currentStageLabel}
        candidateEmail={candidateEmail}
        candidatePhone={cand?.phone ?? null}
        candidateLinkedinUrl={cand?.linkedin_url ?? null}
        jobId={job.id as string}
        jobTitle={String(job.title)}
        roleLabel={
          ROLE_LABELS[String(job.role_category)] ?? String(job.role_category)
        }
        employmentTypeLabel={String(job.employment_type).replace(/_/g, " ")}
        submitted={submitted}
      />

      {/* DSO Affiliation card — only renders when the job has at least
          one private-affiliation location. Self-suppresses for
          publicly-affiliated jobs. Sits above the workspace so the
          recruiter sees the affiliation context first. */}
      <div className="mb-8">
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
      </div>

      {/* Lane 3 commit 2 (Model 03) — evidence tabs + pipeline rail.
          Rail renders FIRST in the DOM (mobile: controls above the
          evidence), grid order flips it to the right on lg. No overflow
          wrappers anywhere in this chain — both stickies (tab bar, rail)
          ride the document scroll. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">
        {/* Mobile: evidence first, controls after (order-2); lg: rail
            right. Fuller mobile pass tracked in TASKS (Lane 3). */}
        <aside className="order-2 lg:order-2 lg:sticky lg:top-6 space-y-5 min-w-0">
          <RailCard id="stage" label="Pipeline stage">
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

            <div className="mt-4">
              <AssigneePicker
                applicationId={app.id}
                teammates={assigneeTeammates}
                current={app.assigned_to_dso_user_id}
              />
            </div>

            <div className="mt-4">
              <SequenceEnrollControl
                applicationId={app.id}
                canUse={sequencesEnabled}
                enrollment={activeEnrollment}
                sequences={enrollableSequences}
              />
            </div>

            {canSendCustomEmail && (
              <div className="mt-4">
                <SendCustomEmailButton
                  applicationId={app.id}
                  candidateDisplayName={displayName}
                  templates={customTemplateOptions}
                />
              </div>
            )}
          </RailCard>

          <RailCard label="Interviews">
            <EmployerInterviewSection
              applicationId={app.id}
              candidateName={displayName}
              proposals={interviewProposals}
            />
          </RailCard>

          {/* Quick actions — candidate tags (E3.22) + move/copy (E3.21). */}
          <div id="tags" className="scroll-mt-6">
            <TagsSection applicationId={app.id} initialTags={initialTags} />
          </div>
          <MoveCopyCard applicationId={app.id} />
        </aside>

        <div className="order-1 lg:order-1 min-w-0">
          <WorkspaceTabs
            unreadMessages={candidateUnreadCount}
            profile={
              <div className="space-y-12">
          {/* 02 · PracticeFit (Phase 5D v0 — structured-feature scoring) */}
          <DetailSection
            id="fit"
            title={
              <PracticeFitWordmark
                surface="light"
                tm
                className="text-xl sm:text-2xl"
              />
            }
            icon={Sparkles}
            subtitle="Our proprietary dental match score — role, real commute distance, PMS fluency, state licensure, comp, specialty, skills, and schedule."
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
              </div>
            }
            screening={
              <div className="space-y-12">
          {/* E2.10 — soft-knockout callout. Renders ONLY when the
              candidate failed at least one knockout question. Lists the
              specific prompts so the recruiter can decide if the gap is
              fixable (license about to clear) vs disqualifying. Per
              spec: employer-only surface; the candidate never sees this
              on their own application detail page. */}
          {((app as Record<string, unknown>)
            .knockout_failed_questions as string[] | null)?.length ? (
            <div
              className="mb-8 border border-amber-300 bg-amber-50/70 px-5 py-4 rounded"
              role="region"
              aria-label="Knockout questions failed"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 mt-0.5 text-amber-700"
                  aria-hidden
                >
                  ⚠
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold tracking-[1.5px] uppercase text-amber-900 mb-1.5">
                    Knockout flagged · review the candidate&apos;s answers
                  </div>
                  <p className="text-[13px] text-amber-900/90 leading-relaxed mb-3">
                    This candidate didn&apos;t meet the criteria you marked
                    as knockout questions. They&apos;re not auto-rejected —
                    review the answers below and decide whether the gap is
                    fixable (e.g., license-pending) or disqualifying.
                  </p>
                  <ul className="space-y-1.5">
                    {(
                      ((app as Record<string, unknown>)
                        .knockout_failed_questions as string[]) ?? []
                    ).map((prompt, idx) => (
                      <li
                        key={idx}
                        className="text-[13px] text-amber-900 flex items-start gap-2"
                      >
                        <span className="text-amber-700 mt-0.5">·</span>
                        <span className="font-medium">{prompt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          {/* 05 · Screening responses */}
          <DetailSection
            id="screening"
            title="Screening responses"
            icon={ClipboardList}
            subtitle={
              visibleQuestions.length > 0
                ? `Answers to the ${visibleQuestions.length} screening question${visibleQuestions.length === 1 ? "" : "s"} on this job.`
                : undefined
            }
          >
            {visibleQuestions.length === 0 ? (
              <p className="text-[14px] text-slate-meta italic">
                No screening questions on this job.
              </p>
            ) : (
              <div className="border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
                {visibleQuestions.map((q) => (
                  <ScreeningResponseRow
                    key={q.id}
                    question={q}
                    answer={answersByQuestionId.get(q.id) ?? null}
                  />
                ))}
              </div>
            )}
          </DetailSection>

          {/* 05b · Verifications — only renders when the job carries
                verification requirements (mirrors the screening block's
                empty-hide). 5G.e Tier 2: attestation-only. */}
          {verificationRows.length > 0 && (
            <DetailSection
              id="verifications"
              title="Verifications"
              icon={ShieldCheck}
              subtitle={`What this job requires and what ${displayName} self-attested at apply time.`}
            >
              <div className="border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
                {verificationRows.map((v) => (
                  <VerificationRow key={v.verificationType} row={v} />
                ))}
              </div>
            </DetailSection>
          )}

              </div>
            }
            messages={
              <div className="space-y-12">
          {/* 06 · Messages with candidate */}
          <DetailSection
            id="messages"
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
            {/* Bounded height so the thread's internal overflow-y-auto engages
                — a concise scroll window instead of growing to the full thread. */}
            <div className="h-[560px]">
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
            </div>
          </DetailSection>

              </div>
            }
            offer={
              showOfferSection ? (
            <DetailSection
              id="offer"
              title="Offer"
              icon={FileSignature}
              subtitle={`Send a templated offer letter to ${displayName} via email. Past sends are snapshotted as the legal record.`}
              tone="candidate"
            >
              {compMasked ? (
                // #83 Phase 2 — comp.view gate: offer letters + amounts are
                // compensation data. Masked server-side for viewers without
                // the capability.
                <p className="text-[14px] text-slate-meta italic">
                  Offer and compensation details are hidden for your account.
                  An owner or admin can grant &ldquo;View compensation /
                  salary fields&rdquo; from the Team page.
                </p>
              ) : (
              <OfferSection
                applicationId={app.id}
                candidateName={displayName}
                candidateEmail={candidateEmail}
                dsoName={offerSectionDsoName}
                jobTitle={String(job.title)}
                jobLocation={offerSectionJobLocation}
                jobEmploymentType={offerSectionJobEmploymentType}
                roleCategory={String(job.role_category)}
                benchmarkState={offerSectionState}
                benchmarkLocationId={offerSectionLocationId}
                // #128 Phase D — percentage comp models guardrail against
                // the posted est. annual range (single mapper, same rule as
                // the engine). Legacy/simple jobs pass through unchanged.
                jobCompMin={offerGuardrailRange.jobMin}
                jobCompMax={offerGuardrailRange.jobMax}
                jobCompPeriod={offerGuardrailRange.jobPeriod}
                jobBenefits={
                  // jobs.benefits is a text[] — join to a string for the
                  // offer benefits field (never cast the array `as string`,
                  // or .trim() throws at runtime).
                  Array.isArray(job.benefits)
                    ? (job.benefits as string[]).filter(Boolean).join(", ") ||
                      null
                    : ((job.benefits as string | null) ?? null)
                }
                templates={offerTemplates}
                sends={offerSends}
                viewerCanApprove={offerViewerCanApprove}
                approvalsEnabled={offerApprovalsEnabled}
                senderEmpowered={offerSenderEmpowered}
                approvalPolicy={offerApprovalPolicy}
              />
              )}
            </DetailSection>
              ) : null
            }
            internal={
              <div>
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
            </div>
          </div>
          {/* ───── End internal workspace ───── */}
              </div>
            }
            timeline={
              <div className="space-y-12">
          {/* Activity timeline */}
          <DetailSection
            id="activity"
            title="Activity timeline"
            icon={History}
            subtitle="Every stage transition captured for this application."
          >
            <ActivityTimeline events={events} />
          </DetailSection>
              </div>
            }
          />
        </div>
      </div>
    </EmployerShell>
  );
}
