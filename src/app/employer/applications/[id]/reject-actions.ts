"use server";

/**
 * Closed-state transitions with a recruiter-supplied reason — single-row
 * counterparts to the bulk-reject + bulk-archive actions in
 * `/employer/jobs/[id]/applications/bulk-actions.ts`.
 *
 * Flow:
 *   1. `moveApplicationStage(id, 'rejected' | 'withdrawn')` — fires the
 *      AFTER-UPDATE trigger which seeds an application_status_events row
 *      with note=null. The trigger lives in
 *      20260504000005_fix_status_event_actor_type.sql and derives actor_type
 *      from auth.uid() (so an employer-driven withdraw is now correctly
 *      logged as 'employer').
 *   2. If reason is non-empty, `attachStatusEventNote` (shared helper) finds
 *      the most-recent status event for this id matching the destination
 *      status and patches its `note` column via the service-role client —
 *      RLS denies client-side INSERT/UPDATE on application_status_events.
 *
 * On a successful move + failed note patch we still report ok:true. The
 * status transition is the source of truth; an audit-trail blip should
 * never roll the move back.
 */

import { moveApplicationStage } from "./actions";
import { attachStatusEventNote } from "@/lib/applications/status-event-notes";
import type { ApplicationStatus } from "@/lib/applications/stages";

export type RejectActionResult = { ok: true } | { ok: false; error: string };

const NOTE_MAX = 1000;

async function moveAndAttachNote(
  applicationId: string,
  toStatus: Extract<ApplicationStatus, "rejected" | "withdrawn">,
  reason: string
): Promise<RejectActionResult> {
  const trimmed = (reason ?? "").trim().slice(0, NOTE_MAX);

  const move = await moveApplicationStage(applicationId, toStatus);
  if (!move.ok) {
    return { ok: false, error: move.error };
  }

  if (trimmed) {
    await attachStatusEventNote({
      applicationIds: [applicationId],
      toStatus,
      note: trimmed,
    });
  }

  return { ok: true };
}

export async function rejectWithReason(
  applicationId: string,
  reason: string
): Promise<RejectActionResult> {
  return moveAndAttachNote(applicationId, "rejected", reason);
}

export async function withdrawWithReason(
  applicationId: string,
  reason: string
): Promise<RejectActionResult> {
  return moveAndAttachNote(applicationId, "withdrawn", reason);
}
