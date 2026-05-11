/**
 * /employer/jobs/[id] — pipeline-first per-job page (Phase 4.7.a).
 *
 * Renders the kanban inline as the default view. The wizard edit
 * surface lives at `/employer/jobs/[id]/edit`. The legacy
 * `/employer/jobs/[id]/applications` URL still works but redirects
 * to this page (URL canonicalization).
 *
 * Top-of-page actions cluster:
 *   • Edit job → /employer/jobs/[id]/edit
 *   • View public listing (when status=active)
 *   • Status actions (Close / Reopen) via the existing JobStatusActions
 *
 * Data-fetching duplicates the logic from the old
 * /applications/page.tsx — we deliberately keep one server file per
 * route rather than a shared helper for now; the next refactor pass
 * can extract a `fetchKanbanData` if a third consumer appears.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Copy, Download, ExternalLink, Pencil, Users } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ApplicationsBoard,
  type BoardView,
} from "./applications/applications-board";
import type { KanbanApplication } from "./applications/kanban-board";
import type { ApplicationStatus } from "@/lib/applications/stages";
import { getPracticeFitForJob } from "@/lib/practice-fit/get-or-compute";
import type { FitResult } from "@/lib/practice-fit/types";
import { JobStatusActions } from "./status-actions";
import { cloneJob } from "../actions";
import {
  getPerJobAnalytics,
  getJobFunnel,
  getJobStageDwell,
} from "@/lib/analytics/metrics";
import { PerJobAnalyticsCard } from "@/components/analytics/per-job-analytics-card";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { StageDwellCard } from "@/components/analytics/stage-dwell-card";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return {
    title: job ? `${job.title as string} · Pipeline` : "Pipeline",
  };
}

export default async function PerJobPipelinePage({
  params,
  searchParams,
}: PageProps) {
  const { id: jobId } = await params;
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  // Hiring managers don't get bulk actions (locked decision 2026-05-05).
  const canBulkAct = dsoUser.role !== "hiring_manager";

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, dso_id, status, applications_count, views")
    .eq("id", jobId)
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();
  if (!job) notFound();

  const { data: rawApps } = await supabase
    .from("applications")
    .select(
      "id, job_id, candidate_id, status, created_at, stage_entered_at, pipeline_position"
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    status: ApplicationStatus;
    created_at: string;
    stage_entered_at: string;
    pipeline_position: number | null;
  };
  const apps = (rawApps ?? []) as AppRow[];

  const candidateIds = Array.from(new Set(apps.map((a) => a.candidate_id)));
  const { data: rawCands } = candidateIds.length
    ? await supabase
        .from("candidates")
        .select("id, full_name, current_title, headline, years_experience")
        .in("id", candidateIds)
    : { data: [] };

  type CandRow = {
    id: string;
    full_name: string | null;
    current_title: string | null;
    headline: string | null;
    years_experience: number | null;
  };
  const cands = (rawCands ?? []) as CandRow[];
  const candMap = new Map(cands.map((c) => [c.id, c]));

  const appIds = apps.map((a) => a.id);
  const { data: rawCounts } = appIds.length
    ? await supabase
        .from("application_comment_counts")
        .select("application_id, comment_count")
        .in("application_id", appIds)
    : { data: [] };
  type CountRow = {
    application_id: string | null;
    comment_count: number | null;
  };
  const countMap = new Map<string, number>();
  for (const row of (rawCounts ?? []) as CountRow[]) {
    if (row.application_id) {
      countMap.set(row.application_id, row.comment_count ?? 0);
    }
  }

  const { data: rawScorecardSummaries } = appIds.length
    ? await supabase
        .from("application_scorecard_summaries")
        .select("application_id, avg_score, reviewer_count")
        .in("application_id", appIds)
    : { data: [] };

  const aiContextByAppId = new Map<string, boolean>();
  if (appIds.length > 0) {
    const { data: rawAnsRows } = await supabase
      .from("application_question_answers")
      .select("application_id")
      .in("application_id", appIds);
    for (const r of (rawAnsRows ?? []) as Array<{
      application_id: string | null;
    }>) {
      if (r.application_id) aiContextByAppId.set(r.application_id, true);
    }
    const { data: rawScRows } = await supabase
      .from("application_scorecards")
      .select("application_id")
      .in("application_id", appIds)
      .eq("status", "submitted");
    for (const r of (rawScRows ?? []) as Array<{
      application_id: string | null;
    }>) {
      if (r.application_id) aiContextByAppId.set(r.application_id, true);
    }
  }

  const { data: subTierRow } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("dso_id", dsoUser.dso_id as string)
    .maybeSingle();
  const _subStatus = (subTierRow?.status as string | undefined) ?? null;
  const _subTier = (subTierRow?.tier as string | undefined) ?? null;
  const aiSuggesterAvailable =
    (_subStatus === "active" || _subStatus === "trialing") &&
    (_subTier === "growth" || _subTier === "enterprise");

  type ScorecardSummaryRow = {
    application_id: string | null;
    avg_score: number | null;
    reviewer_count: number | null;
  };
  const scorecardSummaryMap = new Map<
    string,
    { avg: number | null; reviewers: number }
  >();
  for (const row of (rawScorecardSummaries ?? []) as ScorecardSummaryRow[]) {
    if (row.application_id) {
      scorecardSummaryMap.set(row.application_id, {
        avg: row.avg_score,
        reviewers: row.reviewer_count ?? 0,
      });
    }
  }

  const jobTitle = job.title as string;

  // Practice Fit (Phase 5D) — bulk-compute per-candidate scores for
  // every application on this job in one call. RLS gates which scores
  // we can see (consent != 'off'); missing entries → null.
  const fitMap = candidateIds.length > 0
    ? await getPracticeFitForJob(jobId, candidateIds)
    : new Map<string, FitResult>();

  const initialApplications: KanbanApplication[] = apps.map((a) => {
    const summary = scorecardSummaryMap.get(a.id);
    return {
      id: a.id,
      job_id: a.job_id,
      candidate_id: a.candidate_id,
      status: a.status,
      created_at: a.created_at,
      stage_entered_at: a.stage_entered_at,
      pipeline_position: a.pipeline_position,
      candidate: candMap.get(a.candidate_id) ?? null,
      jobTitle,
      comment_count: countMap.get(a.id) ?? 0,
      scorecard_avg: summary?.avg ?? null,
      scorecard_reviewer_count: summary?.reviewers ?? 0,
      practiceFit: fitMap.get(a.candidate_id) ?? null,
    };
  });

  const initialView: BoardView = sp.view === "list" ? "list" : "kanban";
  const status = job.status as string;

  // Phase 5C per-job analytics + funnel + stage dwell. Run in parallel.
  const [analytics, funnel, stageDwell] = await Promise.all([
    getPerJobAnalytics(supabase, jobId),
    getJobFunnel(supabase, jobId),
    getJobStageDwell(supabase, jobId),
  ]);

  return (
    <EmployerShell active="jobs">
      <Link
        href="/employer/jobs"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      {/* Header — title + status + counts + actions cluster */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
            {status === "draft"
              ? "Draft Job"
              : status === "active"
                ? "Active Job"
                : status === "closed"
                  ? "Closed Job"
                  : status}
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
            {jobTitle}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-5 text-[13px] text-slate-body">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5 text-slate-meta" />
              <strong className="text-ink font-bold">
                {job.applications_count ?? apps.length}
              </strong>{" "}
              applications
            </span>
            <span>
              <strong className="text-ink font-bold">
                {analytics.views_total}
              </strong>{" "}
              views
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/employer/jobs/${jobId}/edit`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-cream"
          >
            <Pencil className="size-3.5" />
            Edit job
          </Link>
          <form action={cloneJob}>
            <input type="hidden" name="job_id" value={jobId} />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-cream"
              title="Create a new job from a copy of this one"
            >
              <Copy className="size-3.5" />
              Clone
            </button>
          </form>
          {status === "active" && (
            <Link
              href={`/jobs/${jobId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-cream"
            >
              <ExternalLink className="size-3.5" />
              View public posting
            </Link>
          )}
          <a
            href={`/api/employer/jobs/${jobId}/applications.csv`}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-cream"
            title="Download applications as CSV"
          >
            <Download className="size-3.5" />
            Export CSV
          </a>
          <JobStatusActions jobId={jobId} currentStatus={status} />
        </div>
      </header>

      <PerJobAnalyticsCard metrics={analytics} />

      <div className="mb-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        <FunnelChart
          rows={funnel.rows}
          rejected={funnel.rejected}
          withdrawn={funnel.withdrawn}
          title="Pipeline funnel · this job"
        />
        <StageDwellCard rows={stageDwell} />
      </div>

      {/* Pipeline (kanban inline) */}
      <ApplicationsBoard
        initialApplications={initialApplications}
        job={{ id: job.id as string, title: jobTitle }}
        initialView={initialView}
        aiSuggesterAvailable={aiSuggesterAvailable}
        aiSuggesterContextByAppId={Object.fromEntries(aiContextByAppId)}
        canBulkAct={canBulkAct}
      />
    </EmployerShell>
  );
}
