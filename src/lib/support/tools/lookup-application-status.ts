/**
 * Tool: lookup_application_status
 *
 * Returns the status + recent history of one application by id.
 * Scope: only applications on jobs belonging to the caller's DSO.
 *
 * Use case: "Why is Sarah still in 'New'?" / "When did Jordan move to
 * Interview?" / "What stage is Application 1234 on?"
 */

import type { ToolHandler } from "./types";

export const lookupApplicationStatus: ToolHandler = {
  schema: {
    name: "lookup_application_status",
    description:
      "Returns the current pipeline stage + last few status changes for one application. Use when the user asks about a specific application by id or references one of their candidates by name and you need to verify state.",
    input_schema: {
      type: "object",
      properties: {
        application_id: {
          type: "string",
          description: "UUID of the application to look up.",
        },
      },
      required: ["application_id"],
    },
  },
  async run(input, ctx) {
    const id = String(input.application_id ?? "").trim();
    if (!id) return { error: "application_id is required." };
    if (!ctx.dsoId) {
      return { error: "Only signed-in DSO members can look up applications." };
    }

    // RLS-scoped read: applications RLS only returns rows on jobs the
    // caller's DSO owns, so we don't have to filter by dso_id here.
    const { data: app, error } = await ctx.supabase
      .from("applications")
      .select(
        "id, job_id, candidate_id, stage_id, created_at, updated_at, stage_entered_at"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!app) {
      return {
        error:
          "Application not found, or it's not on a job belonging to your DSO.",
      };
    }

    // Pull the recent stage history.
    const { data: events } = await ctx.supabase
      .from("application_status_events")
      .select(
        "from_stage_kind, to_stage_kind, from_stage_label, to_stage_label, actor_type, created_at"
      )
      .eq("application_id", id)
      .order("created_at", { ascending: false })
      .limit(8);

    return {
      application: app,
      recent_status_changes: events ?? [],
    };
  },
};
