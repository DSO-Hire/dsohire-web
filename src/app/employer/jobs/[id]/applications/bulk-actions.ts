"use server";

/**
 * Bulk actions for the kanban board — Phase 5A first-sprint Day 6.
 *
 * The single-row `moveApplicationStage` action in
 * `/employer/applications/[id]/actions.ts` is the canonical mutation. Bulk
 * actions could in theory issue a single multi-row UPDATE, but two issues:
 *
 *  1. RLS-denied UPDATEs return zero rows with NO error from PostgREST. A
 *     batched UPDATE that touches 10 rows where 2 are denied would return 8
 *     rows of "success" and silently swallow the 2 failures — the kanban UI
 *     could never show partial-success feedback.
 *  2. The previous stage (needed for optimistic rollback + audit copy) is a
 *     per-row value. We'd have to read all 10 first, batch-update, then diff
 *     the returned rows against the read rows. Simpler to loop.
 *
 * So we run the same single-row flow per id, sequentially. Sequential is
 * deliberate: it keeps the optimistic UI steady, gives a stable pendingMoves
 * ledger ordering, and avoids hammering the connection. Latency at our scale
 * (≤25 cards selected at once on the most generous tier) is fine.
 *
 * Reject + Archive both attach a recruiter-supplied note to the audit log
 * via `application_status_events`. RLS only grants SELECT on that table to
 * DSO members, so we patch the trigger-seeded row's `note` column using
 * the service-role client AFTER the trigger has run. The shared patch
 * helper lives at `@/lib/applications/status-event-notes`.
 *
 * Post-Track-B (2026-05-12): applications.status is gone — every mutation
 * now writes applications.stage_id (FK to dso_pipeline_stages). The bulk
 * API still accepts a target `kind` from the caller (the kanban's
 * SelectionToolbar / BulkConfirmDialog) and resolves it to the DSO's
 * default stage row server-side, since the kanban already knows which
 * column the user clicked but not which DSO it belongs to (all cards on
 * one board share a DSO, but we resolve defensively per call).
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachStatusEventNote } from "@/lib/applications/status-event-notes";
import {
  KIND_DEFAULT_LABELS,
  STAGE_KINDS,
  type StageKind,
} from "@/lib/applications/stages";
import { recordAuditEvent } from "@/lib/audit/record";

const VALID_KINDS = new Set<StageKind>(STAGE_KINDS);

export interface BulkItemSuccess {
  id: string;
  prevStageId: string;
  nextStageId: string;
  prevKind: StageKind;
  nextKind: StageKind;
  stageEnteredAt: string;
}

export interface BulkItemFailure {
  id: string;
  error: string;
}

export interface BulkActionResult {
  succeeded: BulkItemSuccess[];
  failed: BulkItemFailure[];
}

/**
 * Hard cap on how many ids a single bulk call can touch. Caps the worst-case
 * RTT for a sequential loop and matches the largest plausible selection on a
 * Growth-tier board. The UI also limits selection to visible cards so this
 * is a defense-in-depth ceiling.
 */
const BULK_CAP = 200;

async function moveOne(
  applicationId: string,
  nextStageId: string,
  nextKind: StageKind
): Promise<
  | { ok: true; row: BulkItemSuccess }
  | { ok: false; error: string }
> {
  if (!applicationId) return { ok: false, error: "Missing application id" };

  const supabase = await createSupabaseServerClient();

  // Read the current stage_id + kind so we can return prev info for
  // rollback. Embed the stage row to grab the kind in one round trip.
  const { data: prev, error: prevErr } = await supabase
    .from("applications")
    .select(
      "stage_id, stage:dso_pipeline_stages!stage_id(kind)"
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
  const prevKindRaw = (prevStageRow?.kind as string | undefined) ?? "open";
  const prevKind = (VALID_KINDS.has(prevKindRaw as StageKind)
    ? (prevKindRaw as StageKind)
    : "open") as StageKind;

  // No-op short-circuit. Fast path so the UI can show "0 changed, 10
  // already in stage" rather than failing loudly.
  if (prevStageId === nextStageId) {
    return {
      ok: true,
      row: {
        id: applicationId,
        prevStageId,
        nextStageId,
        prevKind,
        nextKind,
        stageEnteredAt: new Date().toISOString(),
      },
    };
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ stage_id: nextStageId })
    .eq("id", applicationId)
    .select("id, stage_id, stage_entered_at")
    .single();

  // RLS-denied updates return 0 rows with NO error from PostgREST. Surfacing
  // the empty-row case as an explicit failure is the entire reason we can't
  // batch into a single UPDATE statement.
  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Update denied or row not found",
    };
  }

  return {
    ok: true,
    row: {
      id: applicationId,
      prevStageId,
      nextStageId: data.stage_id as string,
      prevKind,
      nextKind,
      stageEnteredAt: data.stage_entered_at as string,
    },
  };
}

