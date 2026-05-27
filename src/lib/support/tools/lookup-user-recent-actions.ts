/**
 * Tool: lookup_user_recent_actions
 *
 * Returns the asking user's last N audit_events. Useful for "what just
 * happened" questions ("why didn't that work, I just clicked send").
 *
 * Scope: own actions only. The audit_events.actor_user_id filter is
 * the entire safety boundary.
 */

import type { ToolHandler } from "./types";

export const lookupUserRecentActions: ToolHandler = {
  schema: {
    name: "lookup_user_recent_actions",
    description:
      "Returns the last N actions the asking user took on DSO Hire (job postings, application moves, settings changes, etc). Use when the user references something they 'just did' or asks what their recent activity has been.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Max events to return. Defaults to 10. Max 25.",
          minimum: 1,
          maximum: 25,
        },
      },
    },
  },
  async run(input, ctx) {
    const limit = Math.min(
      Math.max(1, Number(input.limit ?? 10) | 0),
      25
    );

    const { data, error } = await ctx.admin
      .from("audit_events")
      .select("event_kind, summary, created_at")
      .eq("actor_user_id", ctx.authUserId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { error: `Couldn't load activity: ${error.message}` };
    }

    return {
      count: data?.length ?? 0,
      events:
        (data as Array<{
          event_kind: string;
          summary: string;
          created_at: string;
        }> | null) ?? [],
    };
  },
};
