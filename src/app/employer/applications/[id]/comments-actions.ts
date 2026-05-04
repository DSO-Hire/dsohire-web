"use server";

/**
 * /employer/applications/[id] — server actions for the team comments thread.
 *
 * Mirrors the moveApplicationStage RLS-aware empty-row pattern: PostgREST
 * returns zero rows when RLS denies a write but no error message, so we
 * treat the empty result as a permission failure.
 *
 * Mention emails are dispatched fire-and-forget after the database row is
 * committed. A failure to send must NEVER roll back the comment — the
 * comment exists, the recipient just doesn't get notified. Idempotency
 * guard for edits: only the *newly added* mention IDs in an update get
 * notified, so re-mentioning the same teammate after an edit doesn't spam.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { CommentMention } from "@/emails/employer/CommentMention";

export interface CommentActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface ApplicationCommentRow {
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
}

export type CreateCommentResult =
  | { ok: true; comment: ApplicationCommentRow }
  | { ok: false; error: string };

export type UpdateCommentResult =
  | { ok: true; comment: ApplicationCommentRow }
  | { ok: false; error: string };

export type DeleteCommentResult = { ok: true } | { ok: false; error: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

const MENTION_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeMentionIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    if (!MENTION_REGEX.test(v)) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function sanitizeBody(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.trim();
}

/* ───────────────────────────────────────────────────────────────
 * Create
 * ───────────────────────────────────────────────────────────── */

export async function createApplicationComment({
  applicationId,
  body,
  mentionedUserIds,
}: {
  applicationId: string;
  body: string;
  mentionedUserIds: string[];
}): Promise<CreateCommentResult> {
  const cleanBody = sanitizeBody(body);
  const cleanMentions = sanitizeMentionIds(mentionedUserIds);

  if (!applicationId) return { ok: false, error: "Missing application id." };
  if (cleanBody.length < 1) return { ok: false, error: "Comment cannot be empty." };
  if (cleanBody.length > 4000) {
    return { ok: false, error: "Comment is too long (4000 character max)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Resolve the author's dso_users row (NOT NULL FK on the comment).
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context found." };

  const { data, error } = await supabase
    .from("application_comments")
    .insert({
      application_id: applicationId,
      author_user_id: user.id,
      author_dso_user_id: dsoUser.id as string,
      body: cleanBody,
      mentioned_user_ids: cleanMentions,
    })
    .select(
      "id, application_id, author_user_id, author_dso_user_id, body, mentioned_user_ids, created_at, updated_at, edited_at, deleted_at"
    )
    .single();

  // RLS-denied insert returns no row. Treat as permission failure.
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "You don't have access to comment on this application.",
    };
  }

  // Fire-and-forget mention notifications. Failures here do NOT roll back.
  if (cleanMentions.length > 0) {
    void dispatchMentionEmails({
      commentId: data.id as string,
      applicationId,
      authorName: (dsoUser.full_name as string | null) ?? null,
      dsoId: dsoUser.dso_id as string,
      newMentionIds: cleanMentions,
      body: cleanBody,
    });
  }

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true, comment: data as ApplicationCommentRow };
}

/* ───────────────────────────────────────────────────────────────
 * Update
 * ───────────────────────────────────────────────────────────── */

export async function updateApplicationComment({
  commentId,
  body,
  mentionedUserIds,
}: {
  commentId: string;
  body: string;
  mentionedUserIds: string[];
}): Promise<UpdateCommentResult> {
  const cleanBody = sanitizeBody(body);
  const cleanMentions = sanitizeMentionIds(mentionedUserIds);

  if (!commentId) return { ok: false, error: "Missing comment id." };
  if (cleanBody.length < 1) return { ok: false, error: "Comment cannot be empty." };
  if (cleanBody.length > 4000) {
    return { ok: false, error: "Comment is too long (4000 character max)." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // Snapshot prior state so the mention-diff can avoid double-emailing.
  const { data: priorRaw } = await supabase
    .from("application_comments")
    .select(
      "id, application_id, author_user_id, author_dso_user_id, body, mentioned_user_ids, created_at, updated_at, edited_at, deleted_at"
    )
    .eq("id", commentId)
    .maybeSingle();
  const prior = priorRaw as ApplicationCommentRow | null;
  if (!prior) return { ok: false, error: "Comment not found." };
  if (prior.deleted_at) return { ok: false, error: "Comment was deleted." };

  const { data, error } = await supabase
    .from("application_comments")
    .update({
      body: cleanBody,
      mentioned_user_ids: cleanMentions,
    })
    .eq("id", commentId)
    .select(
      "id, application_id, author_user_id, author_dso_user_id, body, mentioned_user_ids, created_at, updated_at, edited_at, deleted_at"
    )
    .single();

  // RLS-denied (window expired or wrong author) returns no row.
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "You can only edit your own comments within 5 minutes.",
    };
  }

  // Notify only newly-added mentions on edit (idempotent re-mention guard).
  const priorMentions = new Set(prior.mentioned_user_ids ?? []);
  const newMentions = cleanMentions.filter((id) => !priorMentions.has(id));
  if (newMentions.length > 0) {
    // Resolve dso_id again for the email log linkage.
    const { data: dsoUser } = await supabase
      .from("dso_users")
      .select("dso_id, full_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (dsoUser) {
      void dispatchMentionEmails({
        commentId: data.id as string,
        applicationId: data.application_id as string,
        authorName: (dsoUser.full_name as string | null) ?? null,
        dsoId: dsoUser.dso_id as string,
        newMentionIds: newMentions,
        body: cleanBody,
      });
    }
  }

  revalidatePath(`/employer/applications/${data.application_id}`);
  return { ok: true, comment: data as ApplicationCommentRow };
}

