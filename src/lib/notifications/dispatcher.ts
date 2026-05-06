/**
 * dispatchNotification() — single entry point for outbound notifications
 * (Phase 4.1.b).
 *
 * Flow per call:
 *   1. Look up the recipient's preference for (event_kind, channel).
 *      Falls back to NOTIFICATION_DEFAULTS when no row exists.
 *   2. Honor ALWAYS_DISPATCH_EVENTS bypass for transactional/legal events.
 *   3. Suppress if `enabled = false` or `frequency = 'off'` →
 *      log status='suppressed_by_pref' to notification_dispatch_log.
 *   4. v1: 'daily_digest' / 'weekly_digest' aren't fired immediately —
 *      log status='suppressed_by_cap' with `reason: 'digest_pending'`.
 *      Future digest scheduler queries the dispatch log to roll them up.
 *   5. Otherwise: hand off to `sendEmail()` (existing helper preserves
 *      the email_log audit) and capture Resend's message id.
 *   6. Always write one row to notification_dispatch_log.
 *
 * Behavior change vs. legacy `sendEmail()` direct call: NONE for the
 * default-config user. Suppression only kicks in once a user explicitly
 * toggles a preference off — which can't happen until 4.3.b / 4.5.b
 * settings UIs ship. So the code at the call sites can be rewired in
 * place with no production risk.
 */

import type { ReactElement } from "react";
import { sendEmail } from "@/lib/email/send";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_DEFAULTS,
  ALWAYS_DISPATCH_EVENTS,
  type PreferenceDefault,
} from "./defaults";
import type {
  NotificationChannel,
  NotificationDispatchStatus,
  NotificationEventKind,
  NotificationFrequency,
} from "./types";

export interface DispatchEmailPayload {
  /** Recipient's email address (need not match the userId's auth email). */
  to: string;
  subject: string;
  /** Either react OR text/html — same shape sendEmail accepts. */
  react?: ReactElement;
  text?: string;
  html?: string;
  replyTo?: string;
  from?: string;
}

export interface DispatchNotificationInput {
  /** Recipient's auth.users.id. Used for prefs lookup + dispatch log. */
  userId: string;
  eventKind: NotificationEventKind;
  /** Defaults to "email" — the only channel actually fired in v1. */
  channel?: NotificationChannel;
  /** Email payload (required when channel === "email"). */
  email?: DispatchEmailPayload;
  /** Optional cross-references stored on the email_log row. */
  relatedDsoId?: string | null;
  relatedCandidateId?: string | null;
  /**
   * Stable template key used by future digest aggregation. For v1 we
   * use the event_kind itself; pass an explicit value if a single event
   * uses multiple template variants (none today).
   */
  templateKey?: string;
}

export interface DispatchNotificationResult {
  ok: boolean;
  status: NotificationDispatchStatus;
  /** Resend message id when status === 'sent'. */
  messageId?: string;
  /** Human-readable reason; used for log messages + future debugging. */
  reason?: string;
}

/**
 * Public entry point. Server-only — never import from a "use client" file.
 */