/**
 * Resolve a target stage **kind** to the concrete stage_id within a given
 * DSO. Used as the entry point for kind-driven bulk calls (the kanban
 * passes kinds, not stage_ids, since the bulk dropdown is keyed by kind).
 * Returns null when the DSO is missing its default stage for that kind
 * (shouldn't happen — the seeder creates all 7).
 */
async function resolveDefaultStageId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  dsoId: string,
  kind: StageKind
): Promise<string | null> {
  const { data, error } = await supabase
    .from("dso_pipeline_stages")
    .select("id")
    .eq("dso_id", dsoId)
    .eq("kind", kind)
    .eq("is_default", true)
    .maybeSingle();
  if (error) {
    console.warn(
      `[bulk-actions] could not resolve default ${kind} stage for ${dsoId}:`,
      error.message
    );
    return null;
  }
  return ((data as { id: string } | null)?.id as string | null) ?? null;
}

export async function bulkMoveApplications(
  applicationIds: string[],
  nextKind: StageKind
): Promise<BulkActionResult> {
  return bulkMoveApplicationsImpl(applicationIds, nextKind, "move");
}

/**
 * Internal worker. The exported `bulkMoveApplications` calls this with
 * `action: "move"`; the reject/archive wrappers call it with their own
 * label so the audit summary reads correctly. Reason note is passed
 * through to the audit metadata.
 */
async function bulkMoveApplicationsImpl(
  applicationIds: string[],
  nextKind: StageKind,
  action: "move" | "reject" | "archive",
  reason?: string
): Promise<BulkActionResult> {
  if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
    return { succeeded: [], failed: [] };
  }
  if (applicationIds.length > BULK_CAP) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: `Selection exceeds ${BULK_CAP}-row limit`,
      })),
    };
  }
  if (!VALID_KINDS.has(nextKind)) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "Invalid target stage kind",
      })),
    };
  }

  const supabase = await createSupabaseServerClient();

  // Resolve the DSO from the first application's job, then resolve the
  // default stage row for the requested kind. All selected ids belong to
  // the same DSO because kanban selection is scoped per-job.
  const { data: anchor } = await supabase
    .from("applications")
    .select("id, jobs:jobs!inner(dso_id)")
    .eq("id", applicationIds[0])
    .single();
  const jobsRecord = (anchor as Record<string, unknown> | null)?.jobs as
    | { dso_id: string }
    | Array<{ dso_id: string }>
    | null;
  const job = Array.isArray(jobsRecord) ? jobsRecord[0] ?? null : jobsRecord;
  const dsoId = job?.dso_id ?? null;
  if (!dsoId) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "Could not resolve DSO for selection",
      })),
    };
  }

  const nextStageId = await resolveDefaultStageId(supabase, dsoId, nextKind);
  if (!nextStageId) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: `No default ${nextKind} stage on this DSO`,
      })),
    };
  }

  const succeeded: BulkItemSuccess[] = [];
  const failed: BulkItemFailure[] = [];

  // Sequential loop: see file-level comment for rationale.
  for (const id of applicationIds) {
    const result = await moveOne(id, nextStageId, nextKind);
    if (result.ok) {
      succeeded.push(result.row);
      revalidatePath(`/employer/applications/${id}`);
      revalidateTag(`applications:${id}`, "max");
    } else {
      failed.push({ id, error: result.error });
    }
  }

  if (succeeded.length > 0) {
    revalidatePath(`/employer/applications`);
  }

  if (succeeded.length > 0) {
    await emitBulkAuditSummary({
      action,
      nextKind,
      succeededIds: succeeded.map((s) => s.id),
      failedCount: failed.length,
      reason,
    });
  }

  return { succeeded, failed };
}

