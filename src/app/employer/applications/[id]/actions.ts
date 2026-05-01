"use server";

/**
 * /employer/applications/[id] server actions — status transitions + notes.
 *
 * Status changes are written directly to applications.status; the BEFORE
 * UPDATE trigger on the table seeds an application_status_events row.
 * RLS enforces that only DSO members can update applications on their
 * own jobs.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

const VALID_STATUSES = new Set([
  "new",
  "reviewed",
  "interviewing",
  "offered",
  "hired",
  "rejected",
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
