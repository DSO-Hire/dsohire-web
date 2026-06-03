"use server";

/**
 * N12 Phase 2 — offer approval decisions.
 *
 * An owner/admin approves or rejects a PENDING offer that a teammate
 * submitted. Approve dispatches the exact letter that was held (the
 * rendered body + token already live on the row) and flips the row to
 * 'approved'; reject records the note and flips to 'rejected' without
 * sending anything. Both notify the original sender.
 *
 * Only owner/admin may decide. The approval mechanism is Scale+; this is
 * re-checked defensively (a pending row can only exist on a tier where the
 * gate was active, but tiers can change).
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import { dispatchInboxRichCard } from "@/lib/inbox/dispatch-rich-card";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { sendEmail } from "@/lib/email/send";
import { resolveCandidateReplyTo } from "@/lib/email/candidate-reply-to";
import { OfferLetter as OfferLetterEmail } from "@/emails/employer/OfferLetter";
import { OfferApprovalDecision } from "@/emails/employer/OfferApprovalDecision";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import {
  offerResponseUrl,
  offerQuickAcceptUrl,
  offerQuickDeclineUrl,
} from "@/lib/offers/tokens";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export type ApprovalResult = { ok: true } | { ok: false; error: string };

/** Shared: load the pending send + verify the caller is an owner/admin of
 *  the send's DSO. Returns the resolved context both decisions need. */
async function loadPendingForDecider(sendId: string): Promise<
  | {
      ok: true;
      ctx: {
        callerAuthId: string;
        callerDsoUserId: string;
        callerName: string | null;
        callerRole: string;
        dsoId: string;
        applicationId: string;
        jobId: string;
        jobTitle: string;
        candidateId: string;
        candidateFullName: string;
        recipientEmail: string;
        subject: string;
        bodyHtml: string;
        token: string | null;
        senderAuthId: string | null;
      };
    }
  | { ok: false; error: string }
