"use server";

/**
 * Server actions for the application messages thread.
 *
 * Surface used by both the employer detail page (/employer/applications/[id])
 * and the candidate detail page (/candidate/applications/[id]). The actions
 * derive sender_role + sender_dso_user_id server-side from auth context so
 * neither caller can spoof the other side.
 *
 * Mirrors the comments-actions RLS-aware empty-row pattern: PostgREST returns
 * zero rows when RLS denies a write but no error message, so we treat the
 * empty result as a permission failure.
 *
 * Notification emails are dispatched fire-and-forget after each successful
 * insert. Failures NEVER roll back the message — the row exists, the
 * recipient just doesn't get notified. Idempotency: only fires on the
 * initial INSERT, never on edits.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { dispatchCandidateEmail } from "@/lib/email/templates/dispatch";
import { MessageReceived } from "@/emails/MessageReceived";

export interface ApplicationMessageRow {
  id: string;
  application_id: string;
  /** NULL for system-authored messages (Phase 4.8 stage_changed / received / etc). */
  sender_user_id: string | null;
  sender_role: "candidate" | "employer";
  sender_dso_user_id: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** Non-NULL marks a system message; renderer uses a banner instead of a bubble. */
  event_kind?: string | null;
}

export type SendMessageResult =
  | { ok: true; message: ApplicationMessageRow }
  | { ok: false; error: string };

export type EditMessageResult =
  | { ok: true; message: ApplicationMessageRow }
  | { ok: false; error: string };

export type DeleteMessageResult = { ok: true } | { ok: false; error: string };

