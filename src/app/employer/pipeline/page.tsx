/**
 * /employer/pipeline — Pipeline HQ (#115 FOH-10, Day 32 port of FOH 100x
 * Model 05). "Every practice. Every role. One pipeline." — literally.
 *
 * The cross-job kanban: every application across every job on one board,
 * with job chips + a minimum-fit filter on top. Reuses the per-job
 * <KanbanBoard> wholesale (it was already job-agnostic: DSO-scoped stages,
 * job-agnostic moveApplicationStage, jobTitle already on every card);
 * realtime covers the whole board via the widened multi-job subscription.
 *
 * Access inheritance (nothing bespoke here, by design):
 *   - RLS filters the jobs query through user_can_access_job — a viewer
 *     without a confidential-search grant never receives that job or its
 *     applications; an HM only receives their scope.
 *   - Anonymity: every row on this board APPLIED to this DSO, so real
 *     names are correct (masked = anonymous && !applied — never true here).
 *   - apps.view capability gates the route + nav in lockstep (#83).
 *
 * Volume guard: newest 500 applications across the DSO (the board is a
 * working surface, not an archive — the full history lives in the
 * /employer/applications list). True per-column server pagination is the
 * queued follow-up if any DSO outgrows this.
 */

import { redirect } from "next/navigation";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions/capabilities";
import { getActiveLocationId } from "@/lib/employer/active-location";
import { getPracticeFitForJob } from "@/lib/practice-fit/get-or-compute";
import type { FitResult } from "@/lib/practice-fit/types";
import type { PipelineStage, StageKind } from "@/lib/applications/stages";
import {
  isTagColor,
  type ApplicationTag,
  type TagColor,
} from "@/lib/applications/tags";
import type { KanbanApplication } from "../jobs/[id]/applications/kanban-board";
import { PipelineHqBoard, type PipelineJobChip } from "./pipeline-board";
import { getStageDwellNorms } from "@/lib/applications/stage-dwell";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pipeline HQ" };

const APP_LIMIT = 500;