> {
  if (!sendId) return { ok: false, error: "Missing offer id." };
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const admin = createSupabaseServiceRoleClient();
  const { data: send } = await admin
    .from("application_offer_sends")
    .select(
      "id, application_id, recipient_email, subject, body_html, token, sent_by_user_id, approval_status"
    )
    .eq("id", sendId)
    .maybeSingle();
  if (!send) return { ok: false, error: "Offer not found." };
  if ((send.approval_status as string) !== "pending") {
    return { ok: false, error: "This offer has already been resolved." };
  }
  const applicationId = send.application_id as string;

  // Application → job (dso + title) + candidate.
  const { data: appRow } = await admin
    .from("applications")
    .select(
      "id, candidate_id, job_id, jobs:jobs(id, dso_id, title)"
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (!appRow) return { ok: false, error: "Application not found." };
  const jobsRel = (appRow as Record<string, unknown>).jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const jobRow = Array.isArray(jobsRel) ? jobsRel[0] ?? null : jobsRel;
  const dsoId = (jobRow?.dso_id as string | null) ?? null;
  const jobId = (jobRow?.id as string | null) ?? ((appRow as Record<string, unknown>).job_id as string | null);
  const jobTitle = (jobRow?.title as string | null) ?? "the role";
  const candidateId = (appRow as Record<string, unknown>).candidate_id as string;
  if (!dsoId || !jobId) return { ok: false, error: "Offer is missing scope context." };

  // Caller must be owner/admin in this DSO.
  const { data: me } = await supabase
    .from("dso_users")
    .select("id, full_name, role")
    .eq("auth_user_id", user.id)
    .eq("dso_id", dsoId)
    .maybeSingle();
  if (!me) return { ok: false, error: "You don't have access to this DSO." };
  const callerRole = (me as Record<string, unknown>).role as string;
  if (callerRole !== "owner" && callerRole !== "admin") {
    return { ok: false, error: "Only an owner or admin can approve offers." };
  }

  // Candidate full name.
  const { data: cand } = await admin
    .from("candidates")
    .select("full_name")
    .eq("id", candidateId)
    .maybeSingle();
  const candidateFullName =
    ((cand as Record<string, unknown> | null)?.full_name as string | null) ??
    "the candidate";

  return {
    ok: true,
    ctx: {
      callerAuthId: user.id,
      callerDsoUserId: (me as Record<string, unknown>).id as string,
      callerName: ((me as Record<string, unknown>).full_name as string | null) ?? null,
      callerRole,
      dsoId,
      applicationId,
      jobId,
      jobTitle,
      candidateId,
      candidateFullName,
      recipientEmail: send.recipient_email as string,
      subject: send.subject as string,
      bodyHtml: send.body_html as string,
      token: (send.token as string | null) ?? null,
      senderAuthId: (send.sent_by_user_id as string | null) ?? null,
    },
  };
}

/** Approve a pending offer → dispatch the held letter to the candidate. */
export async function approveOffer(
  sendId: string,
  note?: string
): Promise<ApprovalResult> {
  const loaded = await loadPendingForDecider(sendId);
  if (!loaded.ok) return loaded;
  const ctx = loaded.ctx;
  const admin = createSupabaseServiceRoleClient();

  // Candidate-view DSO name (affiliation-masked), parity with sendOffer.
  let dsoName = "Your DSO";
  try {
    const displayed = await getDisplayedDsoName({
      jobId: ctx.jobId,
      viewer: { role: "candidate", applicationId: ctx.applicationId },
    });
    if (displayed.name) dsoName = displayed.name;
  } catch (e) {
    console.warn("[offer-approval] dso name resolve failed", e);
  }

  // Original sender's display name + dso_user id (for the inbox card author)
  // + email (the letter names them as the follow-up contact, so replies must
  // reach them, not the platform).
  let senderName: string | null = null;
  let senderDsoUserId: string | null = null;
  let senderEmail: string | null = null;
  if (ctx.senderAuthId) {
    const { data: senderRow } = await admin
      .from("dso_users")
      .select("id, full_name")
      .eq("auth_user_id", ctx.senderAuthId)
      .eq("dso_id", ctx.dsoId)
      .maybeSingle();
    senderName = ((senderRow as Record<string, unknown> | null)?.full_name as string | null) ?? null;
    senderDsoUserId = ((senderRow as Record<string, unknown> | null)?.id as string | null) ?? null;
    try {
      const { data: authResp } = await admin.auth.admin.getUserById(ctx.senderAuthId);
      senderEmail = authResp?.user?.email ?? null;
    } catch {
      senderEmail = null;
    }
  }
  const replyToAddress =
    (senderEmail ?? undefined) ?? (await resolveCandidateReplyTo(ctx.dsoId));

  const token = ctx.token;
  const responseUrl = token ? offerResponseUrl(token) : `${SITE_URL}/employer/applications/${ctx.applicationId}`;
  const quickAcceptUrl = token ? offerQuickAcceptUrl(token) : responseUrl;
  const quickDeclineUrl = token ? offerQuickDeclineUrl(token) : responseUrl;

  const sendResult = await sendEmail({
    to: ctx.recipientEmail,
    subject: ctx.subject,
    template: "employer.offer_letter",
    replyTo: replyToAddress,
    react: OfferLetterEmail({
      candidateFirstName: firstName(ctx.candidateFullName),
      dsoName,
      jobTitle: ctx.jobTitle,
      senderName,
      bodyHtml: ctx.bodyHtml,
      responseUrl,
      quickAcceptUrl,
      quickDeclineUrl,
    }),
    relatedDsoId: ctx.dsoId,
    relatedCandidateId: ctx.candidateId,
  });
  if (!sendResult.ok) {
    return {
      ok: false,
      error: sendResult.error ?? "Couldn't send the approved offer. Try again.",
    };
  }

  const { error: updErr } = await admin
    .from("application_offer_sends")
    .update({
      approval_status: "approved",
      approved_by_user_id: ctx.callerAuthId,
      approved_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      approval_note: note?.trim() ? note.trim() : null,
    })
    .eq("id", sendId)
    .eq("approval_status", "pending"); // guard against a double-approve race
  if (updErr) {
    console.warn("[offer-approval] approve update failed", updErr);
    // Email already went out; surface a soft error so the approver knows.
    return {
      ok: false,
      error: "Offer sent, but the status didn't save. Refresh before acting again.",
    };
  }

  // Now that it's truly sent, drop the offer_letter card into the thread.
  const preview = ctx.bodyHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 277);
  void dispatchInboxRichCard({
    applicationId: ctx.applicationId,
    senderUserId: ctx.senderAuthId ?? ctx.callerAuthId,
    senderRole: "employer",
    senderDsoUserId: senderDsoUserId ?? ctx.callerDsoUserId,
    fallbackBody: `Offer sent: ${ctx.subject}`,
    payload: {
      kind: "offer_letter",
      offer_send_id: sendId,
      response_token: token ?? "",
      subject: ctx.subject,
      preview: preview.length === 277 ? `${preview}…` : preview,
      sent_at: new Date().toISOString(),
      status: "sent",
    },
  });

  await recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.callerAuthId,
    actorDsoUserId: ctx.callerDsoUserId,
    actorName: ctx.callerName,
    actorRole: ctx.callerRole,
    eventKind: "offer.approved",
    targetTable: "application_offer_sends",
    targetId: sendId,
    summary: `Approved + sent offer to ${ctx.candidateFullName}`,
    metadata: { application_id: ctx.applicationId, note: note?.trim() || null },
  });

  await notifySenderOfDecision({
    decision: "approved",
    senderAuthId: ctx.senderAuthId,
    deciderName: ctx.callerName ?? "An approver",
    candidateName: ctx.candidateFullName,
    jobTitle: ctx.jobTitle,
    note: note?.trim() || null,
    applicationId: ctx.applicationId,
    dsoId: ctx.dsoId,
  });

  revalidatePath(`/employer/applications/${ctx.applicationId}`);
  revalidatePath("/employer/offer-approvals");
  return { ok: true };
}

