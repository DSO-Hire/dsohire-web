"use server";

/**
 * Talent-pool outreach send (E7.10 / Phase 5D Day 2, shipped 2026-05-11).
 *
 * Sends an outbound message from a DSO recruiter to a candidate in
 * the talent pool. The candidate's email never appears in the
 * sender's view — the platform looks it up via service role and uses
 * Resend's reply-to to route candidate replies back to the recruiter.
 *
 * Sender flow:
 *   1. Recruiter opens the modal on /employer/candidates/[id]
 *   2. Types subject + body
 *   3. submit → this action
 *   4. Persist row in dso_outreach_messages
 *   5. Fire sendEmail() via Resend (transactional path, no
 *      user-preference suppression — sourcing is transactional from
 *      the platform's perspective)
 *   6. Audit log "talent_pool.outreach_sent"
 *
 * Errors surface to the modal; on success the modal closes and the
 * history card re-renders via revalidatePath.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { recordAuditEvent } from "@/lib/audit/record";
import { OutreachMessage } from "@/emails/employer/OutreachMessage";

export interface SendOutreachResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export async function sendOutreachToCandidate(formData: FormData): Promise<SendOutreachResult> {
  const candidateId = String(formData.get("candidate_id") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim();

  if (!candidateId) return { ok: false, error: "Missing candidate." };
  if (!subject) return { ok: false, error: "Subject is required." };
  if (!body) return { ok: false, error: "Message body is required." };
  if (body.length > 8000) {
    return { ok: false, error: "Message is too long (max 8000 characters)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };
  if (!["owner", "admin", "recruiter"].includes((dsoUser.role as string) ?? "")) {
    return { ok: false, error: "Insufficient permissions." };
  }

  // Verify candidate is discoverable.
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, cv_visibility, is_guest, deleted_at, auth_user_id")
    .eq("id", candidateId)
    .maybeSingle();
  if (!candidate) {
    return { ok: false, error: "Candidate not found." };
  }
  if (
    (candidate.cv_visibility as string) === "hidden" ||
    candidate.is_guest ||
    candidate.deleted_at
  ) {
    return {
      ok: false,
      error:
        "This candidate isn't reachable through the platform right now.",
    };
  }

  // Look up the candidate's email via auth.users (service role).
  const admin = createSupabaseServiceRoleClient();
  const authUserId = candidate.auth_user_id as string | null;
  if (!authUserId) {
    return {
      ok: false,
      error: "Candidate has no contact channel yet.",
    };
  }
  const { data: authUser } = await admin.auth.admin.getUserById(authUserId);
  const candidateEmail = authUser?.user?.email ?? null;
  if (!candidateEmail) {
    return { ok: false, error: "Candidate email not on file." };
  }

  // Look up the sender's email for reply-to.
  const { data: senderAuth } = await admin.auth.admin.getUserById(user.id);
  const replyToEmail = senderAuth?.user?.email ?? "info@dsohire.com";

  // Look up the DSO name for the email header.
  const { data: dso } = await admin
    .from("dsos")
    .select("name")
    .eq("id", dsoUser.dso_id as string)
    .maybeSingle();
  const dsoName = (dso?.name as string | undefined) ?? "A DSO";

  // Persist the row first; if Resend fails we'll have a record + can
  // retry. (vs send-first which would lose the message body on a row-
  // insert failure.)
  const { data: row, error: insertErr } = await admin
    .from("dso_outreach_messages")
    .insert({
      dso_id: dsoUser.dso_id as string,
      candidate_id: candidateId,
      sent_by: dsoUser.id as string,
      subject,
      body,
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    console.warn("[outreach] log insert failed", insertErr);
    return { ok: false, error: "Couldn't save the message." };
  }

  // Send via Resend.
  const result = await sendEmail({
    to: candidateEmail,
    subject: `${dsoName} · ${subject}`,
    template: "employer.outreach_message",
    replyTo: replyToEmail,
    relatedDsoId: dsoUser.dso_id as string,
    relatedCandidateId: candidateId,
    react: OutreachMessage({
      candidateFirstName: (candidate.full_name as string | null)?.split(/\s+/)[0] ?? null,
      dsoName,
      senderName: (dsoUser.full_name as string | null) ?? null,
      subject,
      body,
      siteUrl: SITE_URL,
    }),
  });

  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error ??
        "Email service rejected the send. The message is saved; you can retry.",
    };
  }

  // Stash the resend message id back on the row for delivery tracking.
  if (result.messageId) {
    await admin
      .from("dso_outreach_messages")
      .update({ resend_message_id: result.messageId })
      .eq("id", row.id as string);
  }

  await recordAuditEvent({
    dsoId: dsoUser.dso_id as string,
    actorUserId: user.id,
    actorDsoUserId: dsoUser.id as string,
    actorName: (dsoUser.full_name as string | null) ?? null,
    actorRole: (dsoUser.role as string | null) ?? null,
    eventKind: "talent_pool.outreach_sent",
    targetTable: "candidates",
    targetId: candidateId,
    summary: `Sent outreach to ${
      (candidate.full_name as string | null) ?? "a candidate"
    }: "${subject.slice(0, 60)}${subject.length > 60 ? "…" : ""}"`,
    metadata: {
      candidate_id: candidateId,
      message_id: row.id,
      subject,
    },
  });

  revalidatePath(`/employer/candidates/${candidateId}`);
  return { ok: true, messageId: row.id as string };
}
