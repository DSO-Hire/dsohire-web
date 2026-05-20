/**
 * Centralized transactional email helper.
 *
 * Wraps Resend with two responsibilities:
 *   1. Render a React Email template (or plain text/html) and send via Resend
 *   2. Log every send (success or failure) to the `email_log` table for
 *      audit + debugging
 *
 * Email failures should NEVER bubble up and break a user-facing flow (an
 * application submission, a sign-up, etc.) — callers should treat email as
 * fire-and-forget. We swallow errors here, log them, and return a result
 * object so the caller can choose what to surface (rare).
 *
 * Service-role Supabase client is used for the email_log insert because the
 * RLS policy on email_log is service-role-write-only.
 */

import { Resend } from "resend";
import type { ReactElement } from "react";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const FROM_DEFAULT = "DSO Hire <no-reply@dsohire.com>";

// Lazy-init Resend client. The Resend SDK throws on `new Resend(undefined)`
// at construction time, which breaks `next build` page-data collection
// when RESEND_API_KEY is missing from the local env. Defer instantiation
// to the first actual send so module imports stay env-independent.
let _resend: Resend | null = null;
function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to Vercel env vars (production + preview) or your local .env.local."
    );
  }
  _resend = new Resend(key);
  return _resend;
}

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  template: string; // identifier saved to email_log (e.g. "candidate.application_received")
  react?: ReactElement;
  text?: string;
  html?: string;
  replyTo?: string;
  from?: string;
  relatedDsoId?: string | null;
  relatedCandidateId?: string | null;
  /**
   * One-click unsubscribe URL for commercial mail. When set, we attach the
   * RFC 8058 List-Unsubscribe + List-Unsubscribe-Post headers so Gmail/Yahoo
   * render their native one-click "Unsubscribe" control. Omit for transactional
   * mail (which carries no hard unsubscribe). Set by the dispatcher.
   */
  listUnsubscribeUrl?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const {
    to,
    subject,
    template,
    react,
    text,
    html,
    replyTo,
    from = FROM_DEFAULT,
    relatedDsoId = null,
    relatedCandidateId = null,
    listUnsubscribeUrl = null,
  } = params;

  if (!process.env.RESEND_API_KEY) {
    console.warn(`[email] RESEND_API_KEY missing — skipping send for "${template}"`);
    void logEmail({
      toEmail: Array.isArray(to) ? to.join(", ") : to,
      fromEmail: from,
      template,
      subject,
      status: "skipped",
      error: "RESEND_API_KEY not configured",
      relatedDsoId,
      relatedCandidateId,
    });
    return { ok: false, error: "Email is not configured." };
  }

  try {
    const client = getResend();
    type EmailSendParams = Parameters<typeof client.emails.send>[0];
    // RFC 8058 one-click unsubscribe headers (commercial mail only).
    const unsubHeaders = listUnsubscribeUrl
      ? {
          "List-Unsubscribe": `<${listUnsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        }
      : undefined;
    const payload: EmailSendParams = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      ...(react ? { react } : {}),
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      ...(replyTo ? { replyTo } : {}),
      ...(unsubHeaders ? { headers: unsubHeaders } : {}),
    } as EmailSendParams;

    const { data, error } = await client.emails.send(payload);

    if (error) {
      console.error(`[email] resend.send failed for "${template}":`, error);
      void logEmail({
        toEmail: Array.isArray(to) ? to.join(", ") : to,
        fromEmail: from,
        template,
        subject,
        status: "failed",
        error: error.message ?? "Unknown Resend error",
        relatedDsoId,
        relatedCandidateId,
      });
      return { ok: false, error: error.message ?? "Email send failed." };
    }

    void logEmail({
      toEmail: Array.isArray(to) ? to.join(", ") : to,
      fromEmail: from,
      template,
      subject,
      resendMessageId: data?.id ?? null,
      status: "sent",
      relatedDsoId,
      relatedCandidateId,
    });

    return { ok: true, messageId: data?.id };
  } catch (err) {
    console.error(`[email] exception while sending "${template}":`, err);
    const message = err instanceof Error ? err.message : "Unknown exception";
    void logEmail({
      toEmail: Array.isArray(to) ? to.join(", ") : to,
      fromEmail: from,
      template,
      subject,
      status: "failed",
      error: message,
      relatedDsoId,
      relatedCandidateId,
    });
    return { ok: false, error: message };
  }
}

/* ───────────────────────────────────────────────────────────────
 * email_log writer (service-role, fire-and-forget)
 * ───────────────────────────────────────────────────────────── */

interface LogEmailParams {
  toEmail: string;
  fromEmail: string;
  template: string;
  subject: string;
  resendMessageId?: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string;
  relatedDsoId?: string | null;
  relatedCandidateId?: string | null;
}

async function logEmail(params: LogEmailParams): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // No service-role key configured — skip logging (don't break the send)
    return;
  }

  try {
    const supabase = createSupabaseServiceRoleClient();
    const { error: insertError } = await supabase.from("email_log").insert({
      to_email: params.toEmail,
      from_email: params.fromEmail,
      template: params.template,
      subject: params.subject,
      resend_message_id: params.resendMessageId ?? null,
      status: params.status,
      error: params.error ?? null,
      related_dso_id: params.relatedDsoId ?? null,
      related_candidate_id: params.relatedCandidateId ?? null,
    });
    // Supabase's typed client doesn't throw on insert failures — it
    // returns the error in the response object. Surface it via
    // console.warn so future logging breaks are debuggable.
    if (insertError) {
      console.warn(
        "[email] email_log insert returned error:",
        insertError.message,
        insertError
      );
    }
  } catch (err) {
    // Logging failures should never break a send. Only console-warn.
    console.warn("[email] email_log insert failed:", err);
  }
}