export async function dispatchNotification(
  input: DispatchNotificationInput
): Promise<DispatchNotificationResult> {
  const channel: NotificationChannel = input.channel ?? "email";

  // Look up the preference (or fall back to the event default).
  const pref = await resolvePreference(
    input.userId,
    input.eventKind,
    channel
  );

  // Transactional events bypass the prefs check.
  const isTransactional = ALWAYS_DISPATCH_EVENTS.has(input.eventKind);

  // Suppression cases.
  if (!isTransactional && (!pref.enabled || pref.frequency === "off")) {
    await writeDispatchLog({
      userId: input.userId,
      eventKind: input.eventKind,
      channel,
      status: "suppressed_by_pref",
      templateKey: input.templateKey ?? input.eventKind,
      payload: { subject: input.email?.subject },
    });
    return {
      ok: true,
      status: "suppressed_by_pref",
      reason: "User has disabled this notification.",
    };
  }

  // Digest events are deferred to a future scheduler — log + skip the send.
  // Transactional events always send even if a digest preference would
  // otherwise apply (we never digest a one-off invitation).
  if (
    !isTransactional &&
    (pref.frequency === "daily_digest" || pref.frequency === "weekly_digest")
  ) {
    await writeDispatchLog({
      userId: input.userId,
      eventKind: input.eventKind,
      channel,
      status: "suppressed_by_cap",
      templateKey: input.templateKey ?? input.eventKind,
      payload: {
        subject: input.email?.subject,
        digest_pending: pref.frequency,
      },
    });
    return {
      ok: true,
      status: "suppressed_by_cap",
      reason: `Queued for ${pref.frequency} digest (scheduler not yet shipped).`,
    };
  }

  // Channel = email is the only path with a real send in v1.
  if (channel !== "email") {
    await writeDispatchLog({
      userId: input.userId,
      eventKind: input.eventKind,
      channel,
      status: "suppressed_by_template",
      templateKey: input.templateKey ?? input.eventKind,
      payload: { reason: "no_handler_for_channel" },
    });
    return {
      ok: true,
      status: "suppressed_by_template",
      reason: `${channel} dispatch not yet implemented — only email channel sends in v1.`,
    };
  }

  if (!input.email) {
    await writeDispatchLog({
      userId: input.userId,
      eventKind: input.eventKind,
      channel,
      status: "failed",
      templateKey: input.templateKey ?? input.eventKind,
      payload: { reason: "missing_email_payload" },
      errorMessage: "dispatchNotification called without email payload",
    });
    return {
      ok: false,
      status: "failed",
      reason: "Missing email payload.",
    };
  }

  // Hand off to the existing email helper. It already writes to email_log
  // for the legacy audit; we ALSO write to notification_dispatch_log for
  // the new orchestration audit. Both tables coexist for v1.
  const sendResult = await sendEmail({
    to: input.email.to,
    subject: input.email.subject,
    template: input.eventKind, // sendEmail's template id == event_kind for v1
    react: input.email.react,
    text: input.email.text,
    html: input.email.html,
    replyTo: input.email.replyTo,
    from: input.email.from,
    relatedDsoId: input.relatedDsoId ?? null,
    relatedCandidateId: input.relatedCandidateId ?? null,
  });

  if (!sendResult.ok) {
    await writeDispatchLog({
      userId: input.userId,
      eventKind: input.eventKind,
      channel,
      status: "failed",
      templateKey: input.templateKey ?? input.eventKind,
      payload: { subject: input.email.subject },
      errorMessage: sendResult.error ?? "send_failed",
    });
    return {
      ok: false,
      status: "failed",
      reason: sendResult.error ?? "send_failed",
    };
  }

  await writeDispatchLog({
    userId: input.userId,
    eventKind: input.eventKind,
    channel,
    status: "sent",
    templateKey: input.templateKey ?? input.eventKind,
    resendId: sendResult.messageId ?? null,
    payload: { subject: input.email.subject },
  });

  return {
    ok: true,
    status: "sent",
    messageId: sendResult.messageId,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Read the preference row for (userId, eventKind, channel) — fall back
 * to the per-event default if no row exists or the lookup fails.
 *
 * Service-role client because RLS would scope the lookup to the caller,
 * not the recipient. Dispatch is server-side and trusted; we control
 * what userId is passed in via the call sites.
 */
async function resolvePreference(
  userId: string,
  eventKind: NotificationEventKind,
  channel: NotificationChannel
): Promise<PreferenceDefault> {
  const fallback = NOTIFICATION_DEFAULTS[eventKind][channel];
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data, error } = await admin
      .from("notification_preferences")
      .select("enabled, frequency")
      .eq("user_id", userId)
      .eq("event_kind", eventKind)
      .eq("channel", channel)
      .maybeSingle();
    if (error || !data) return fallback;
    return {
      enabled: Boolean(data.enabled),
      frequency: (data.frequency as NotificationFrequency) ?? fallback.frequency,
    };
  } catch (err) {
    // Fail-open: if prefs lookup blows up, default to the event default
    // so we never silently drop a notification.
    console.warn("[notifications] prefs lookup failed; using default", err);
    return fallback;
  }
}

async function writeDispatchLog(args: {
  userId: string;
  eventKind: NotificationEventKind;
  channel: NotificationChannel;
  status: NotificationDispatchStatus;
  templateKey: string;
  resendId?: string | null;
  payload?: Record<string, unknown>;
  errorMessage?: string;
}): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();
    await admin.from("notification_dispatch_log").insert({
      user_id: args.userId,
      event_kind: args.eventKind,
      channel: args.channel,
      status: args.status,
      template_key: args.templateKey,
      resend_id: args.resendId ?? null,
      payload: args.payload ?? {},
      error_message: args.errorMessage ?? null,
    });
  } catch (err) {
    // Logging failures must never break a real send.
    console.warn("[notifications] dispatch_log insert failed", err);
  }
}
