/**
 * Tool: find_job_by_title
 *
 * Fuzzy-matches the asking DSO's jobs by title. Same purpose as
 * find_candidate_by_name — unblock questions that reference a job by
 * its title rather than UUID.
 */

import type { ToolHandler } from "./types";

export const findJobByTitle: ToolHandler = {
  schema: {
    name: "find_job_by_title",
    description:
      "Find jobs in the asking DSO by title (fuzzy match). Returns job_id + title + status + applicant count. Call FIRST when the user references a job by its title ('what's the status of my Lead Hygienist job') to get the job_id, then use it in lookup_job_details or related tools.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Partial or full job title to search for.",
        },
        limit: {
          type: "integer",
          description: "Max matches. Default 5, max 10.",
          minimum: 1,
          maximum: 10,
        },
      },
      required: ["title"],
    },
  },
  async run(input, ctx) {
    if (!ctx.dsoId) {
      return { error: "Only signed-in DSO members can search jobs." };
    }
    const title = String(input.title ?? "").trim();
    if (!title) return { error: "title is required." };
    const limit = Math.min(
      Math.max(1, Number(input.limit ?? 5) | 0),
      10
    );

    const { data, error } = await ctx.supabase
      .from("jobs")
      .select("id, title, status, role_category, employment_type, posted_at, created_at")
      .eq("dso_id", ctx.dsoId)
      .is("deleted_at", null)
      .ilike("title", `%${title}%`)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return { error: error.message };

    type Row = {
      id: string;
      title: string;
      status: string;
      role_category: string | null;
      employment_type: string | null;
      posted_at: string | null;
      created_at: string;
    };
    const rows = (data as Row[] | null) ?? [];

    // Applicant counts in one batch query.
    const applicantCounts = new Map<string, number>();
    if (rows.length > 0) {
      const { data: apps } = await ctx.supabase
        .from("applications")
        .select("job_id")
        .in(
          "job_id",
          rows.map((j) => j.id)
        );
      for (const a of (apps as Array<{ job_id: string }> | null) ?? []) {
        applicantCounts.set(
          a.job_id,
          (applicantCounts.get(a.job_id) ?? 0) + 1
        );
      }
    }

    return {
      count: rows.length,
      query: title,
      jobs: rows.map((j) => ({
        job_id: j.id,
        title: j.title,
        status: j.status,
        role: j.role_category,
        employment_type: j.employment_type,
        posted_at: j.posted_at,
        applicant_count: applicantCounts.get(j.id) ?? 0,
      })),
    };
  },
};
