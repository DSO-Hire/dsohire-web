/**
 * Tool: propose_action  (Lane 8 Assistant 2.0 — Commit 4, the P0 piece)
 *
 * DRAFTS an action for the user to one-click confirm. This tool is
 * STRICTLY READ-ONLY: it validates feasibility, resolves params against
 * the real record (under RLS), and PRE-CHECKS the caller's capability so
 * we only ever draft something they could actually commit. It NEVER
 * mutates — the mutation happens only when the human clicks "Commit" in
 * the drawer, which routes through commitAssistantAction → the existing
 * guarded server action. Allowlist: move_stage · add_internal_note ·
 * assign_application.
 */

import type { ServerClient, ToolHandler } from "./types";
import { capabilityBlockError } from "@/lib/permissions/guard";
import { KIND_DEFAULT_LABELS, type StageKind } from "@/lib/applications/stages";

const UUID_RE = /^[0-9a-fA-F-]{16,}$/;

/** Map a free-text stage name to a system StageKind. null = unmappable. */
function toStageKind(raw: string): StageKind | null {
  const s = raw.toLowerCase();
  if (/(reject|declin|pass\b|no)/.test(s)) return "rejected";
  if (/withdraw/.test(s)) return "withdrawn";
  if (/hire|hired/.test(s)) return "hired";
  if (/offer/.test(s)) return "offer";
  if (/interview|onsite|working interview/.test(s)) return "interview";
  if (/screen/.test(s)) return "screen";
  if (/open|new|applied|applicant/.test(s)) return "open";
  return null;
}

async function candidateName(
  supabase: ServerClient,
  candidateId: string | null
): Promise<string> {
  if (!candidateId) return "this candidate";
  const { data } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", candidateId)
    .maybeSingle();
  return (data?.full_name as string | null)?.trim() || "this candidate";
}

export const proposeAction: ToolHandler = {
  schema: {
    name: "propose_action",
    description:
      "Draft an action for the user to confirm with one click. You NEVER execute it — the user clicks Commit, which runs through the same permission checks as the in-app buttons. Use when the user asks you to DO something to an application from this allowlist: 'move_stage' (move an application to a pipeline stage), 'add_internal_note' (leave a private team note on an application), 'assign_application' (assign it to a teammate). Use the focused application's id. For anything outside these three, do NOT use this tool — explain how to do it or offer a deep link.",
    input_schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "One of: move_stage, add_internal_note, assign_application.",
        },
        application_id: {
          type: "string",
          description: "UUID of the application to act on (use the focused id).",
        },
        target_stage: {
          type: "string",
          description:
            "For move_stage: the destination stage, e.g. 'Interview', 'Screening', 'Offer', 'Hired', 'Rejected'.",
        },
        note: {
          type: "string",
          description: "For add_internal_note: the note text (team-only).",
        },
        assignee: {
          type: "string",
          description:
            "For assign_application: the teammate's name, or 'me' to self-assign.",
        },
      },
      required: ["action", "application_id"],
    },
  },
  async run(input, ctx) {
    if (!ctx.dsoId) {
      return { error: "Actions are only available to DSO team members." };
    }
    const action = String(input.action ?? "").trim();
    const applicationId = String(input.application_id ?? "").trim();
    if (!UUID_RE.test(applicationId)) {
      return { error: "A valid application id is required." };
    }

    // Verify the application is visible to this DSO (RLS) + grab refs.
    const { data: app } = await ctx.supabase
      .from("applications")
      .select("id, candidate_id, job_id")
      .eq("id", applicationId)
      .maybeSingle();
    if (!app) {
      return { error: "That application isn't on a job your DSO can access." };
    }
    const name = await candidateName(ctx.supabase, app.candidate_id as string | null);

    // ── move_stage ──
    if (action === "move_stage") {
      const targetRaw = String(input.target_stage ?? "").trim();
      if (!targetRaw) {
        return { error: "Tell me which stage to move them to." };
      }
      const kind = toStageKind(targetRaw);
      if (!kind) {
        return {
          error:
            "I couldn't match that to a stage. Try Screening, Interview, Offer, Hired, or Rejected.",
        };
      }
      const cap = kind === "rejected" ? "apps.reject" : "apps.move_stage";
      const block = await capabilityBlockError(ctx.supabase, cap);
      if (block) return { error: block };

      // Nice label for the summary — the DSO's own label for this kind.
      const { data: stageRow } = await ctx.supabase
        .from("dso_pipeline_stages")
        .select("label, is_default")
        .eq("dso_id", ctx.dsoId)
        .eq("kind", kind)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      const stageLabel =
        (stageRow?.label as string | null)?.trim() || KIND_DEFAULT_LABELS[kind];

      return {
        ok: true,
        action: "move_stage",
        applicationId,
        stageKind: kind,
        summary: `Move ${name} to ${stageLabel}`,
      };
    }

    // ── add_internal_note ──
    if (action === "add_internal_note") {
      const note = String(input.note ?? "").trim();
      if (note.length < 1) return { error: "What should the note say?" };
      if (note.length > 4000) {
        return { error: "That note is too long (4000 character max)." };
      }
      return {
        ok: true,
        action: "add_internal_note",
        applicationId,
        note,
        summary: `Add a private team note to ${name}'s application`,
      };
    }

    // ── assign_application ──
    if (action === "assign_application") {
      // Assignment is gated by RLS to owner/admin/recruiter; mirror that as
      // a pre-check so we don't draft something the user can't commit.
      const role = (ctx.role ?? "").toLowerCase();
      if (!["owner", "admin", "recruiter"].includes(role)) {
        return {
          error:
            "Your role can't reassign applications — an owner, admin, or recruiter can.",
        };
      }
      const who = String(input.assignee ?? "").trim();
      if (!who) return { error: "Who should I assign it to?" };

      if (who.toLowerCase() === "me" || who.toLowerCase() === "myself") {
        if (!ctx.dsoUserId) return { error: "Couldn't resolve your account." };
        return {
          ok: true,
          action: "assign_application",
          applicationId,
          assigneeDsoUserId: ctx.dsoUserId,
          summary: `Assign ${name}'s application to you`,
        };
      }

      const { data: mates } = await ctx.supabase
        .from("dso_users")
        .select("id, full_name")
        .eq("dso_id", ctx.dsoId)
        .ilike("full_name", `%${who}%`)
        .limit(5);
      const list = (mates ?? []) as Array<{ id: string; full_name: string | null }>;
      if (list.length === 0) {
        return { error: `I couldn't find a teammate matching "${who}".` };
      }
      if (list.length > 1) {
        const names = list.map((m) => m.full_name ?? "(unnamed)").join(", ");
        return {
          error: `That matched more than one teammate (${names}). Which one?`,
        };
      }
      const mate = list[0];
      return {
        ok: true,
        action: "assign_application",
        applicationId,
        assigneeDsoUserId: mate.id,
        summary: `Assign ${name}'s application to ${mate.full_name ?? "that teammate"}`,
      };
    }

    return { error: `Unknown action: ${action}` };
  },
};
