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
import { after } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import { can } from "@/lib/permissions/capabilities";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { dispatchCandidateEmail } from "@/lib/email/templates/dispatch";
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import { MessageReceived } from "@/emails/MessageReceived";
import { greetingFirstName } from "@/lib/candidate/name";

export interface ApplicationMessageAttachment {
  id: string;
  message_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

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
  /** Discriminator: 'text' (default), 'system' (event_kind non-null), 'rich_card' (payload non-null). */
  kind?: "text" | "system" | "rich_card";
  /** Structured payload — RichCard data (kind='rich_card') or system event details (kind='system'). */
  payload?: Record<string, unknown> | null;
  /** 0..N attachments uploaded alongside this message. Empty array when none. */
  attachments?: ApplicationMessageAttachment[];
}

export type SendMessageResult =
  | { ok: true; message: ApplicationMessageRow }
  | { ok: false; error: string };

export type EditMessageResult =
  | { ok: true; message: ApplicationMessageRow }
  | { ok: false; error: string };

export type DeleteMessageResult = { ok: true } | { ok: false; error: string };

export type MarkReadResult = { ok: true } | { ok: false; error: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

const MAX_BODY = 5000;

/** Mirrors the CHECK constraint on application_message_attachments.size_bytes. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
/** Per-message cap. Server-side guard; the composer also enforces this. */
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const ATTACHMENT_BUCKET = "application-message-attachments";

/** Accepted MIME prefixes/exact values. Mirror the composer accept= list. */
const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function sanitizeBody(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

function safeFileName(name: string): string {
  // Match the pattern used by ce-actions.ts so we keep one canonical
  // sanitizer across the codebase.
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/* ───────────────────────────────────────────────────────────────
 * Send
 * ───────────────────────────────────────────────────────────── */

export async function sendApplicationMessage({
  applicationId,
  body,
  attachments,
}: {
  applicationId: string;
  body: string;
  attachments?: File[];
}): Promise<SendMessageResult> {
  const cleanBody = sanitizeBody(body);
  const files = (attachments ?? []).filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (!applicationId) return { ok: false, error: "Missing application id." };

  // Body fallback: empty body + at least one attachment auto-fills the body
  // so the NOT NULL CHECK on application_messages.body is satisfied without
  // forcing the user to type something.
  let finalBody = cleanBody;
  if (finalBody.length < 1) {
    if (files.length > 0) {
      finalBody = `Sent ${files.length} file${files.length === 1 ? "" : "s"}`;
    } else {
      return { ok: false, error: "Message cannot be empty." };
    }
  }
  if (finalBody.length > MAX_BODY) {
    return { ok: false, error: `Message is too long (${MAX_BODY} character max).` };
  }

  // Per-message attachment cap + per-file validation, BEFORE we hit the DB.
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      ok: false,
      error: `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`,
    };
  }
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `"${file.name}" is larger than the 25 MB limit.`,
      };
    }
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
      return {
        ok: false,
        error: `"${file.name}" has an unsupported file type.`,
      };
    }
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
      .select("id, dso_id, role, permission_overrides")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (dsoUser) {
      // #83 persona walkthrough (Day 32): this was the ONE messaging path
      // without a capability guard (sequences / custom-email / reference
      // requests all check). HM preset has apps.message=false — the UI hides
      // the composer, but defense-in-depth means the server refuses too.
      // Candidate sends are never capability-gated.
      if (
        !can(
          dsoUser.role as string,
          (dsoUser as Record<string, unknown>).permission_overrides,
          "apps.message"
        )
      ) {
        return {
          ok: false,
          error: "You don't have permission to message candidates.",
        };
      }
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
      body: finalBody,
    })
    .select(
      "id, application_id, sender_user_id, sender_role, sender_dso_user_id, body, read_at, created_at, updated_at, edited_at, deleted_at, event_kind, kind, payload"
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

  const messageId = data.id as string;

  // Analytics Phase 1 — stamp time-to-first-response on the FIRST employer
  // outbound message for this application. Idempotent: the `is null` guard
  // means only the first employer message ever sets it. Candidate messages
  // never set it. Awaited (not fire-and-forget) per the Vercel serverless rule.
  if (senderRole === "employer") {
    await supabase
      .from("applications")
      .update({ first_response_at: new Date().toISOString() })
      .eq("id", applicationId)
      .is("first_response_at", null);
  }

  const insertedAttachments: ApplicationMessageAttachment[] = [];

  if (files.length > 0) {
    // Track storage paths uploaded so we can best-effort orphan-clean if any
    // step downstream fails.
    const uploadedPaths: string[] = [];

    for (const file of files) {
      const path = `${applicationId}/${messageId}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (uploadError) {
        await rollbackAttachmentSend(supabase, messageId, uploadedPaths);
        return {
          ok: false,
          error: `Couldn't upload "${file.name}". ${uploadError.message}`,
        };
      }
      uploadedPaths.push(path);

      const { data: attachRow, error: attachError } = await supabase
        .from("application_message_attachments")
        .insert({
          message_id: messageId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          uploaded_by_user_id: user.id,
        })
        .select(
          "id, message_id, storage_path, file_name, mime_type, size_bytes, created_at"
        )
        .single();

      if (attachError || !attachRow) {
        await rollbackAttachmentSend(supabase, messageId, uploadedPaths);
        return {
          ok: false,
          error:
            attachError?.message ??
            `Couldn't record "${file.name}". Please retry.`,
        };
      }

      insertedAttachments.push({
        id: String(attachRow.id),
        message_id: String(attachRow.message_id),
        storage_path: String(attachRow.storage_path),
        file_name: String(attachRow.file_name),
        mime_type: String(attachRow.mime_type),
        size_bytes: Number(attachRow.size_bytes ?? 0),
        created_at: String(attachRow.created_at),
      });
    }
  }

  // Fire-and-forget recipient notification.
  void dispatchMessageNotification({
    applicationId: data.application_id as string,
    messageId,
    senderRole,
    senderUserId: user.id,
    senderDsoUserId,
    body: finalBody,
  });

  revalidatePath(`/employer/applications/${applicationId}`);
  revalidatePath(`/candidate/applications/${applicationId}`);

  return {
    ok: true,
    message: {
      ...rowToMessage(data),
      attachments: insertedAttachments,
    },
  };
}

