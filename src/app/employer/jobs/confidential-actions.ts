"use server";

/**
 * #83 Phase 4 — edit-page action for the confidential-search card.
 *
 * The create wizards persist confidentiality through createJob /
 * createCorporateJob; existing jobs are managed via this dedicated action
 * (the edit pages are per-section forms, and confidentiality deserves its
 * own card rather than riding the Basics save).
 *
 * Guards: actor must hold jobs.edit AND be able to SEE the job (the
 * RLS-scoped read below returns null for non-assigned members of a
 * confidential job — they can't discover it, let alone edit it).
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { capabilityBlockError, getActingMember } from "@/lib/permissions/guard";
import {
  parseConfidentialFields,
  syncJobConfidentiality,
} from "@/lib/permissions/confidential";
import { recordAuditEvent } from "@/lib/audit/record";

export interface ConfidentialActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function updateJobConfidentiality(
  _prev: ConfidentialActionState,
  formData: FormData
): Promise<ConfidentialActionState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  if (!jobId) return { ok: false, error: "Missing job." };

  const supabase = await createSupabaseServerClient();

  // RLS-scoped read — proves the actor can SEE this job (confidentiality
  // included) and resolves the DSO for the capability check.
  const { data: job } = await supabase
    .from("jobs")
    .select("id, dso_id, title, confidential")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return { ok: false, error: "Job not found or access denied." };
  const dsoId = job.dso_id as string;

  const editBlock = await capabilityBlockError(supabase, "jobs.edit", { dsoId });
  if (editBlock) return { ok: false, error: editBlock };

  const actor = await getActingMember(supabase, { dsoId });
  if (!actor) return { ok: false, error: "No DSO context found." };

  const fields = parseConfidentialFields(formData);
  if (!fields.submitted) return { ok: false, error: "Nothing to save." };

  const result = await syncJobConfidentiality({
    jobId,
    dsoId,
    fields,
    actorDsoUserId: actor.dsoUserId,
  });
  if (!result.ok) return result;

  const priorConfidential = Boolean(job.confidential);
  if (priorConfidential !== fields.confidential) {
    void recordAuditEvent({
      dsoId,
      actorUserId: actor.authUserId,
      actorDsoUserId: actor.dsoUserId,
      actorName: actor.fullName,
      actorRole: actor.role,
      eventKind: "job.confidentiality_changed",
      targetTable: "jobs",
      targetId: jobId,
      summary: fields.confidential
        ? `Made "${(job.title as string | null) ?? "a job"}" a confidential search`
        : `Removed the confidential restriction on "${(job.title as string | null) ?? "a job"}"`,
      metadata: {
        job_id: jobId,
        confidential: fields.confidential,
        assignee_count: fields.assigneeIds.length,
      },
    });
  }

  revalidatePath(`/employer/jobs/${jobId}`);
  revalidatePath(`/employer/jobs/${jobId}/edit`);
  revalidatePath("/employer/jobs");
  return {
    ok: true,
    message: fields.confidential
      ? "Saved — only owners, admins, and assigned teammates can see this job."
      : "Saved — this job is visible to your whole team again.",
  };
}
