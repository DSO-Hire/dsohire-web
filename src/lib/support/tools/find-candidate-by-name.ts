/**
 * Tool: find_candidate_by_name
 *
 * Fuzzy-matches candidates by name within the asking DSO's applicants.
 * CRITICAL for the "Why didn't Sarah Chen get my email" / "What stage
 * is Jordan on" type questions where the user references a candidate
 * by name not UUID.
 *
 * Scope: only candidates who have applied to a job belonging to the
 * asking DSO. We don't expose the full candidate pool — that would
 * be a privacy leak (cross-DSO).
 */

import type { ToolHandler } from "./types";

export const findCandidateByName: ToolHandler = {
  schema: {
    name: "find_candidate_by_name",
    description:
      "Find candidates by name (fuzzy match) who have applied to one of the asking DSO's jobs. Returns candidate_id + name + count of applications + most-recent application's job title. CRITICAL when the user references a candidate by name — call this FIRST to get the candidate_id, then use it in lookup_candidate_email_history or lookup_application_status. Only returns candidates who have applied to your DSO; no cross-DSO leakage.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Partial or full candidate name to search for.",
        },
        limit: {
          type: "integer",
          description: "Max matches to return. Default 5, max 10.",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["name"],
    },
  },
  async run(input, ctx) {
    if (!ctx.dsoId) {
      return { error: "Only signed-in DSO members can search candidates." };
    }
    const name = String(input.name ?? "").trim();
    if (!name) return { error: "name is required." };
    const limit = Math.min(
      Math.max(1, Number(input.limit ?? 5) | 0),
      10
    );

    // Step 1: fuzzy-match candidates by name (no embed — clean cast shape).
    // RLS on candidates is permissive (candidates are visible across DSOs
    // once they apply), so we scope via the application join in step 2.
    const { data: candMatches, error: candErr } = await ctx.admin
      .from("candidates")
      .select("id, full_name, first_name, last_name")
      .ilike("full_name", `%${name}%`)
      .limit(50);
    if (candErr) return { error: candErr.message };

    const candidateById = new Map<
      string,
      { id: string; full_name: string | null }
    >();
    for (const c of (candMatches as Array<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }> | null) ?? []) {
      candidateById.set(c.id, { id: c.id, full_name: c.full_name });
    }
    const candidateIds = Array.from(candidateById.keys());
    if (candidateIds.length === 0) {
      return { count: 0, query: name, candidates: [] };
    }

    // Step 2: scope to applications on THIS DSO's jobs only — RLS does
    // the filtering. Single-table select, no aliased embeds.
    const { data: apps, error: appsErr } = await ctx.supabase
      .from("applications")
      .select("id, candidate_id, job_id, created_at")
      .in("candidate_id", candidateIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (appsErr) return { error: appsErr.message };

    type AppRow = {
      id: string;
      candidate_id: string;
      job_id: string;
      created_at: string;
    };
    const appRows = (apps as AppRow[] | null) ?? [];

    // Step 3: pull job titles in one batch.
    const jobIds = Array.from(new Set(appRows.map((a) => a.job_id)));
    const jobTitleById = new Map<string, string | null>();
    if (jobIds.length > 0) {
      const { data: jobs } = await ctx.supabase
        .from("jobs")
        .select("id, title")
        .in("id", jobIds);
      for (const j of (jobs as Array<{ id: string; title: string | null }> | null) ?? []) {
        jobTitleById.set(j.id, j.title);
      }
    }

    // Dedupe by candidate_id; count applications per candidate.
    const byCandidate = new Map<
      string,
      {
        candidate_id: string;
        full_name: string;
        application_count: number;
        most_recent_job_title: string | null;
        most_recent_application_id: string;
      }
    >();
    for (const row of appRows) {
      const cand = candidateById.get(row.candidate_id);
      if (!cand) continue;
      const existing = byCandidate.get(row.candidate_id);
      if (existing) {
        existing.application_count++;
      } else {
        byCandidate.set(row.candidate_id, {
          candidate_id: row.candidate_id,
          full_name: cand.full_name ?? "(unknown)",
          application_count: 1,
          most_recent_job_title: jobTitleById.get(row.job_id) ?? null,
          most_recent_application_id: row.id,
        });
      }
    }

    const matches = Array.from(byCandidate.values()).slice(0, limit);
    return {
      count: matches.length,
      query: name,
      candidates: matches,
    };
  },
};
