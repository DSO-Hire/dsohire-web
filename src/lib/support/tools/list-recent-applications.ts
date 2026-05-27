/**
 * Tool: list_recent_applications
 *
 * Returns up to N most recent applications across all the asking
 * DSO's jobs. Use for "show me new applicants" / "who applied this
 * week" / "what's coming through the pipeline" questions.
 */

import type { ToolHandler } from "./types";

export const listRecentApplications: ToolHandler = {
  schema: {
    name: "list_recent_applications",
    description:
      "Returns the most recent N applications across all of the asking DSO's jobs. Includes candidate name + job title + current stage + when applied. Use for 'show me recent applicants', 'who applied this week', 'what's new in my pipeline' questions.",
    input_schema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: "Max apps to return. Default 15, max 50.",
          minimum: 1,
          maximum: 50,
        },
        days: {
          type: "integer",
          description:
            "Only return apps from the last N days. Default 14. Set 0 to return regardless of age (still capped by limit).",
          minimum: 0,
          maximum: 365,
        },
      },
    },
  },
  async run(input, ctx) {
    if (!ctx.dsoId) {
      return { error: "Only signed-in DSO members can list applications." };
    }
    const limit = Math.min(
      Math.max(1, Number(input.limit ?? 15) | 0),
      50
    );
    const days = Math.max(0, Number(input.days ?? 14) | 0);

    let q = ctx.supabase
      .from("applications")
      .select(
        "id, candidate_id, job_id, stage_id, created_at, " +
          "candidate:candidates(full_name), " +
          "job:jobs(title), " +
          "stage:dso_pipeline_stages(label, kind)"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      q = q.gte("created_at", cutoff.toISOString());
    }

    const { data, error } = await q;
    if (error) return { error: error.message };

    type Row = {
      id: string;
      candidate_id: string;
      job_id: string;
      stage_id: string;
      created_at: string;
      candidate: { full_name: string | null } | Array<{ full_name: string | null }> | null;
      job: { title: string | null } | Array<{ title: string | null }> | null;
      stage: { label: string | null; kind: string | null } | Array<{ label: string | null; kind: string | null }> | null;
    };
    const rows = (data as Row[] | null) ?? [];

    return {
      count: rows.length,
      filter: { limit, days },
      applications: rows.map((r) => {
        const cand = Array.isArray(r.candidate) ? r.candidate[0] : r.candidate;
        const job = Array.isArray(r.job) ? r.job[0] : r.job;
        const stage = Array.isArray(r.stage) ? r.stage[0] : r.stage;
        return {
          application_id: r.id,
          candidate_id: r.candidate_id,
          candidate_name: cand?.full_name ?? "(unknown)",
          job_id: r.job_id,
          job_title: job?.title ?? "(unknown)",
          stage: stage?.label ?? stage?.kind ?? null,
          applied_at: r.created_at,
        };
      }),
    };
  },
};
