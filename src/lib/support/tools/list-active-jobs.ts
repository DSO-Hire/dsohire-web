/**
 * Tool: list_active_jobs
 *
 * Returns up to N jobs for the asking user's DSO, optionally filtered
 * by status. Default: status='active'. Critical for "how many open
 * jobs do I have" / "what am I currently posting" type questions.
 */

import type { ToolHandler } from "./types";

export const listActiveJobs: ToolHandler = {
  schema: {
    name: "list_active_jobs",
    description:
      "Returns the asking DSO's job postings with title, status, role, location count, and applicant count. Default filters to active jobs only. Use for 'how many active jobs do I have', 'what am I currently posting', 'show me my open roles' questions.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Filter by status. One of: active, draft, paused, expired, filled, archived. Default: active.",
        },
        limit: {
          type: "integer",
          description: "Max jobs to return. Default 25, max 50.",
          minimum: 1,
          maximum: 50,
        },
      },
    },
  },
  async run(input, ctx) {
    if (!ctx.dsoId) {
      return { error: "Only signed-in DSO members can list jobs." };
    }
    const rawStatus = String(input.status ?? "active").trim().toLowerCase();
    const limit = Math.min(
      Math.max(1, Number(input.limit ?? 25) | 0),
      50
    );

    // Validate against the job_status enum so the supabase-js type
    // narrowing on .eq('status', X) accepts the value. Anything that
    // isn't a known enum (or 'all' meaning no filter) is treated as
    // 'all' so we don't error on a bad LLM-generated value.
    const ALLOWED_STATUSES = [
      "active",
      "draft",
      "paused",
      "expired",
      "filled",
      "archived",
    ] as const;
    type JobStatus = (typeof ALLOWED_STATUSES)[number];
    const isJobStatus = (s: string): s is JobStatus =>
      (ALLOWED_STATUSES as readonly string[]).includes(s);

    const status: JobStatus | "all" =
      rawStatus === "all" || !isJobStatus(rawStatus)
        ? rawStatus === "all"
          ? "all"
          : "all"
        : rawStatus;

    let q = ctx.supabase
      .from("jobs")
      .select("id, title, status, role_category, employment_type, posted_at, created_at")
      .eq("dso_id", ctx.dsoId)
      .is("deleted_at", null)
      .order("posted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      q = q.eq("status", status);
    }

    const { data: jobs, error } = await q;
    if (error) return { error: error.message };

    const jobList = (jobs as Array<{
      id: string;
      title: string;
      status: string;
      role_category: string | null;
      employment_type: string | null;
      posted_at: string | null;
      created_at: string;
    }> | null) ?? [];

    // Applicant counts in a single batch query.
    let applicantCounts = new Map<string, number>();
    if (jobList.length > 0) {
      const { data: apps } = await ctx.supabase
        .from("applications")
        .select("job_id")
        .in(
          "job_id",
          jobList.map((j) => j.id)
        );
      for (const a of (apps as Array<{ job_id: string }> | null) ?? []) {
        applicantCounts.set(
          a.job_id,
          (applicantCounts.get(a.job_id) ?? 0) + 1
        );
      }
    }

    return {
      count: jobList.length,
      filter: { status, limit },
      jobs: jobList.map((j) => ({
        id: j.id,
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
