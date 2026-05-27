"use server";

/**
 * /employer/applications/[id] server actions — stage transitions + notes.
 *
 * Stage changes are written to applications.stage_id (the FK to the
 * per-DSO dso_pipeline_stages row). The AFTER UPDATE trigger on the
 * table seeds an application_status_events row with the from_stage_kind
 * + to_stage_kind snapshot. RLS enforces that only DSO members can
 * update applications on their own jobs.
 *
 * The action accepts either { stageId } (direct row id — what the
 * kanban now passes) or { kind } (a system-level category — what the
 * detail page's StageSelector + bulk-reject helpers pass). The kind
 * branch resolves to the DSO's default stage of that kind server-side.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  KIND_DEFAULT_LABELS,
  STAGE_KINDS,
  type StageKind,
} from "@/lib/applications/stages";
import { dispatchInboxSystemMessage } from "@/lib/inbox/dispatch-system";
import { dispatchStageChangedEmail } from "@/lib/email/templates/stage-changed-dispatch";
import { recordAuditEvent } from "@/lib/audit/record";

export interface ActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

/**
 * Result of `moveApplicationStage`. Includes both the previous and next
 * stage_id (so optimistic UIs can roll back precisely) and the snapshot
 * kinds (so toast copy can render a friendly label without re-querying
 * the live stages list).
 */
export type MoveApplicationStageResult =
  | {
      ok: true;
      prevStageId: string;
      nextStageId: string;
      prevKind: StageKind;
      nextKind: StageKind;
      stageEnteredAt: string;
    }
  | { ok: false; error: string };

const VALID_KIND_SET = new Set<StageKind>(STAGE_KINDS);

function isStageKind(value: unknown): value is StageKind {
  return typeof value === "string" && VALID_KIND_SET.has(value as StageKind);
}

/**
 * Form-driven status update — preserved for the legacy
 * /employer/applications/[id] StatusControls form. Accepts a stage
 * **kind** (text), resolves it to the DSO's default stage row, and
 * delegates to moveApplicationStage.
 */
export async function updateApplicationStatus(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("application_id") ?? "").trim();
  const next = String(formData.get("next_status") ?? "").trim();

  if (!id || !isStageKind(next)) {
    return { ok: false, error: "Invalid status transition." };
  }

  const result = await moveApplicationStage(id, { kind: next });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, message: `Marked as ${KIND_DEFAULT_LABELS[next]}.` };
}

interface ResolvedTarget {
  stageId: string;
  kind: StageKind;
}

/**
 * Resolve a {stageId} or {kind} target to a concrete stage_id + kind for
 * the application's owning DSO. Returns null when the target can't be
 * resolved (kind has no default row in the DSO, stage_id belongs to a
 * different DSO, etc.).
 */
async function resolveTargetStage(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  applicationId: string,
  target: { stageId: string } | { kind: StageKind }
): Promise<ResolvedTarget | null> {
  // Find the application's owning DSO via job_id.
  const { data: appLookup, error: appErr } = await supabase
    .from("applications")
    .select("id, job_id, jobs:jobs!inner(dso_id)")
    .eq("id", applicationId)
    .single();
  if (appErr || !appLookup) return null;

  const jobsRecord = (appLookup as Record<string, unknown>).jobs as
    | { dso_id: string }
    | Array<{ dso_id: string }>
    | null;
  const job = Array.isArray(jobsRecord) ? jobsRecord[0] ?? null : jobsRecord;
  const dsoId = job?.dso_id;
  if (!dsoId) return null;

  if ("stageId" in target) {
    const { data: row, error } = await supabase
      .from("dso_pipeline_stages")
      .select("id, kind, dso_id")
      .eq("id", target.stageId)
      .maybeSingle();
    if (error || !row) return null;
    if ((row as { dso_id: string }).dso_id !== dsoId) return null;
    const kindValue = (row as { kind: string }).kind;
    if (!isStageKind(kindValue)) return null;
    return { stageId: (row as { id: string }).id, kind: kindValue };
  }

  // Resolve by kind → DSO's default stage row of that kind.
  const { data: row, error } = await supabase
    .from("dso_pipeline_stages")
    .select("id, kind")
    .eq("dso_id", dsoId)
    .eq("kind", target.kind)
    .eq("is_default", true)
    .maybeSingle();
  if (error || !row) return null;
  return {
    stageId: (row as { id: string }).id,
    kind: target.kind,
  };
}

/**
 * Move an application to a new pipeline stage.
 *
 * Accepts either a concrete `stageId` (what the kanban knows) or a `kind`
 * (what the detail-page StageSelector and the reject/withdraw flows know).
 * Reads the prior stage_id + kind first so the caller can roll back
 * optimistically. RLS-denied updates return zero rows with no error from
 * PostgREST, so the empty-result case is treated as a failure.
 */
