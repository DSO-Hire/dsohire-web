"use server";

/**
 * /employer/applications/[id] server actions — status transitions + notes.
 *
 * Status changes are written directly to applications.status; the BEFORE
 * UPDATE trigger on the table seeds an application_status_events row.
 * RLS enforces that only DSO members can update applications on their
 * own jobs.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/applications/stages";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Result of `moveApplicationStage`. Includes the previous status so the
 * kanban can roll back optimistically on failure.
 */
export type MoveApplicationStageResult =
  | {
      ok: true;
      prevStatus: ApplicationStatus;
      nextStatus: ApplicationStatus;
      stageEnteredAt: string;
    }
  | { ok: false; error: string };

// Includes 'withdrawn' because the StageSelector's "Mark Withdrawn" closed-
// state transition routes through this action (employer-driven withdraw is a
// real surface; RLS still gates who can write).
const VALID_STATUSES = new Set([
  "new",
  "reviewed",
  "interviewing",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export async function updateApplicationStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("application_id") ?? "").trim();
  const next = String(formData.get("next_status") ?? "").trim();

  if (!id || !VALID_STATUSES.has(next)) {
    return { ok: false, error: "Invalid status transition." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("applications")
    .update({ status: next })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/employer/applications`);
  revalidatePath(`/employer/applications/${id}`);
  return { ok: true, message: `Marked as ${next}.` };
}

/**
 * Move an application to a new pipeline stage. Used by the kanban board's
 * drag-drop (and any single-step transition that needs an
 * optimistic-update-friendly return shape).
 *
 * Reads the current status first so the caller can roll back. RLS-denied
 * updates return zero rows with no error from PostgREST, so we treat the
 * empty result as a failure.
 */
export async function moveApplicationStage(
  applicationId: string,
  nextStatus: ApplicationStatus
): Promise<MoveApplicationStageResult> {
  if (!applicationId) {
    return { ok: false, error: "Missing application id." };
  }
  if (!VALID_STATUSES.has(nextStatus)) {
    return { ok: false, error: "Invalid status transition." };
  }

  const supabase = await createSupabaseServerClient();

  // Read current status first so optimistic rollback has the previous value.
  const { data: prev, error: prevErr } = await supabase
    .from("applications")
    .select("status")
    .eq("id", applicationId)
    .single();
  if (prevErr || !prev) {
    return { ok: false, error: prevErr?.message ?? "Application not found" };
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ status: nextStatus })
    .eq("id", applicationId)
    .select("id, status, stage_entered_at")
    .single();

  // RLS-denied updates return 0 rows with no error. Treat as failure.
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Update denied or row not found",
    };
  }

  revalidatePath(`/employer/applications`);
  revalidatePath(`/employer/applications/${applicationId}`);
  // Next 16 requires the two-argument form; "max" = stale-while-revalidate.
  revalidateTag(`applications:${applicationId}`, "max");

  return {
    ok: true,
    prevStatus: prev.status as ApplicationStatus,
    nextStatus: data.status as ApplicationStatus,
    stageEnteredAt: data.stage_entered_at,
  };
}

export async function saveEmployerNotes(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("application_id") ?? "").trim();
  const notes = String(formData.get("employer_notes") ?? "").trim();

  if (!id) return { ok: false, error: "Missing application id." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("applications")
    .update({ employer_notes: notes || null })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/employer/applications/${id}`);
  return { ok: true, message: "Notes saved." };
}