export type MarkReadResult = { ok: true } | { ok: false; error: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.dsohire.com";

const MAX_BODY = 5000;

function sanitizeBody(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

/* ───────────────────────────────────────────────────────────────
 * Send
 * ───────────────────────────────────────────────────────────── */

export async function sendApplicationMessage({
  applicationId,
  body,
}: {
  applicationId: string;
  body: string;
}): Promise<SendMessageResult> {
  const cleanBody = sanitizeBody(body);
  if (!applicationId) return { ok: false, error: "Missing application id." };
  if (cleanBody.length < 1) return { ok: false, error: "Message cannot be empty." };
  if (cleanBody.length > MAX_BODY) {
    return { ok: false, error: `Message is too long (${MAX_BODY} character max).` };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Resolve which side the sender is on. Candidate path takes precedence —
  // a single auth user shouldn't be both sides of an application, but if
  // they ever were we'd treat them as the candidate.
  const { data: candidateRow } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let senderRole: "candidate" | "employer" | null = null;
  let senderDsoUserId: string | null = null;

  if (candidateRow) {
    // Confirm this candidate owns the application.
    const { data: appOwn } = await supabase
      .from("applications")
      .select("id, candidate_id")
      .eq("id", applicationId)
      .eq("candidate_id", candidateRow.id as string)
      .maybeSingle();
    if (appOwn) senderRole = "candidate";
  }

  if (!senderRole) {
    // Try the employer side.
    const { data: dsoUser } = await supabase
      .from("dso_users")
      .select("id, dso_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (dsoUser) {
      const { data: appJob } = await supabase
        .from("applications")
        .select("id, jobs!inner(dso_id)")
        .eq("id", applicationId)
        .eq("jobs.dso_id", dsoUser.dso_id as string)
        .maybeSingle();
      if (appJob) {
        senderRole = "employer";
        senderDsoUserId = dsoUser.id as string;
      }
    }
  }

  if (!senderRole) {
    return {
      ok: false,
      error: "You don't have access to message on this application.",
    };
  }

  const { data, error } = await supabase
    .from("application_messages")
    .insert({
      application_id: applicationId,
      sender_user_id: user.id,
      sender_role: senderRole,
      sender_dso_user_id: senderDsoUserId,
      body: cleanBody,
    })
    .select(
      "id, application_id, sender_user_id, sender_role, sender_dso_user_id, body, read_at, created_at, updated_at, edited_at, deleted_at, event_kind"
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      error:
        error?.message ??
        "You don't have access to message on this application.",
    };
  }

  // Fire-and-forget recipient notification.
  void dispatchMessageNotification({
    applicationId: data.application_id as string,
    messageId: data.id as string,
    senderRole,
    senderUserId: user.id,
    senderDsoUserId,
    body: cleanBody,
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  revalidatePath(`/candidate/applications/${applicationId}`);

  return {
    ok: true,
    message: rowToMessage(data),
  };
}

/* ───────────────────────────────────────────────────────────────
 * Edit (sender only, within 5 minutes — RLS-enforced)
 * ───────────────────────────────────────────────────────────── */

export async function editApplicationMessage({
  messageId,
  body,
}: {
  messageId: string;
  body: string;
}): Promise<EditMessageResult> {
  const cleanBody = sanitizeBody(body);
  if (!messageId) return { ok: false, error: "Missing message id." };
  if (cleanBody.length < 1) return { ok: false, error: "Message cannot be empty." };
  if (cleanBody.length > MAX_BODY) {
    return { ok: false, error: `Message is too long (${MAX_BODY} character max).` };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const { data, error } = await supabase
    .from("application_messages")
    .update({ body: cleanBody })
    .eq("id", messageId)
    .select(
      "id, application_id, sender_user_id, sender_role, sender_dso_user_id, body, read_at, created_at, updated_at, edited_at, deleted_at, event_kind"
    )
    .single();

  if (error || !data) {
    return {
      ok: false,
      error:
        error?.message ??
        "You can only edit your own messages within 5 minutes.",
    };
  }

  revalidatePath(`/employer/applications/${data.application_id}`);
  revalidatePath(`/candidate/applications/${data.application_id}`);

  return { ok: true, message: rowToMessage(data) };
}

/* ───────────────────────────────────────────────────────────────
 * Delete (soft, sender only, within 5 minutes — RLS-enforced)
 * ───────────────────────────────────────────────────────────── */

export async function deleteApplicationMessage(
  messageId: string
): Promise<DeleteMessageResult> {
  if (!messageId) return { ok: false, error: "Missing message id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const { data, error } = await supabase
    .from("application_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("application_id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error:
        error?.message ??
        "You can only delete your own messages within 5 minutes.",
    };
  }

  revalidatePath(`/employer/applications/${data.application_id}`);
  revalidatePath(`/candidate/applications/${data.application_id}`);

  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Mark a message as read
 *
 * Routes through the service-role client so the caller can flip read_at
 * even though they're not the sender (RLS only allows sender updates).
 * Authorization is enforced manually here:
 *   - The caller must be a participant on the application
 *   - The caller must NOT be the sender (you don't read-receipt yourself)
 *   - Only read_at is updated; nothing else is touched
 * ───────────────────────────────────────────────────────────── */

export async function markApplicationMessageRead(
  messageId: string
): Promise<MarkReadResult> {
  if (!messageId) return { ok: false, error: "Missing message id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Use the user-scoped client to read the row first so RLS gates participant
  // access. If the user can't read the row, they can't mark it read.
  const { data: msg } = await supabase
    .from("application_messages")
    .select("id, application_id, sender_user_id, read_at, deleted_at")
    .eq("id", messageId)
    .maybeSingle();

  if (!msg) {
    return { ok: false, error: "Message not found." };
  }
  if (msg.deleted_at) {
    // Deleted messages don't get read-receipts.
    return { ok: true };
  }
  if ((msg.sender_user_id as string) === user.id) {
    // Sender doesn't read-receipt themselves.
    return { ok: true };
  }
  if (msg.read_at) {
    // Already marked.
    return { ok: true };
  }

  // Bypass RLS for the targeted read_at flip only.
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("application_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .is("read_at", null);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Internal helpers
 * ───────────────────────────────────────────────────────────── */

interface InsertedRow {
  id: string | null;
  application_id: string | null;
  sender_user_id: string | null;
  sender_role: string | null;
  sender_dso_user_id: string | null;
  body: string | null;
  read_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  deleted_at: string | null;
}

function rowToMessage(row: InsertedRow): ApplicationMessageRow {
  const role = row.sender_role === "candidate" ? "candidate" : "employer";
  return {
    id: String(row.id),
    application_id: String(row.application_id),
    sender_user_id: String(row.sender_user_id),
    sender_role: role,
    sender_dso_user_id: row.sender_dso_user_id ?? null,
    body: String(row.body ?? ""),
    read_at: row.read_at ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at ?? null,
  };
}

interface DispatchArgs {
  applicationId: string;
  messageId: string;
  senderRole: "candidate" | "employer";
  senderUserId: string;
  senderDsoUserId: string | null;
  body: string;
}

async function dispatchMessageNotification(
  args: DispatchArgs
): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();

    // Resolve application + job + dso + candidate context.
    const { data: appRow } = await admin
      .from("applications")
      .select("id, candidate_id, job_id")
      .eq("id", args.applicationId)
      .maybeSingle();
    if (!appRow) return;

    const { data: job } = await admin
      .from("jobs")
      .select("id, title, dso_id")
      .eq("id", appRow.job_id as string)
      .maybeSingle();
    if (!job) return;

    const { data: dso } = await admin
      .from("dsos")
      .select("id, name")
      .eq("id", job.dso_id as string)
      .maybeSingle();

    const { data: cand } = await admin
      .from("candidates")
      .select("id, auth_user_id, full_name")
      .eq("id", appRow.candidate_id as string)
      .maybeSingle();

    const jobTitle = (job.title as string | null) ?? "your role";
    const dsoName = (dso?.name as string | null) ?? "the hiring team";
    const candidateFullName =
      ((cand?.full_name as string | null) ?? "").trim() || "the candidate";

    // Resolve sender display name.
    let senderName = "Someone";
    if (args.senderRole === "candidate") {
      senderName = candidateFullName;
    } else if (args.senderDsoUserId) {
      const { data: dsoUser } = await admin
        .from("dso_users")
        .select("full_name")
        .eq("id", args.senderDsoUserId)
        .maybeSingle();
      const full = ((dsoUser?.full_name as string | null) ?? "").trim();
      if (full) senderName = full;
    }

    // Resolve recipient identity + email + first-name + deep link.
    let recipientAuthUserId: string | null = null;
    let recipientEmail: string | null = null;
    let recipientName = "there";
    let deepLink = `${SITE_URL}/jobs/${appRow.job_id}`;
    const relatedDsoId: string | null = job.dso_id as string;
    const relatedCandidateId: string | null = appRow.candidate_id as string;

    if (args.senderRole === "candidate") {
      // Notify the DSO. Pick any one DSO admin/owner; fall back to first
      // recruiter if no admin/owner exists.
      const { data: adminCandidates } = await admin
        .from("dso_users")
        .select("auth_user_id, full_name, role")
        .eq("dso_id", job.dso_id as string);
      const candidates =
        ((adminCandidates ?? []) as Array<{
          auth_user_id: string;
          full_name: string | null;
          role: string;
        }>) ?? [];
      const ranked = [...candidates].sort((a, b) => {
        const order: Record<string, number> = {
          owner: 0,
          admin: 1,
          recruiter: 2,
        };
        return (order[a.role] ?? 9) - (order[b.role] ?? 9);
      });
      const recipient = ranked[0] ?? null;
      if (recipient) {
        recipientAuthUserId = recipient.auth_user_id;
        const { data: authUser } = await admin.auth.admin.getUserById(
          recipient.auth_user_id
        );
        recipientEmail = authUser?.user?.email ?? null;
        recipientName =
          (recipient.full_name ?? "").split(" ")[0].trim() || "there";
      }
      deepLink = `${SITE_URL}/employer/applications/${appRow.id}#message-${args.messageId}`;
    } else {
      // Notify the candidate.
      if (cand?.auth_user_id) {
        recipientAuthUserId = cand.auth_user_id as string;
        const { data: authUser } = await admin.auth.admin.getUserById(
          cand.auth_user_id as string
        );
        recipientEmail = authUser?.user?.email ?? null;
        recipientName =
          (candidateFullName ?? "").split(" ")[0].trim() || "there";
      }
      deepLink = `${SITE_URL}/candidate/applications/${appRow.id}#message-${args.messageId}`;
    }

    if (!recipientEmail || !recipientAuthUserId) return;

    const subject = `${senderName} sent you a message about ${jobTitle}`;
    const fallbackReact = MessageReceived({
      recipientName,
      senderName,
      senderRole: args.senderRole,
      jobTitle,
      dsoName,
      candidateName: candidateFullName,
      messageBody: args.body,
      deepLink,
      fullMessageLink: deepLink,
    });

    if (args.senderRole === "employer") {
      // Recipient is the candidate → eligible for the DSO's custom template
      // (Phase 4.5.f). dispatchCandidateEmail short-circuits to the fallback
      // when the DSO isn't on Growth+ or hasn't customized this template.
      void dispatchCandidateEmail({
        kind: "application.message_received",
        dsoId: job.dso_id as string,
        recipientUserId: recipientAuthUserId,
        recipientEmail,
        candidate: {
          first_name: recipientName,
          full_name: candidateFullName ?? recipientName,
          email: recipientEmail,
        },
        job: {
          title: jobTitle,
          url: `${SITE_URL}/jobs/${appRow.job_id}`,
        },
        extraContext: {
          message: {
            preview: args.body.slice(0, 200),
            thread_url: deepLink,
          },
        },
        relatedDsoId,
        relatedCandidateId,
        fallback: { subject, react: fallbackReact },
      });
    } else {
      // Recipient is a DSO admin/owner — employer-internal notification, no
      // custom-template path. Goes through dispatchNotification directly.
      void dispatchNotification({
        userId: recipientAuthUserId,
        eventKind: "application.message_received",
        relatedDsoId,
        relatedCandidateId,
        email: {
          to: recipientEmail,
          subject,
          react: fallbackReact,
        },
      });
    }
  } catch (err) {
    // Never throw out of fire-and-forget.
    console.warn("[messages] notification dispatch failed", err);
  }
}
