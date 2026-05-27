/**
 * Tool: lookup_dso_members
 *
 * Returns the asking DSO's team list (name + role only). Use when the
 * user asks about their team setup ("how many admins do I have?",
 * "is Sarah on my team yet?").
 *
 * Deliberately omits PII (email, phone) — keep the surface narrow.
 * If the user needs to email a teammate they're using a different
 * surface.
 */

import type { ToolHandler } from "./types";

export const lookupDsoMembers: ToolHandler = {
  schema: {
    name: "lookup_dso_members",
    description:
      "Returns the list of team members (name + role) at the asking user's DSO. Use when the user asks about their team makeup or whether a teammate is set up correctly.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  async run(_input, ctx) {
    if (!ctx.dsoId) {
      return {
        error: "Only signed-in DSO members can look up team members.",
      };
    }

    const { data, error } = await ctx.supabase
      .from("dso_users")
      .select("full_name, role, created_at")
      .eq("dso_id", ctx.dsoId)
      .order("role", { ascending: true });

    if (error) return { error: error.message };

    return {
      count: data?.length ?? 0,
      members: data ?? [],
    };
  },
};