/** Reject a pending offer → record the note; nothing is sent. */
export async function rejectOffer(
  sendId: string,
  note: string
): Promise<ApprovalResult> {
  const cleanNote = (note ?? "").trim();
  if (!cleanNote) {
    return { ok: false, error: "Add a short note so the sender knows why." };
  }
  if (cleanNote.length > 1000) {
    return { ok: false, error: "Note is too long (max 1000 characters)." };
  }
  const loaded = await loadPendingForDecider(sendId);
  if (!loaded.ok) return loaded;
  const ctx = loaded.ctx;
  const admin = createSupabaseServiceRoleClient();

  const { error: updErr } = await admin
    .from("application_offer_sends")
    .update({
      approval_status: "rejected",
      approved_by_user_id: ctx.callerAuthId,
      approved_at: new Date().toISOString(),
      approval_note: cleanNote,
    })
    .eq("id", sendId)
    .eq("approval_status", "pending");
  if (updErr) {
    console.warn("[offer-approval] reject update failed", updErr);
    return { ok: false, error: "Couldn't record the rejection. Try again." };
  }

  await recordAuditEvent({
    dsoId: ctx.dsoId,
    actorUserId: ctx.callerAuthId,
    actorDsoUserId: ctx.callerDsoUserId,
    actorName: ctx.callerName,
    actorRole: ctx.callerRole,
    eventKind: "offer.rejected",
    targetTable: "application_offer_sends",
    targetId: sendId,
    summary: `Rejected offer to ${ctx.candidateFullName}`,
    metadata: { application_id: ctx.applicationId, note: cleanNote },
  });

  await notifySenderOfDecision({
    decision: "rejected",
    senderAuthId: ctx.senderAuthId,
    deciderName: ctx.callerName ?? "An approver",
    candidateName: ctx.candidateFullName,
    jobTitle: ctx.jobTitle,
    note: cleanNote,
    applicationId: ctx.applicationId,
    dsoId: ctx.dsoId,
  });

  revalidatePath(`/employer/applications/${ctx.applicationId}`);
  revalidatePath("/employer/offer-approvals");
  return { ok: true };
}

async function notifySenderOfDecision(args: {
  decision: "approved" | "rejected";
  senderAuthId: string | null;
  deciderName: string;
  candidateName: string;
  jobTitle: string;
  note: string | null;
  applicationId: string;
  dsoId: string;
}): Promise<void> {
  if (!args.senderAuthId) return;
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data: authResp } = await admin.auth.admin.getUserById(args.senderAuthId);
    const email = authResp?.user?.email;
    if (!email) return;
    const { data: senderRow } = await admin
      .from("dso_users")
      .select("first_name")
      .eq("auth_user_id", args.senderAuthId)
      .eq("dso_id", args.dsoId)
      .maybeSingle();
    const applicationUrl = `${SITE_URL}/employer/applications/${args.applicationId}`;
    await dispatchNotification({
      userId: args.senderAuthId,
      eventKind: "employer.offer_approval_decision",
      relatedDsoId: args.dsoId,
      email: {
        to: email,
        subject:
          args.decision === "approved"
            ? `Your offer to ${args.candidateName} was approved`
            : `Your offer to ${args.candidateName} needs changes`,
        react: OfferApprovalDecision({
          recipientName:
            ((senderRow as Record<string, unknown> | null)?.first_name as string | null) ??
            "there",
          decision: args.decision,
          deciderName: args.deciderName,
          candidateName: args.candidateName,
          jobTitle: args.jobTitle,
          note: args.note,
          applicationUrl,
        }),
      },
    });
  } catch (err) {
    console.warn("[offer-approval] sender notification failed", err);
  }
}

function firstName(full: string | null | undefined): string {
  if (!full) return "there";
  const t = full.trim();
  if (!t) return "there";
  return t.split(/\s+/)[0] ?? t;
}
