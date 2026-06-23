"use server";

/**
 * Prospect pipeline server actions (Sourcing CRM — Phase 1).
 *
 * Moving a prospect between stages persists pipeline_stage + bumps
 * last_activity_at and logs a stage_change activity. Write access is gated by
 * the dso_talent_pool_entries RLS (owner/admin/recruiter for this DSO); the
 * sourcing.* capability gate lands in Phase 4.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isValidProspectStage,
  logProspectActivity,
  type ProspectStage,
} from "@/lib/sourcing/pipeline";

export interface PipelineActionState {
  ok: boolean;
  error?: string;
}

export async function moveProspectStage(
  entryId: string,
  toStage: string,
): Promise<PipelineActionState> {
  if (!entryId) return { ok: false, error: "Missing prospect." };
  if (!isValidProspectStage(toStage)) {
    return { ok: false, error: "Invalid stage." };
  }
  const stage = toStage as ProspectStage;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context." };

  // Load the entry (RLS scopes to this DSO) to capture the prior stage + the
  // candidate id for the activity row.
  const { data: entry } = await supabase
    .from("dso_talent_pool_entries")
    .select("id, candidate_id, pipeline_stage, dso_id")
    .eq("id", entryId)
    .eq("dso_id", dsoUser.dso_id as string)
    .maybeSingle();
  if (!entry) return { ok: false, error: "Prospect not found." };

  const fromStage = (entry.pipeline_stage as string | null) ?? "sourced";
  if (fromStage === stage) return { ok: true };

  const { error } = await supabase
    .from("dso_talent_pool_entries")
    .update({ pipeline_stage: stage, last_activity_at: new Date().toISOString() })
    .eq("id", entryId)
    .eq("dso_id", dsoUser.dso_id as string);
  if (error) return { ok: false, error: "Couldn't move the prospect." };

  await logProspectActivity(supabase, {
    dsoId: dsoUser.dso_id as string,
    candidateId: entry.candidate_id as string,
    kind: "stage_change",
    actorDsoUserId: dsoUser.id as string,
    metadata: { from: fromStage, to: stage },
  });

  revalidatePath("/employer/talent-pool");
  return { ok: true };
}