/**
 * Single audit emit for a bulk operation. Resolves dso_id by reading any
 * one of the just-mutated applications (they're all in the same DSO since
 * RLS scopes them). Fail-open per the audit-log contract — summary
 * failure must not affect the parent bulk op.
 */
async function emitBulkAuditSummary(input: {
  action: "move" | "reject" | "archive";
  nextKind: StageKind;
  succeededIds: string[];
  failedCount: number;
  reason?: string;
}): Promise<void> {
  if (input.succeededIds.length === 0) return;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: anchor } = await supabase
    .from("applications")
    .select("job_id, jobs:jobs!inner(id, dso_id, title)")
    .eq("id", input.succeededIds[0])
    .single();
  if (!anchor) return;
  // Supabase !inner returns arrays at runtime even for to-one FKs.
  const jobsRecord = (anchor as Record<string, unknown>).jobs as
    | { id: string; dso_id: string; title: string | null }
    | Array<{ id: string; dso_id: string; title: string | null }>
    | null;
  const job = Array.isArray(jobsRecord) ? jobsRecord[0] ?? null : jobsRecord;
  if (!job?.dso_id) return;

  const stageLabel = KIND_DEFAULT_LABELS[input.nextKind] ?? input.nextKind;
  const count = input.succeededIds.length;
  const verb =
    input.action === "reject"
      ? "Rejected"
      : input.action === "archive"
        ? "Archived"
        : "Moved";
  const candidateNoun = count === 1 ? "candidate" : "candidates";
  const summary =
    input.action === "move"
      ? `${verb} ${count} ${candidateNoun} to ${stageLabel}`
      : `${verb} ${count} ${candidateNoun}`;

  await recordAuditEvent({
    dsoId: job.dso_id,
    actorUserId: user.id,
    eventKind: "bulk_action.applied",
    targetTable: "jobs",
    targetId: job.id,
    summary:
      input.failedCount > 0
        ? `${summary} (${input.failedCount} failed)`
        : summary,
    metadata: {
      action: input.action,
      next_stage_kind: input.nextKind,
      job_id: job.id,
      job_title: job.title,
      succeeded_count: count,
      failed_count: input.failedCount,
      application_ids: input.succeededIds,
      ...(input.reason ? { reason: input.reason } : {}),
    },
  });
}

/**
 * Bulk-reject + attach recruiter reason to the audit log.
 *
 * Flow per id:
 *   1. moveOne(id, rejectedStageId, 'rejected') — fires the AFTER-UPDATE
 *      trigger which seeds a status_events row with note=null and
 *      actor_type='employer'.
 *   2. If reason is non-empty, locate the just-seeded event row (the
 *      most recent event for this application with to_stage_kind=
 *      'rejected') and patch `note` via the service-role client.
 */
export async function bulkRejectApplications(
  applicationIds: string[],
  reason: string
): Promise<BulkActionResult> {
  const trimmedReason = (reason ?? "").trim().slice(0, 1000);
  const result = await bulkMoveApplicationsImpl(
    applicationIds,
    "rejected",
    "reject",
    trimmedReason || undefined
  );

  if (trimmedReason && result.succeeded.length > 0) {
    await attachStatusEventNote({
      applicationIds: result.succeeded.map((r) => r.id),
      toKind: "rejected",
      note: trimmedReason,
    });
  }

  return result;
}

/**
 * Bulk-archive — set stage to a `withdrawn`-kind row. Recruiter-driven
 * archive is a real surface even though `withdrawn` is conventionally
 * candidate-side; the status_event's actor_type is derived from
 * auth.uid() so a recruiter-driven withdraw is still logged as
 * 'employer'.
 */
export async function bulkArchiveApplications(
  applicationIds: string[],
  reason: string
): Promise<BulkActionResult> {
  const trimmedReason = (reason ?? "").trim().slice(0, 1000);
  const result = await bulkMoveApplicationsImpl(
    applicationIds,
    "withdrawn",
    "archive",
    trimmedReason || undefined
  );

  if (trimmedReason && result.succeeded.length > 0) {
    await attachStatusEventNote({
      applicationIds: result.succeeded.map((r) => r.id),
      toKind: "withdrawn",
      note: trimmedReason,
    });
  }

  return result;
}