export async function moveApplicationStage(
  applicationId: string,
  target: { stageId: string } | { kind: StageKind }
): Promise<MoveApplicationStageResult> {
  if (!applicationId) {
    return { ok: false, error: "Missing application id." };
  }
  if ("kind" in target && !isStageKind(target.kind)) {
    return { ok: false, error: "Invalid stage kind." };
  }

  const supabase = await createSupabaseServerClient();

  const resolved = await resolveTargetStage(supabase, applicationId, target);
  if (!resolved) {
    console.warn(
      "[moveApplicationStage] resolveTargetStage returned null",
      { applicationId, target }
    );
    return { ok: false, error: "Stage not found for this DSO." };
  }

  // Read the application's current stage_id + the job's hide-stages flag
  // + dso_id (audit logging) + candidate name (audit summary) in one
  // round trip. The embedded stages relation gives us the kind snapshot
  // for the prior state without another query.
  const { data: prev, error: prevErr } = await supabase
    .from("applications")
    .select(
      "stage_id, candidate_id, " +
        "candidates:candidates(full_name), " +
        "jobs:jobs!inner(id, dso_id, hide_stages_from_candidate, title), " +
        "stage:dso_pipeline_stages!stage_id(kind)"
    )
    .eq("id", applicationId)
    .single();
  if (prevErr || !prev) {
    return { ok: false, error: prevErr?.message ?? "Application not found" };
  }

  const prevStageId = (prev as unknown as Record<string, unknown>).stage_id as string;
  const prevStageRel = (prev as unknown as Record<string, unknown>).stage as
    | { kind: string }
    | Array<{ kind: string }>
    | null;
  const prevStageRow = Array.isArray(prevStageRel)
    ? prevStageRel[0] ?? null
    : prevStageRel;
  const prevKindRaw = prevStageRow?.kind as string | undefined;
  const prevKind: StageKind = isStageKind(prevKindRaw)
    ? prevKindRaw
    : "open";

  const job = (prev as unknown as Record<string, unknown>).jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const jobRow = Array.isArray(job) ? job[0] ?? null : job;
  const hideStagesFromCandidate = Boolean(jobRow?.hide_stages_from_candidate);
  const dsoId = (jobRow?.dso_id as string | null) ?? null;
  const jobTitle = (jobRow?.title as string | null) ?? "the job";
  const candidateRecord = (prev as unknown as Record<string, unknown>).candidates as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const candidateRow = Array.isArray(candidateRecord)
    ? candidateRecord[0] ?? null
    : candidateRecord;
  const candidateName =
    (candidateRow?.full_name as string | null) ?? "(unnamed candidate)";

  // No-op short-circuit. Return ok with the same stage_id rather than
  // firing an update — keeps the kanban's optimistic state honest.
  if (prevStageId === resolved.stageId) {
    const nowIso = new Date().toISOString();
    return {
      ok: true,
      prevStageId,
      nextStageId: resolved.stageId,
      prevKind,
      nextKind: resolved.kind,
      stageEnteredAt: nowIso,
    };
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ stage_id: resolved.stageId })
    .eq("id", applicationId)
    .select("id, stage_id, stage_entered_at")
    .single();

  // RLS-denied updates return 0 rows with no error. Treat as failure.
  if (error || !data) {
    console.warn("[moveApplicationStage] update returned no row", {
      applicationId,
      stageId: resolved.stageId,
      kind: resolved.kind,
      pgError: error,
    });
    return {
      ok: false,
      error: error?.message ?? "Update denied or row not found",
    };
  }

  // Drop a system message into the candidate's inbox thread + fire the
  // candidate.stage_changed email. Both skip when stages are hidden from
  // the candidate per the employer's setting. Fire-and-forget — never
  // block the stage move on a dispatch failure.
  if (!hideStagesFromCandidate && prevKind !== resolved.kind) {
    const fromLabel = KIND_DEFAULT_LABELS[prevKind] ?? prevKind;
    const toLabel = KIND_DEFAULT_LABELS[resolved.kind] ?? resolved.kind;
    void dispatchInboxSystemMessage({
      applicationId,
      eventKind: "stage_changed",
      senderRole: "employer",
      body: `Your application moved from ${fromLabel} to ${toLabel}.`,
    });
    if (dsoId) {
      const candidateId = (prev as unknown as Record<string, unknown>)
        .candidate_id as string | null;
      if (candidateId) {
        void dispatchStageChangedEmail({
          applicationId,
          candidateId,
          jobId: (jobRow?.id as string | undefined) ?? "",
          jobTitle,
          dsoId,
          fromStageLabel: fromLabel,
          toStageLabel: toLabel,
        });
      }
    }
  }

  // Audit log (Phase 4.5.e). Fire-and-forget.
  if (dsoId && prevKind !== resolved.kind) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const fromLabel = KIND_DEFAULT_LABELS[prevKind] ?? prevKind;
      const toLabel = KIND_DEFAULT_LABELS[resolved.kind] ?? resolved.kind;
      void recordAuditEvent({
        dsoId,
        actorUserId: user.id,
        eventKind: "application.stage_moved",
        targetTable: "applications",
        targetId: applicationId,
        summary: `Moved ${candidateName}'s application for ${jobTitle} from ${fromLabel} to ${toLabel}`,
        metadata: {
          application_id: applicationId,
          from_stage_kind: prevKind,
          to_stage_kind: resolved.kind,
          from_stage_id: prevStageId,
          to_stage_id: resolved.stageId,
          candidate_name: candidateName,
          job_title: jobTitle,
        },
      });
    }
  }

  revalidatePath(`/employer/applications`);
  revalidatePath(`/employer/applications/${applicationId}`);
  revalidateTag(`applications:${applicationId}`, "max");

  return {
    ok: true,
    prevStageId,
    nextStageId: data.stage_id as string,
    prevKind,
    nextKind: resolved.kind,
    stageEnteredAt: data.stage_entered_at as string,
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
