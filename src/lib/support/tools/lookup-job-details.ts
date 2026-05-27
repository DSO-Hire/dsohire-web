/**
 * Tool: lookup_job_details
 *
 * Returns the basic details of one job by id, scoped to the caller's
 * DSO via RLS. Use when the user asks about a specific job's settings
 * ("is internal_only on?", "what stage are most applicants on?",
 * "what's the comp range?").
 */

import type { ToolHandler } from "./types";

export const lookupJobDetails: ToolHandler = {
  schema: {
    name: "lookup_job_details",
    description:
      "Returns key details of one job posting — title, status, scope, visibility, compensation, posted_at, locations. Use when the user asks about a specific job's settings or you need to verify how it's configured.",
    input_schema: {
      type: "object",
      properties: {
        job_id: {
          type: "string",
          description: "UUID of the job.",
        },
      },
      required: ["job_id"],
    },
  },
  async run(input, ctx) {
    const id = String(input.job_id ?? "").trim();
    if (!id) return { error: "job_id is required." };
    if (!ctx.dsoId) {
      return { error: "Only signed-in DSO members can look up jobs." };
    }

    const { data: job, error } = await ctx.supabase
      .from("jobs")
      .select(
        "id, title, status, scope, visibility, employment_type, role_category, salary_min, salary_max, salary_visible, posted_at, deleted_at, internal_only, hide_stages_from_candidate"
      )
      .eq("id", id)
      .maybeSingle();

    if (error) return { error: error.message };
    if (!job) {
      return {
        error: "Job not found, or it's not on a DSO you're a member of.",
      };
    }

    const { count: applicantCount } = await ctx.supabase
      .from("applications")
      .select("id", { count: "exact", head: true })
      .eq("job_id", id);

    return {
      job,
      applicant_count: applicantCount ?? 0,
    };
  },
};
