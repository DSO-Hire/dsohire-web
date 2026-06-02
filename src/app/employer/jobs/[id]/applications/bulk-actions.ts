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
import { after } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { attachStatusEventNote } from "@/lib/applications/status-event-notes";
import {
  KIND_DEFAULT_LABELS,
  STAGE_KINDS,
  type StageKind,
} from "@/lib/applications/stages";
import { recordAuditEvent } from "@/lib/audit/record";
import { dispatchInboxSystemMessage } from "@/lib/inbox/dispatch-system";
import { runAutomationsForEvent } from "@/lib/automations/engine";

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
  nextKind: StageKind,
  nextStageLabel: string
): Promise<
  | { ok: true; row: BulkItemSuccess }
  | { ok: false; error: string }
> {
  if (!applicationId) return { ok: false, error: "Missing application id" };

  const supabase = await createSupabaseServerClient();

  // Read the current stage_id + kind + label so we can return prev info for
  // rollback AND build candidate-facing dispatch copy with the actual user-
  // visible stage labels (not the kind's default label — those collapse
  // when a DSO has multiple stages of the same kind, e.g. "Phone Screening"
  // and "Interview" both kind=interview).
  //
  // Also pull the bits needed to fire stage_changed dispatches (candidate
  // id, job hide-stages flag, dso_id, job title/id) so we don't need a
  // second round trip after the update lands.
  const { data: prev, error: prevErr } = await supabase
    .from("applications")
    .select(
      "stage_id, candidate_id, " +
        "jobs:jobs!inner(id, dso_id, hide_stages_from_candidate, title), " +
        "stage:dso_pipeline_stages!stage_id(kind, label)"
    )
    .eq("id", applicationId)
    .single();
  if (prevErr || !prev) {
    return { ok: false, error: prevErr?.message ?? "Application not found" };
  }

  const prevStageId = (prev as unknown as Record<string, unknown>).stage_id as string;
  const prevStageRel = (prev as unknown as Record<string, unknown>).stage as
    | { kind: string; label: string }
    | Array<{ kind: string; label: string }>
    | null;
  const prevStageRow = Array.isArray(prevStageRel)
    ? prevStageRel[0] ?? null
    : prevStageRel;
  const prevKindRaw = (prevStageRow?.kind as string | undefined) ?? "open";
  const prevKind = (VALID_KINDS.has(prevKindRaw as StageKind)
    ? (prevKindRaw as StageKind)
    : "open") as StageKind;
  const prevStageLabel =
    (prevStageRow?.label as string | undefined) ??
    KIND_DEFAULT_LABELS[prevKind] ??
    prevKind;

  // Pull dispatch-context fields off the embedded relations. Supabase
  // !inner returns arrays at runtime even for to-one FKs, so peel
  // defensively (same pattern as the single-move path).
  const candidateId = (prev as unknown as Record<string, unknown>)
    .candidate_id as string | null;
  const jobsRel = (prev as unknown as Record<string, unknown>).jobs as
    | Record<string, unknown>
    | Array<Record<string, unknown>>
    | null;
  const jobRow = Array.isArray(jobsRel) ? jobsRel[0] ?? null : jobsRel;
  const dsoId = (jobRow?.dso_id as string | null) ?? null;
  const jobId = (jobRow?.id as string | null) ?? null;
  const jobTitle = (jobRow?.title as string | null) ?? "the job";
  const hideStagesFromCandidate = Boolean(
    jobRow?.hide_stages_from_candidate
  );

  // No-op short-circuit. Fast path so the UI can show "0 changed, 10
  // already in stage" rather than failing loudly. No dispatch — same stage.
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

  // Fire the same dispatches the single-move path fires: inbox system
  // message + candidate.stage_changed email. Gate on the job's
  // hide-stages flag only. (Closes the pre-existing gap flagged in
  // project_custom_email_templates_v1.md — bulk moves previously
  // skipped these dispatches entirely.)
  //
  // Why no kind-change check: the candidate-facing copy renders the
  // FROM_LABEL / TO_LABEL pair (e.g. "Interview → Phone Screening")
  // and a DSO can have multiple stages of the same kind. The original
  // `prevKind !== nextKind` gate dropped emails on every intra-kind
  // move, even when the user-visible stage label changed. We only
  // reach this code when prevStageId !== nextStageId (no-op short-
  // circuit returned early above), so any move that gets here is a
  // real user-visible move and deserves the dispatch.
  //
  // Use next/after() instead of `void` so the dispatches run AFTER the
  // bulk response ships but are still guaranteed to complete on Vercel
  // — per feedback_vercel_serverless_fire_and_forget.md, bare `void` in
  // serverless gets killed mid-flight. after() callbacks are honored.
  // N13: route candidate-facing stage-change dispatch through the
  // automation rules engine (same as the single-move path). The seeded
  // `is_system` default rule reproduces the former two dispatches 1:1,
  // including the hideStagesFromCandidate suppression. See
  // Business Plan & Strategy/N13_Automation_Rules_Engine_Design_2026-06-02.md.
  if (dsoId) {
    const triggerEventKey = `stage_changed:${applicationId}:${prevStageId}->${nextStageId}:${new Date().toISOString()}`;
    after(async () => {
      await runAutomationsForEvent({
        trigger: "application.stage_changed",
        applicationId,
        dsoId,
        candidateId,
        jobId: jobId ?? "",
        jobTitle,
        fromStageLabel: prevStageLabel,
        toStageLabel: nextStageLabel,
        fromKind: prevKind,
        toKind: nextKind,
        hideStagesFromCandidate,
        triggerEventKey,
      });
    });
  } else if (!hideStagesFromCandidate) {
    // Pathological dsoId-null edge: preserve pre-N13 inbox-only behavior.
    after(async () => {
      await dispatchInboxSystemMessage({
        applicationId,
        eventKind: "stage_changed",
        senderRole: "employer",
        body: `Your application moved from ${prevStageLabel} to ${nextStageLabel}.`,
      });
    });
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

/**
 * Move N applications to a specific stage by **stage_id**.
 *
 * Pre-fix this took `nextKind` and resolved to the DSO's default stage of
 * that kind via `resolveDefaultStageId`. That broke whenever a DSO had
 * more than one stage sharing a kind (e.g. a custom "Phone Screening"
 * column alongside the default "Interview" column — both kind=interview).
 * The user's clicked column was silently ignored; the move resolved to
 * the default for the kind, which often equaled the source stage and
 * silently no-op'd into a bounce-back. Diagnosed Day 22 via DB
 * `updated_at` showing no row was mutated despite a success toast.
 *
 * The kind is still needed for: (a) inbox/email dispatch gating on
 * kind change, (b) audit-summary labels. We resolve it from the
 * stage row server-side after validating the stage belongs to the
 * application's DSO.
 */
export async function bulkMoveApplications(
  applicationIds: string[],
  nextStageId: string
): Promise<BulkActionResult> {
  return bulkMoveApplicationsImpl(applicationIds, { stageId: nextStageId }, "move");
}

/**
 * Internal worker. The exported `bulkMoveApplications` calls this with
 * `action: "move"` + an explicit stageId; reject/archive wrappers pass
 * a kind so the resolver still picks the DSO's default rejected /
 * withdrawn stage. Reason note is passed through to the audit metadata.
 */
type BulkTarget = { stageId: string } | { kind: StageKind };

async function bulkMoveApplicationsImpl(
  applicationIds: string[],
  target: BulkTarget,
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
  if ("kind" in target && !VALID_KINDS.has(target.kind)) {
    return {
      succeeded: [],
      failed: applicationIds.map((id) => ({
        id,
        error: "Invalid target stage kind",
      })),
    };
  }

  const supabase = await createSupabaseServerClient();

  // Resolve the DSO from the first application's job. All selected ids
  // belong to the same DSO because kanban selection is scoped per-job.
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

  // Resolve the concrete nextStageId + nextKind + nextStageLabel from
  // the target. For explicit stageId moves (kanban bulk dropdown / drag-
  // drop bulk) we validate the stage belongs to the DSO and read its
  // kind + label from the stage row — never collapse to a default. For
  // kind-driven calls (reject / archive) we still resolve to the DSO's
  // default stage of the requested kind.
  let nextStageId: string;
  let nextKind: StageKind;
  let nextStageLabel: string;
  if ("stageId" in target) {
    const { data: stageRow, error: stageErr } = await supabase
      .from("dso_pipeline_stages")
      .select("id, kind, label, dso_id")
      .eq("id", target.stageId)
      .maybeSingle();
    if (stageErr || !stageRow) {
      return {
        succeeded: [],
        failed: applicationIds.map((id) => ({
          id,
          error: "Target stage not found",
        })),
      };
    }
    if ((stageRow as { dso_id: string }).dso_id !== dsoId) {
      return {
        succeeded: [],
        failed: applicationIds.map((id) => ({
          id,
          error: "Target stage does not belong to this DSO",
        })),
      };
    }
    const kindRaw = (stageRow as { kind: string }).kind;
    if (!VALID_KINDS.has(kindRaw as StageKind)) {
      return {
        succeeded: [],
        failed: applicationIds.map((id) => ({
          id,
          error: `Target stage has unknown kind "${kindRaw}"`,
        })),
      };
    }
    nextStageId = (stageRow as { id: string }).id;
    nextKind = kindRaw as StageKind;
    nextStageLabel =
      (stageRow as { label: string }).label ??
      KIND_DEFAULT_LABELS[nextKind] ??
      nextKind;
  } else {
    const resolved = await resolveDefaultStageId(supabase, dsoId, target.kind);
    if (!resolved) {
      return {
        succeeded: [],
        failed: applicationIds.map((id) => ({
          id,
          error: `No default ${target.kind} stage on this DSO`,
        })),
      };
    }
    nextStageId = resolved;
    nextKind = target.kind;
    // For kind-driven (reject/archive) paths we don't have the row in
    // hand. Look up the label so candidate-facing copy uses the actual
    // stage name the DSO configured (which might be "Did not advance"
    // rather than the kind default "Rejected").
    const { data: labelRow } = await supabase
      .from("dso_pipeline_stages")
      .select("label")
      .eq("id", nextStageId)
      .maybeSingle();
    nextStageLabel =
      ((labelRow as { label: string } | null)?.label as string | undefined) ??
      KIND_DEFAULT_LABELS[nextKind] ??
      nextKind;
  }

  const succeeded: BulkItemSuccess[] = [];
  const failed: BulkItemFailure[] = [];

  // Sequential loop: see file-level comment for rationale.
  for (const id of applicationIds) {
    const result = await moveOne(id, nextStageId, nextKind, nextStageLabel);
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
      nextStageLabel,
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
  /** Actual stage label (e.g. "Phone Screening" or DSO-customized
   * "Did not advance") rather than the kind default. Keeps the audit
   * trail human-readable when DSOs rename or duplicate stages. */
  nextStageLabel: string;
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

  const stageLabel = input.nextStageLabel;
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
    { kind: "rejected" },
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
    { kind: "withdrawn" },
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
