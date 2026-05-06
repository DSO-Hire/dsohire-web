"use server";

/**
 * Saved-jobs server actions (Phase 4.4 saved-jobs slice).
 *
 * Two surfaces consume these:
 *   • Bookmark button on /jobs/[id] (detail page + list cards)
 *   • "Saved" tab on /candidate/applications
 *
 * The button is a toggle: if the candidate hasn't saved the job, save
 * it; if they have, remove it. The action returns the new saved state
 * so the client can flip its icon optimistically.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ToggleSavedJobResult =
  | { ok: true; saved: boolean }
  | {
      ok: false;
      error: string;
      errorCode: "not_signed_in" | "no_candidate" | "save_failed";
    };

async function getCandidateContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false as const,
      errorCode: "not_signed_in" as const,
      error: "Please sign in to save jobs.",
    };
  }
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return {
      ok: false as const,
      errorCode: "no_candidate" as const,
      error: "Candidate record missing.",
    };
  }
  return {
    ok: true as const,
    supabase,
    candidateId: candidate.id as string,
  };
}

/**
 * Toggle the saved state for a job. If currently saved → delete the
 * row. If not saved → insert a row. Returns the resulting saved state.
 */
export async function toggleSavedJob(
  jobId: string
): Promise<ToggleSavedJobResult> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  // Read existing state.
  const { data: existing } = await ctx.supabase
    .from("saved_jobs")
    .select("id")
    .eq("candidate_id", ctx.candidateId)
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing) {
    // Currently saved → unsave.
    const { error } = await ctx.supabase
      .from("saved_jobs")
      .delete()
      .eq("id", existing.id)
      .eq("candidate_id", ctx.candidateId);
    if (error) {
      console.error("[saved-jobs] delete failed", error);
      return {
        ok: false,
        errorCode: "save_failed",
        error: "Couldn't remove that bookmark.",
      };
    }
    revalidatePath(`/jobs/${jobId}`);
    revalidatePath("/candidate/applications");
    return { ok: true, saved: false };
  }

  // Not saved → save.
  const { error } = await ctx.supabase.from("saved_jobs").insert({
    candidate_id: ctx.candidateId,
    job_id: jobId,
  });
  if (error) {
    // Unique-violation = race; treat as already-saved.
    if (error.code === "23505") {
      return { ok: true, saved: true };
    }
    console.error("[saved-jobs] insert failed", error);
    return {
      ok: false,
      errorCode: "save_failed",
      error: "Couldn't save that job.",
    };
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/candidate/applications");
  return { ok: true, saved: true };
}