const BULK_MESSAGE_CAP = 200;

export interface BulkMessageResult {
  /** application_ids that received the message. */
  succeeded: string[];
  failed: { id: string; error: string }[];
}

/**
 * E3.6 / E8.8 — broadcast one message to many applications at once
 * (employer → candidates), from the kanban selection toolbar.
 *
 * One application_messages row per application (employer sender), then the
 * candidate notification (inbox unread + candidate.message_received email)
 * fires per message via next/after() so the dispatches reliably complete
 * on Vercel rather than being killed after the response ships (the
 * fire-and-forget gotcha — same reason the single-move path moved to
 * after()). Employer-only: sender side derives from dso_users membership +
 * per-application DSO ownership, with RLS as the backstop. Capped at
 * BULK_MESSAGE_CAP. text-only (no attachments) — the per-thread composer
 * remains the path for attachments.
 */
export async function bulkMessageApplications(
  applicationIds: string[],
  body: string
): Promise<BulkMessageResult> {
  const clean = sanitizeBody(body);
  if (clean.length < 1) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "Message cannot be empty.",
      })),
    };
  }
  if (clean.length > MAX_BODY) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: `Message is too long (${MAX_BODY} character max).`,
      })),
    };
  }
  if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
    return { succeeded: [], failed: [] };
  }
  if (applicationIds.length > BULK_MESSAGE_CAP) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: `Selection exceeds the ${BULK_MESSAGE_CAP}-message limit.`,
      })),
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "Your session expired. Sign in again.",
      })),
    };
  }

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "You don't have employer access.",
      })),
    };
  }
  // #83 (Day 32) — same apps.message guard as the single-send path.
  if (
    !can(
      dsoUser.role as string,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "apps.message"
    )
  ) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "You don't have permission to message candidates.",
      })),
    };
  }
  const dsoId = dsoUser.dso_id as string;
  const senderDsoUserId = dsoUser.id as string;

  // Which of the requested applications belong to a job in this DSO? RLS
  // would also enforce this on insert, but pre-filtering lets us report a
  // clean per-row failure instead of failing the whole batch.
  const { data: ownRows } = await supabase
    .from("applications")
    .select("id, jobs!inner(dso_id)")
    .in("id", applicationIds)
    .eq("jobs.dso_id", dsoId);
  const validIds = new Set(
    ((ownRows ?? []) as Array<{ id: string }>).map((r) => r.id)
  );

  const failed: { id: string; error: string }[] = applicationIds
    .filter((id) => !validIds.has(id))
    .map((id) => ({ id, error: "Not found or no access." }));
  const toSend = applicationIds.filter((id) => validIds.has(id));
  if (toSend.length === 0) return { succeeded: [], failed };

  const rows = toSend.map((id) => ({
    application_id: id,
    sender_user_id: user.id,
    sender_role: "employer" as const,
    sender_dso_user_id: senderDsoUserId,
    body: clean,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("application_messages")
    .insert(rows)
    .select("id, application_id");

  if (insErr || !inserted) {
    return {
      succeeded: [],
      failed: [
        ...failed,
        ...toSend.map((id) => ({
          id,
          error: insErr?.message ?? "Couldn't send. Please retry.",
        })),
      ],
    };
  }

  const insertedRows = inserted as Array<{ id: string; application_id: string }>;

  // Analytics Phase 1 — stamp time-to-first-response on each application that
  // hadn't been responded to yet (bulk is always employer-sent). The `is null`
  // guard keeps it to the genuine first response per application.
  await supabase
    .from("applications")
    .update({ first_response_at: new Date().toISOString() })
    .in(
      "id",
      insertedRows.map((r) => r.application_id)
    )
    .is("first_response_at", null);

  // Fire candidate notifications (inbox unread + email) AFTER the response
  // ships, but guaranteed to run — bare void gets killed mid-flight on
  // Vercel serverless.
  for (const row of insertedRows) {
    after(async () => {
      await dispatchMessageNotification({
        applicationId: row.application_id,
        messageId: row.id,
        senderRole: "employer",
        senderUserId: user.id,
        senderDsoUserId,
        body: clean,
      });
    });
    revalidatePath(`/employer/applications/${row.application_id}`);
    revalidatePath(`/candidate/applications/${row.application_id}`);
  }

  // Single audit summary for the broadcast.
  after(async () => {
    await recordAuditEvent({
      dsoId,
      actorUserId: user.id,
      eventKind: "bulk_action.applied",
      targetTable: "applications",
      targetId: insertedRows[0].application_id,
      summary: `Messaged ${insertedRows.length} candidate${
        insertedRows.length === 1 ? "" : "s"
      }`,
      metadata: {
        action: "message",
        succeeded_count: insertedRows.length,
        failed_count: failed.length,
        application_ids: insertedRows.map((r) => r.application_id),
      },
    });
  });

  return {
    succeeded: insertedRows.map((r) => r.application_id),
    failed,
  };
}

/**
 * Best-effort rollback when an attachment upload or insert fails mid-stream.
 * Removes any storage objects that landed and soft-deletes the parent message
 * so the surface doesn't show a half-sent thread. We swallow errors here on
 * purpose — the user already has a real failure to react to.
 */
async function rollbackAttachmentSend(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  messageId: string,
  uploadedPaths: string[]
): Promise<void> {
  if (uploadedPaths.length > 0) {
    try {
      await supabase.storage.from(ATTACHMENT_BUCKET).remove(uploadedPaths);
    } catch (err) {
      console.warn("[messages] orphan cleanup failed", err);
    }
  }
  try {
    await supabase
      .from("application_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", messageId);
  } catch (err) {
    console.warn("[messages] message soft-delete on rollback failed", err);
  }
}

/* ───────────────────────────────────────────────────────────────
 * Signed URL for downloading a thread attachment
 *
 * RLS-aware: the `select` on application_message_attachments goes
 * through the user-scoped client, so the table's participant-only
 * SELECT policy gates access. If the caller isn't a participant on
 * the parent application, the row read returns null and we bail out
 * before issuing any signed URL.
 *
 * Storage signed URLs themselves are issued by the user-scoped client
 * as well — storage.objects has a matching participant-scoped read
 * policy on this bucket.
 * ───────────────────────────────────────────────────────────── */

export async function getApplicationMessageAttachmentSignedUrl(
  attachmentId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!attachmentId) {
    return { ok: false, error: "Missing attachment id." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const { data: row, error } = await supabase
    .from("application_message_attachments")
    .select("id, storage_path, file_name")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!row) {
    // Either the row doesn't exist or RLS hid it. Same message either way —
    // don't leak existence to non-participants.
    return { ok: false, error: "Attachment not found." };
  }

  const path = (row as Record<string, unknown>).storage_path as string;
  const fileName = (row as Record<string, unknown>).file_name as string;
  const { data: signed, error: signedError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60, { download: fileName });

  if (signedError || !signed?.signedUrl) {
    return {
      ok: false,
      error: signedError?.message ?? "Couldn't create download link.",
    };
  }

  return { ok: true, url: signed.signedUrl };
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
      "id, application_id, sender_user_id, sender_role, sender_dso_user_id, body, read_at, created_at, updated_at, edited_at, deleted_at, event_kind, kind, payload"
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
      .select("id, auth_user_id, first_name, full_name")
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
        recipientName = greetingFirstName(
          {
            first_name: (cand?.first_name as string | null) ?? null,
            full_name: (cand?.full_name as string | null) ?? null,
          },
          "there",
        );
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
      // Affiliation-MASK the DSO name for the candidate (raw dsoName leaks
      // the corporate name through both the fallback + custom templates).
      let candidateDsoName = dsoName;
      try {
        const displayed = await getDisplayedDsoName({
          jobId: appRow.job_id as string,
          viewer: { role: "candidate", applicationId: appRow.id as string },
        });
        if (displayed.name) candidateDsoName = displayed.name;
      } catch (e) {
        console.warn("[messages] dso name resolve failed", e);
      }
      void dispatchCandidateEmail({
        kind: "application.message_received",
        dsoId: job.dso_id as string,
        recipientUserId: recipientAuthUserId,
        recipientEmail,
        displayDsoName: candidateDsoName,
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
        fallback: {
          subject,
          react: MessageReceived({
            recipientName,
            senderName,
            senderRole: args.senderRole,
            jobTitle,
            dsoName: candidateDsoName,
            candidateName: candidateFullName,
            messageBody: args.body,
            deepLink,
            fullMessageLink: deepLink,
          }),
        },
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
