/**
 * #83 Phase 4 — confidential-search server helpers.
 *
 * A confidential job is visible (employer-side) only to owner/admin and
 * the dso_users listed in job_team_access. The heavy enforcement lives in
 * RLS (user_can_access_job + the jobs select policies, migration
 * 20260610260000); these helpers handle the WRITE side: parsing the
 * wizard/editor form fields and syncing the assignment rows.
 *
 * Writes go through the service-role client AFTER the calling action has
 * verified the actor (jobs.create / jobs.edit capability + DSO scope) —
 * RLS INSERT on job_team_access is owner/admin-only, but a recruiter who
 * creates a confidential search must be able to assign themselves, so the
 * action layer owns this write. Assignees are validated to be members of
 * the SAME DSO; the creator is force-included so nobody can lock
 * themselves out of their own posting.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface ConfidentialFields {
  /** Sentinel — only sync when the form actually carried the control. */
  submitted: boolean;
  confidential: boolean;
  assigneeIds: string[];
}

export function parseConfidentialFields(formData: FormData): ConfidentialFields {
  const submitted =
    String(formData.get("confidential_submitted") ?? "") === "1";
  const confidential = formData.get("confidential") === "on";
  const assigneeIds = formData
    .getAll("confidential_assignee_ids")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
  return { submitted, confidential, assigneeIds };
}

/**
 * Persist jobs.confidential + replace the job_team_access assignment set.
 * No-ops unless `fields.submitted`. Off → flag false + assignments cleared.
 */
export async function syncJobConfidentiality(input: {
  jobId: string;
  dsoId: string;
  fields: ConfidentialFields;
  /** The acting dso_users.id — force-included in the assignment set. */
  actorDsoUserId: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { jobId, dsoId, fields, actorDsoUserId } = input;
  if (!fields.submitted) return { ok: true };

  const admin = createSupabaseServiceRoleClient();

  if (!fields.confidential) {
    const { error: flagErr } = await admin
      .from("jobs")
      .update({ confidential: false })
      .eq("id", jobId)
      .eq("dso_id", dsoId);
    if (flagErr) return { ok: false, error: "Couldn't update the confidential flag." };
    await admin.from("job_team_access").delete().eq("job_id", jobId);
    return { ok: true };
  }

  // Validate assignees belong to THIS DSO (cross-DSO ids silently dropped).
  const wanted = new Set(fields.assigneeIds);
  if (actorDsoUserId) wanted.add(actorDsoUserId);
  let validIds: string[] = [];
  if (wanted.size > 0) {
    const { data: rows } = await admin
      .from("dso_users")
      .select("id")
      .eq("dso_id", dsoId)
      .in("id", [...wanted]);
    validIds = ((rows ?? []) as Array<{ id: string }>).map((r) => r.id);
  }

  const { error: flagErr } = await admin
    .from("jobs")
    .update({ confidential: true })
    .eq("id", jobId)
    .eq("dso_id", dsoId);
  if (flagErr) return { ok: false, error: "Couldn't update the confidential flag." };

  // Replace the assignment set (delete + insert — same pattern as
  // assignHmLocations).
  await admin.from("job_team_access").delete().eq("job_id", jobId);
  if (validIds.length > 0) {
    const { error: insErr } = await admin.from("job_team_access").insert(
      validIds.map((id) => ({ job_id: jobId, dso_user_id: id }))
    );
    if (insErr) {
      return { ok: false, error: "Couldn't save the assigned teammates." };
    }
  }
  return { ok: true };
}

/** Read the current assignment set (service-role; caller verifies access). */
export async function getJobTeamAccessIds(jobId: string): Promise<string[]> {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from("job_team_access")
    .select("dso_user_id")
    .eq("job_id", jobId);
  return ((data ?? []) as Array<{ dso_user_id: string }>).map(
    (r) => r.dso_user_id
  );
}
