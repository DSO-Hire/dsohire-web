/**
 * Tool: lookup_candidate_email_history
 *
 * Returns recent email_log entries scoped to ONE candidate the asking
 * DSO has interacted with. Critical for "Why didn't Sarah get my
 * email?" — Claude can see the delivery status (sent / bounced /
 * spam-filtered) and tell the user what actually happened.
 *
 * Scope: only emails where related_candidate_id matches AND the email
 * was related to a DSO the caller is a member of. Service-role lookup
 * with explicit dso_id filter.
 */

import type { ToolHandler } from "./types";

export const lookupCandidateEmailHistory: ToolHandler = {
  schema: {
    name: "lookup_candidate_email_history",
    description:
      "Returns the last N emails the platform sent to or about a specific candidate, with delivery status (sent / bounced / failed / skipped). Use when the user reports a candidate didn't receive an expected email.",
    input_schema: {
      type: "object",
      properties: {
        candidate_id: {
          type: "string",
          description:
            "UUID of the candidate. If the user references a candidate by name, you may need to ask for the id or look it up via another tool first.",
        },
        limit: {
          type: "integer",
          description: "Max entries to return. Defaults to 10. Max 30.",
          minimum: 1,
          maximum: 30,
        },
      },
      required: ["candidate_id"],
    },
  },
  async run(input, ctx) {
    const candidateId = String(input.candidate_id ?? "").trim();
    if (!candidateId) return { error: "candidate_id is required." };
    if (!ctx.dsoId) {
      return {
        error:
          "Only signed-in DSO members can look up candidate email history.",
      };
    }
    const limit = Math.min(
      Math.max(1, Number(input.limit ?? 10) | 0),
      30
    );

    // Service-role with EXPLICIT dso_id scope so we can see email_log
    // rows that RLS would otherwise hide. The dso_id filter is the
    // safety boundary.
    const { data, error } = await ctx.admin
      .from("email_log")
      .select(
        "to_email, template, subject, status, error, created_at"
      )
      .eq("related_candidate_id", candidateId)
      .eq("related_dso_id", ctx.dsoId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };

    return {
      count: data?.length ?? 0,
      emails: data ?? [],
    };
  },
};
