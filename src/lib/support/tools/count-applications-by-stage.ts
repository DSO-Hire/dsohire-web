/**
 * Tool: count_applications_by_stage
 *
 * Returns a count of applications per pipeline stage_kind across the
 * asking DSO's jobs. Use for "how many candidates are in interview" /
 * "what's my pipeline look like" / "give me a snapshot" questions.
 *
 * Optionally scoped to one job_id.
 */

import type { ToolHandler } from "./types";

export const countApplicationsByStage: ToolHandler = {
  schema: {
    name: "count_applications_by_stage",
    description:
      "Returns a count of applications grouped by pipeline stage kind (new, screen, interview, offer, hired, rejected, withdrawn). Use for 'how many candidates are in interview', 'what's my pipeline snapshot', 'how many open applications do I have' questions. Optionally pass job_id to scope to one job.",
    input_schema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "Optional UUID. If set, scope counts to this one job. If omitted, counts across all the DSO's jobs.",
        },
      },
    },
  },
  async run(input, ctx) {
    if (!ctx.dsoId) {
      return { error: "Only signed-in DSO members can count applications." };
    }
    const jobId = input.job_id ? String(input.job_id).trim() : null;

    let q = ctx.supabase
      .from("applications")
      .select(
        "id, stage:dso_pipeline_stages(kind)"
      );
    if (jobId) {
      q = q.eq("job_id", jobId);
    }

    const { data, error } = await q;
    if (error) return { error: error.message };

    type Row = {
      id: string;
      stage: { kind: string | null } | Array<{ kind: string | null }> | null;
    };
    const rows = (data as Row[] | null) ?? [];

    const counts: Record<string, number> = {
      open: 0,
      screen: 0,
      interview: 0,
      offer: 0,
      hired: 0,
      rejected: 0,
      withdrawn: 0,
      unknown: 0,
    };
    for (const r of rows) {
      const stage = Array.isArray(r.stage) ? r.stage[0] : r.stage;
      const kind = (stage?.kind as string | null) ?? null;
      if (kind && counts[kind] !== undefined) {
        counts[kind]++;
      } else {
        counts.unknown++;
      }
    }

    const total = rows.length;
    const open_total =
      counts.open + counts.screen + counts.interview + counts.offer;

    return {
      total,
      open_total,
      by_stage: counts,
      filter: jobId ? { job_id: jobId } : { scope: "all DSO jobs" },
    };
  },
};
