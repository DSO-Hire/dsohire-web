/**
 * Inbox system-message dispatcher (Phase 4.8 — Cam's email-supplement vision).
 *
 * Drops a system-authored row into application_messages. Used by every
 * existing dispatch surface (kanban stage move, apply, withdraw, etc.)
 * as a sibling to the email send — same trigger, two channels.
 *
 * Fire-and-forget: errors are logged but never rethrown. A failed
 * inbox dispatch should NEVER roll back the upstream user-facing
 * action (the stage move, the application creation, the withdraw).
 *
 * Schema rules (enforced by 20260507000004 CHECK):
 *   • sender_user_id is NULL for system messages (we use the service-
 *     role client to insert, no auth.uid() to attribute to)
 *   • event_kind is NOT NULL — distinguishes system from human
 *
 * sender_role encodes the AUDIENCE-SPEAKING-FOR:
 *   • 'employer' — DSO is informing the candidate (stage_changed,
 *     application_received, job_filled). Candidate's unread-count
 *     picks these up automatically.
 *   • 'candidate' — candidate is informing the DSO (application_withdrawn).
 *     Employer's unread-count picks these up.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type InboxEventKind =
  | "stage_changed"
  | "application_received"
  | "application_withdrawn"
  | "job_filled"
  | "interview_proposed"
  | "interview_booked"
  | "interview_cancelled";

export interface DispatchSystemMessageInput {
  applicationId: string;
  eventKind: InboxEventKind;
  body: string;
  /**
   * Encodes who the system is "speaking on behalf of" so the
   * unread-count query picks it up for the right audience:
   *   - 'employer' — for messages aimed at the candidate
   *   - 'candidate' — for messages aimed at the employer
   */
  senderRole: "candidate" | "employer";
}

export async function dispatchInboxSystemMessage(
  input: DispatchSystemMessageInput
): Promise<{ ok: boolean; error?: string }> {
  if (!input.applicationId) {
    console.warn("[inbox/system] missing applicationId; skipping");
    return { ok: false, error: "missing applicationId" };
  }
  if (!input.body || input.body.trim().length === 0) {
    console.warn("[inbox/system] empty body; skipping");
    return { ok: false, error: "empty body" };
  }

  try {
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin.from("application_messages").insert({
      application_id: input.applicationId,
      sender_user_id: null,
      sender_role: input.senderRole,
      sender_dso_user_id: null,
      body: input.body.trim().slice(0, 5000),
      event_kind: input.eventKind,
    });
    if (error) {
      console.error(
        `[inbox/system] insert failed for ${input.eventKind}:`,
        error
      );
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    console.error(
      `[inbox/system] exception for ${input.eventKind}:`,
      err
    );
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}