export default async function PipelineHqPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  if (
    !can(
      dsoUser.role as string,
      (dsoUser as Record<string, unknown>).permission_overrides,
      "apps.view"
    )
  ) {
    redirect("/employer/dashboard");
  }
  const canBulkAct = (dsoUser.role as string) !== "hiring_manager";

  // Location switcher narrows the board exactly like the applications list.
  const activeLocationId = await getActiveLocationId();
  let locationFilteredJobIds: string[] | null = null;
  if (activeLocationId) {
    const { data: jobLocRows } = await supabase
      .from("job_locations")
      .select("job_id")
      .eq("location_id", activeLocationId);
    locationFilteredJobIds = (
      (jobLocRows ?? []) as Array<{ job_id: string }>
    ).map((r) => r.job_id);
  }

  // Jobs — RLS (user_can_access_job) already excludes confidential jobs
  // this viewer wasn't granted and scopes HMs; we just don't show drafts.
  let jobsQuery = supabase
    .from("jobs")
    .select("id, title, status, confidential")
    .eq("dso_id", dsoUser.dso_id as string)
    .is("deleted_at", null)
    .neq("status", "draft");
  if (locationFilteredJobIds !== null) {
    jobsQuery = jobsQuery.in(
      "id",
      locationFilteredJobIds.length > 0 ? locationFilteredJobIds : ["__none__"]
    );
  }
  const { data: rawJobs } = await jobsQuery.order("posted_at", {
    ascending: false,
    nullsFirst: false,
  });
  type JobRow = {
    id: string;
    title: string;
    status: string;
    confidential: boolean | null;
  };
  const jobs = (rawJobs ?? []) as JobRow[];
  const jobIds = jobs.map((j) => j.id);
  const jobById = new Map(jobs.map((j) => [j.id, j]));

  // Stages — DSO-scoped, same source as every board.
  const { data: rawStages } = await supabase
    .from("dso_pipeline_stages")
    .select(
      "id, dso_id, kind, label, slug, sort_order, is_hidden, is_default, color_class"
    )
    .eq("dso_id", dsoUser.dso_id as string)
    .order("sort_order", { ascending: true });
  const stages = (rawStages ?? []) as PipelineStage[];
  const stageById = new Map(stages.map((s) => [s.id, s]));

  // Applications across every job (newest APP_LIMIT).
  const { data: rawApps } = jobIds.length
    ? await supabase
        .from("applications")
        .select(
          "id, job_id, candidate_id, stage_id, created_at, stage_entered_at, pipeline_position, knockout_failed_questions"
        )
        .in("job_id", jobIds)
        .order("created_at", { ascending: false })
        .limit(APP_LIMIT)
    : { data: [] };
  type AppRow = {
    id: string;
    job_id: string;
    candidate_id: string;
    stage_id: string;
    created_at: string;
    stage_entered_at: string;
    pipeline_position: number | null;
    knockout_failed_questions: string[] | null;
  };
  const apps = (rawApps ?? []) as AppRow[];
  const appIds = apps.map((a) => a.id);
  const candidateIds = Array.from(new Set(apps.map((a) => a.candidate_id)));

  // Candidate display data (every row applied → real names are correct).
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
  const candMap = new Map(
    ((rawCands ?? []) as CandRow[]).map((c) => [c.id, c])
  );

  // Card chrome: comment counts, tags, scorecard summaries.
  const [{ data: rawCounts }, { data: rawTagRows }, { data: rawScorecards }] =
    appIds.length
      ? await Promise.all([
          supabase
            .from("application_comment_counts")
            .select("application_id, comment_count")
            .in("application_id", appIds),
          supabase
            .from("application_tags")
            .select("id, application_id, label, color")
            .in("application_id", appIds)
            .order("created_at", { ascending: true }),
          supabase
            .from("application_scorecard_summaries")
            .select("application_id, avg_score, reviewer_count")
            .in("application_id", appIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const countMap = new Map<string, number>();
  for (const row of (rawCounts ?? []) as Array<{
    application_id: string | null;
    comment_count: number | null;
  }>) {
    if (row.application_id) countMap.set(row.application_id, row.comment_count ?? 0);
  }

  const tagsByApp = new Map<string, ApplicationTag[]>();
  for (const row of (rawTagRows ?? []) as Array<{
    id: string;
    application_id: string;
    label: string;
    color: string;
  }>) {
    const list = tagsByApp.get(row.application_id) ?? [];
    list.push({
      id: row.id,
      label: row.label,
      color: isTagColor(row.color) ? (row.color as TagColor) : "slate",
    });
    tagsByApp.set(row.application_id, list);
  }

  const scorecardMap = new Map<string, { avg: number | null; reviewers: number }>();
  for (const row of (rawScorecards ?? []) as Array<{
    application_id: string | null;
    avg_score: number | null;
    reviewer_count: number | null;
  }>) {
    if (row.application_id) {
      scorecardMap.set(row.application_id, {
        avg: row.avg_score,
        reviewers: row.reviewer_count ?? 0,
      });
    }
  }

  // AI reject-suggester context (same gate as the per-job board).
  const aiContextByAppId: Record<string, boolean> = {};
  if (appIds.length > 0) {
    const [{ data: ansRows }, { data: scRows }] = await Promise.all([
      supabase
        .from("application_question_answers")
        .select("application_id")
        .in("application_id", appIds),
      supabase
        .from("application_scorecards")
        .select("application_id")
        .in("application_id", appIds)
        .eq("status", "submitted"),
    ]);
    for (const r of (ansRows ?? []) as Array<{ application_id: string | null }>) {
      if (r.application_id) aiContextByAppId[r.application_id] = true;
    }
    for (const r of (scRows ?? []) as Array<{ application_id: string | null }>) {
      if (r.application_id) aiContextByAppId[r.application_id] = true;
    }
  }

  const { data: subTierRow } = await supabase
    .from("subscriptions")
    .select("tier, status")
    .eq("dso_id", dsoUser.dso_id as string)
    .maybeSingle();
  const subStatus = (subTierRow?.status as string | undefined) ?? null;
  const subTier = (subTierRow?.tier as string | undefined) ?? null;
  const aiSuggesterAvailable =
    (subStatus === "active" || subStatus === "trialing") &&
    (subTier === "growth" || subTier === "scale" || subTier === "enterprise");

  // PracticeFit — per job (the scorer is job-contextual), only jobs with apps.
  const candidatesByJob = new Map<string, string[]>();
  for (const a of apps) {
    const list = candidatesByJob.get(a.job_id) ?? [];
    list.push(a.candidate_id);
    candidatesByJob.set(a.job_id, list);
  }
  const fitByJob = new Map<string, Map<string, FitResult>>();
  await Promise.all(
    Array.from(candidatesByJob.entries()).map(async ([jId, candIds]) => {
      const m = await getPracticeFitForJob(jId, Array.from(new Set(candIds)));
      fitByJob.set(jId, m);
    })
  );

  const initialApplications: KanbanApplication[] = apps.map((a) => {
    const summary = scorecardMap.get(a.id);
    const stage = stageById.get(a.stage_id);
    const kind: StageKind = (stage?.kind ?? "open") as StageKind;
    return {
      id: a.id,
      job_id: a.job_id,
      candidate_id: a.candidate_id,
      stage_id: a.stage_id,
      kind,
      created_at: a.created_at,
      stage_entered_at: a.stage_entered_at,
      pipeline_position: a.pipeline_position,
      candidate: candMap.get(a.candidate_id) ?? null,
      jobTitle: jobById.get(a.job_id)?.title ?? "",
      comment_count: countMap.get(a.id) ?? 0,
      tags: tagsByApp.get(a.id) ?? [],
      scorecard_avg: summary?.avg ?? null,
      scorecard_reviewer_count: summary?.reviewers ?? 0,
      practiceFit: fitByJob.get(a.job_id)?.get(a.candidate_id) ?? null,
      knockoutFailedQuestions: a.knockout_failed_questions ?? [],
    };
  });

  const jobChips: PipelineJobChip[] = jobs
    .map((j) => ({
      id: j.id,
      title: j.title,
      status: j.status,
      confidential: j.confidential === true,
      count: apps.filter((a) => a.job_id === j.id).length,
    }))
    .filter((j) => j.count > 0 || j.status === "open");

  // Lane 5 — DSO-wide trailing-90 dwell norms for column health.
  const dwellNorms = await getStageDwellNorms(supabase);

  return (
    <EmployerShell active="pipeline">
      <PipelineHqBoard
        applications={initialApplications}
        stages={stages}
        jobs={jobChips}
        jobIds={jobIds}
        aiSuggesterAvailable={aiSuggesterAvailable}
        aiSuggesterContextByAppId={aiContextByAppId}
        canBulkAct={canBulkAct}
        truncated={apps.length >= APP_LIMIT}
        dwellNorms={dwellNorms}
      />
    </EmployerShell>
  );
}
