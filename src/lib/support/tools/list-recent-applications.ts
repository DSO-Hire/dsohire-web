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

    // Step 1: base application rows (no embeds — avoids the multi-
    // aliased GenericStringError trap). RLS scopes to DSO's jobs.
    let q = ctx.supabase
      .from("applications")
      .select("id, candidate_id, job_id, stage_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (days > 0) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      q = q.gte("created_at", cutoff.toISOString());
    }

    const { data, error } = await q;
    if (error) return { error: error.message };

    type AppRow = {
      id: string;
      candidate_id: string;
      job_id: string;
      stage_id: string;
      created_at: string;
    };
    const rows = (data as AppRow[] | null) ?? [];
    if (rows.length === 0) {
      return { count: 0, filter: { limit, days }, applications: [] };
    }

    // Step 2: batch-fetch candidates + jobs + stages in parallel.
    const candidateIds = Array.from(new Set(rows.map((r) => r.candidate_id)));
    const jobIds = Array.from(new Set(rows.map((r) => r.job_id)));
    const stageIds = Array.from(new Set(rows.map((r) => r.stage_id)));

    const [{ data: cands }, { data: jobs }, { data: stages }] =
      await Promise.all([
        ctx.admin
          .from("candidates")
          .select("id, full_name")
          .in("id", candidateIds),
        ctx.supabase.from("jobs").select("id, title").in("id", jobIds),
        ctx.supabase
          .from("dso_pipeline_stages")
          .select("id, label, kind")
          .in("id", stageIds),
      ]);

    const candById = new Map<string, string | null>();
    for (const c of (cands as Array<{ id: string; full_name: string | null }> | null) ?? []) {
      candById.set(c.id, c.full_name);
    }
    const jobById = new Map<string, string | null>();
    for (const j of (jobs as Array<{ id: string; title: string | null }> | null) ?? []) {
      jobById.set(j.id, j.title);
    }
    const stageById = new Map<
      string,
      { label: string | null; kind: string | null }
    >();
    for (const s of (stages as Array<{
      id: string;
      label: string | null;
      kind: string | null;
    }> | null) ?? []) {
      stageById.set(s.id, { label: s.label, kind: s.kind });
    }

    return {
      count: rows.length,
      filter: { limit, days },
      applications: rows.map((r) => {
        const stage = stageById.get(r.stage_id);
        return {
          application_id: r.id,
          candidate_id: r.candidate_id,
          candidate_name: candById.get(r.candidate_id) ?? "(unknown)",
          job_id: r.job_id,
          job_title: jobById.get(r.job_id) ?? "(unknown)",
          stage: stage?.label ?? stage?.kind ?? null,
          applied_at: r.created_at,
        };
      }),
    };
  },
};
