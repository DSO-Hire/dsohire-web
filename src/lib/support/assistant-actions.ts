"use server";

/**
 * commitAssistantAction — the ONE server-side choke point for assistant
 * draft-actions (Lane 8 Assistant 2.0, Commit 4).
 *
 * The assistant only ever DRAFTS (via the read-only propose_action tool).
 * Nothing mutates until a human clicks "Commit" in the support drawer,
 * which calls this. It re-validates the allowlist and dispatches to the
 * EXISTING guarded server actions — each of which re-checks capability +
 * RLS itself. So this adds no new privilege: committing here is identical
 * to clicking the corresponding button in the app. "Drafts, never
 * executes" holds at the architecture level.
 */

import { moveApplicationStage } from "@/app/employer/applications/[id]/actions";
import { assignApplication } from "@/app/employer/applications/[id]/assign-actions";
import { createApplicationComment } from "@/app/employer/applications/[id]/comments-actions";
import { STAGE_KINDS, type StageKind } from "@/lib/applications/stages";

export type CommitActionInput =
  | { action: "move_stage"; applicationId: string; stageKind: string }
  | { action: "add_internal_note"; applicationId: string; note: string }
  | {
      action: "assign_application";
      applicationId: string;
      assigneeDsoUserId: string;
    };

export type CommitActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const UUID_RE = /^[0-9a-fA-F-]{16,}$/;

export async function commitAssistantAction(
  input: CommitActionInput
): Promise<CommitActionResult> {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Nothing to commit." };
  }
  const applicationId = String(input.applicationId ?? "").trim();
  if (!UUID_RE.test(applicationId)) {
    return { ok: false, error: "Missing application." };
  }

  switch (input.action) {
    case "move_stage": {
      const kind = String(input.stageKind ?? "").trim();
      if (!STAGE_KINDS.includes(kind as StageKind)) {
        return { ok: false, error: "Invalid stage." };
      }
      // {kind} → moveApplicationStage resolves the DSO's default stage of
      // that kind, and re-checks apps.move_stage / apps.reject itself.
      const res = await moveApplicationStage(applicationId, {
        kind: kind as StageKind,
      });
      return res.ok
        ? { ok: true, message: "Moved." }
        : { ok: false, error: res.error };
    }

    case "add_internal_note": {
      const note = String(input.note ?? "").trim();
      if (note.length < 1) return { ok: false, error: "The note is empty." };
      const res = await createApplicationComment({
        applicationId,
        body: note,
        mentionedUserIds: [],
      });
      return res.ok
        ? { ok: true, message: "Note added." }
        : { ok: false, error: res.error };
    }

    case "assign_application": {
      const assignee = String(input.assigneeDsoUserId ?? "").trim();
      if (!UUID_RE.test(assignee)) {
        return { ok: false, error: "Missing teammate." };
      }
      const res = await assignApplication(applicationId, assignee);
      return res.ok
        ? { ok: true, message: "Assigned." }
        : { ok: false, error: res.error };
    }

    default:
      return { ok: false, error: "Unknown action." };
  }
}
