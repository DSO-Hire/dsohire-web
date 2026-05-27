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

    // Pull DSO's applications with candidate names, filtered fuzzy by name.
    // RLS scopes applications to DSO-owned jobs so the candidate set is
    // intrinsically scoped — no cross-DSO leakage.
    const { data, error } = await ctx.supabase
      .from("applications")
      .select(
        "id, candidate_id, created_at, " +
          "candidate:candidates!inner(full_name, first_name, last_name), " +
          "job:jobs(title)"
      )
      .ilike("candidate.full_name", `%${name}%`)
      .order("created_at", { ascending: false })
      .limit(50); // Pull more, dedupe by candidate_id below.

    if (error) return { error: error.message };

    type Row = {
      id: string;
      candidate_id: string;
      created_at: string;
      candidate: {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      } | Array<{
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }> | null;
      job: { title: string | null } | Array<{ title: string | null }> | null;
    };

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
    for (const row of (data as Row[] | null) ?? []) {
      const cand = Array.isArray(row.candidate) ? row.candidate[0] : row.candidate;
      const job = Array.isArray(row.job) ? row.job[0] : row.job;
      if (!cand) continue;
      const existing = byCandidate.get(row.candidate_id);
      if (existing) {
        existing.application_count++;
      } else {
        byCandidate.set(row.candidate_id, {
          candidate_id: row.candidate_id,
          full_name: cand.full_name ?? "(unknown)",
          application_count: 1,
          most_recent_job_title: job?.title ?? null,
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