/* ───────────────────────────────────────────────────────────────
 * Delete (soft)
 * ───────────────────────────────────────────────────────────── */

export async function deleteApplicationComment(
  commentId: string
): Promise<DeleteCommentResult> {
  if (!commentId) return { ok: false, error: "Missing comment id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  // RLS update policy already gates on author_user_id + 5-minute window;
  // the soft-delete is just a normal UPDATE that flips deleted_at.
  const { data, error } = await supabase
    .from("application_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .select("application_id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "You can only delete your own comments within 5 minutes.",
    };
  }

  revalidatePath(`/employer/applications/${data.application_id}`);
  return { ok: true };
}

/* ───────────────────────────────────────────────────────────────
 * Mention email dispatch (internal — fire-and-forget)
 * ───────────────────────────────────────────────────────────── */

interface DispatchMentionEmailsArgs {
  commentId: string;
  applicationId: string;
  authorName: string | null;
  dsoId: string;
  newMentionIds: string[];
  body: string;
}

async function dispatchMentionEmails(
  args: DispatchMentionEmailsArgs
): Promise<void> {
  const { commentId, applicationId, authorName, dsoId, newMentionIds, body } =
    args;
  if (newMentionIds.length === 0) return;

  try {
    const admin = createSupabaseServiceRoleClient();

    // Fetch candidate name for the subject line. Use service role here to
    // bypass RLS — we only project candidate.full_name and the recipients
    // are by definition members of the same DSO that owns the application.
    const { data: appRow } = await admin
      .from("applications")
      .select("id, candidate_id")
      .eq("id", applicationId)
      .maybeSingle();
    let candidateName = "a candidate";
    if (appRow?.candidate_id) {
      const { data: cand } = await admin
        .from("candidates")
        .select("full_name")
        .eq("id", appRow.candidate_id as string)
        .maybeSingle();
      const full = (cand?.full_name as string | null) ?? null;
      if (full && full.trim()) candidateName = full.trim();
    }

    const author = authorName?.trim() || "A teammate";
    const subject = `${author} mentioned you on ${candidateName}`;
    const deepLink = `${SITE_URL}/employer/applications/${applicationId}#comment-${commentId}`;

    for (const mentionedAuthId of newMentionIds) {
      const { data: authUser } =
        await admin.auth.admin.getUserById(mentionedAuthId);
      const recipientEmail = authUser?.user?.email ?? null;
      if (!recipientEmail) continue;

      // First-name greeting from dso_users.full_name (preferred) or fallback.
      const { data: recipientDsoUser } = await admin
        .from("dso_users")
        .select("full_name")
        .eq("auth_user_id", mentionedAuthId)
        .maybeSingle();
      const recipientName =
        ((recipientDsoUser?.full_name as string | null) ?? "")
          .split(" ")[0]
          .trim() || "there";

      void sendEmail({
        to: recipientEmail,
        subject,
        template: "employer.comment_mention",
        relatedDsoId: dsoId,
        react: CommentMention({
          recipientName,
          authorName: author,
          candidateName,
          commentBody: body,
          deepLink,
        }),
      });
    }
  } catch (err) {
    // Never throw out of fire-and-forget; just log.
    console.warn("[comments] mention dispatch failed", err);
  }
}
