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
 *  2. The previous status (needed for optimistic rollback + audit copy) is a
 *     per-row value. We'd have to read all 10 first, batch-update, then diff
 *     the returned rows against the read rows. Simpler to loop.
 *
 * So we run the same single-row flow per id, sequentially. Sequential is
 * deliberate: it keeps the optimistic UI steady, gives a stable pendingMoves
 * ledger ordering, and avoids hammering the connection. Latency at our scale
 * (≤25 cards selected at once on the most generous tier) is fine.
 *
 * Reject + Archive both attach a recruiter-supplied note to the audit log via
 * `application_status_events`. RLS only grants SELECT on that table to DSO
 * members, so we patch the trigger-seeded row's `note` column using the
 * service-role client AFTER the trigger has run. The trigger lives in
 * 20260501000005_fix_application_triggers.sql (and 20260504000005_fix_status
 * _event_actor_type.sql) and inserts with note=null. The shared patch helper
 * lives at `@/lib/applications/status-event-notes` and is reused by the
 * single-reject path on the application detail StageSelector.
 *
 * Archive semantics: we set status to `withdrawn`. See the report — the
 * application_status enum is exhausted of "soft-close" semantics, withdrawn
 * is candidate-side conventionally but is the cleanest "remove from active
 * pipeline without rejecting" state we have. The status_event's actor_type
 * is now derived from auth.uid() (see 20260504000005_fix_status_event_actor
 * _type.sql) so a recruiter-driven withdraw is correctly logged as
 * 'employer' and a candidate-driven withdraw stays 'candidate'.
 */

import { revalidatePath, revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachStatusEventNote } from "@/lib/applications/status-event-notes";
import {
  STAGE_LABELS,
  type ApplicationStatus,
} from "@/lib/applications/stages";
import { recordAuditEvent } from "@/lib/audit/record";

const VALID_STATUSES = new Set<ApplicationStatus>([
  "new",
  "reviewed",
  "interviewing",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
]);

export interface BulkItemSuccess {
  id: string;
  prevStatus: ApplicationStatus;
  nextStatus: ApplicationStatus;
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
 * Growth-tier board (50 active jobs * average column size). The UI also
 * limits selection to visible cards so this is a defense-in-depth ceiling.
 */
const BULK_CAP = 200;

async function moveOne(
  applicationId: string,
  nextStatus: ApplicationStatus
): Promise<
  | { ok: true; row: BulkItemSuccess }
  | { ok: false; error: string }
> {
  if (!applicationId) return { ok: false, error: "Missing application id" };
  if (!VALID_STATUSES.has(nextStatus)) {
    return { ok: false, error: "Invalid status" };
  }

  const supabase = await createSupabaseServerClient();

  // Read the current status first so we can return prevStatus for rollback.
  const { data: prev, error: prevErr } = await supabase
    .from("applications")
    .select("status")
    .eq("id", applicationId)
    .single();
  if (prevErr || !prev) {
    return { ok: false, error: prevErr?.message ?? "Application not found" };
  }

  const prevStatus = prev.status as ApplicationStatus;

  // No-op short-circuit. Fast path so the UI can show "0 changed, 10 already
  // in stage" rather than failing loudly.
  if (prevStatus === nextStatus) {
    return {
      ok: true,
      row: {
        id: applicationId,
        prevStatus,
        nextStatus,
        stageEnteredAt: new Date().toISOString(),
      },
    };
  }

  const { data, error } = await supabase
    .from("applications")
    .update({ status: nextStatus })
    .eq("id", applicationId)
    .select("id, status, stage_entered_at")
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
      prevStatus,
      nextStatus: data.status as ApplicationStatus,
      stageEnteredAt: data.stage_entered_at,
    },
  };
}

export async function bulkMoveApplications(
  applicationIds: string[],
  nextStatus: ApplicationStatus
): Promise<BulkActionResult> {
  return bulkMoveApplicationsImpl(applicationIds, nextStatus, "move");
}

/**
 * Internal worker. The exported `bulkMoveApplications` calls this with
 * `action: "move"`; the reject/archive wrappers call it with their own
 * label so the audit summary reads correctly. Reason note is passed
 * through to the audit metadata.
 */
async function bulkMoveApplicationsImpl(
  applicationIds: string[],
  nextStatus: ApplicationStatus,
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
  if (!VALID_STATUSES.has(nextStatus)) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "Invalid target status",
      })),
    };
  }

  const succeeded: BulkItemSuccess[] = [];
  const failed: BulkItemFailure[] = [];

  // Sequential loop: see file-level comment for rationale.
  for (const id of applicationIds) {
    const result = await moveOne(id, nextStatus);
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

  // Audit-log a single summary event per bulk op (Phase 4.5.e completion).
  // Emitting per-application would 10× the audit volume on a typical bulk —
  // the summary line is the high-signal one. Per-app traceability lives in
  // application_status_events (already populated by the BEFORE-UPDATE trigger).
  if (succeeded.length > 0) {
    await emitBulkAuditSummary({
      action,
      nextStatus,
      succeededIds: succeeded.map((s) => s.id),
      failedCount: failed.length,
      reason,
    });
  }

  return { succeeded, failed };
}

/**
 * Single audit emit for a bulk operation. Resolves dso_id by reading any one
 * of the just-mutated applications (they're all in the same DSO since RLS
 * scopes them). Fail-open per the audit-log contract — summary failure must
 * not affect the parent bulk op.
 */
async function emitBulkAuditSummary(input: {
  action: "move" | "reject" | "archive";
  nextStatus: ApplicationStatus;
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

  // Pull the dso_id for one application — all bulk-selected items share a job
  // (the kanban scopes selection per-job), so any one row gives us the DSO.
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

  const stageLabel = STAGE_LABELS[input.nextStatus] ?? input.nextStatus;
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
      next_status: input.nextStatus,
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
 *   1. moveOne(id, 'rejected') — fires the BEFORE-UPDATE trigger which seeds
 *      a status_events row with note=null and actor_type='employer'.
 *   2. If reason is non-empty, locate the just-seeded event row (the most
 *      recent event for this application with from_status=prevStatus +
 *      to_status='rejected') and patch `note` via the service-role client.
 *      RLS forbids client-side INSERT/UPDATE on application_status_events,
 *      so service-role is the only path.
 *
 * If the note patch fails (e.g., race with another status change), the move
 * itself is still reported as succeeded — we don't want to roll the move back
 * because of an audit-trail blip. We DO log the patch failure so the kanban
 * console picks it up.
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
      toStatus: "rejected",
      note: trimmedReason,
    });
  }

  return result;
}

/**
 * Bulk-archive — set status to `withdrawn`. See file-level comment for the
 * "no dedicated archived enum yet" rationale; if/when product wants a true
 * "archived but not withdrawn" semantic we'd add an enum value + migration
 * and switch the target here. Recruiter-supplied note is optional but
 * encouraged so the audit log explains why a candidate was archived (no
 * candidate-facing impact since withdrawn already removes them from the
 * active pipeline view).
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
      toStatus: "withdrawn",
      note: trimmedReason,
    });
  }

  return result;
}
