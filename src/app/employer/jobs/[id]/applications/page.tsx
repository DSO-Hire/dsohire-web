/**
 * /employer/jobs/[id]/applications — per-job application pipeline.
 *
 * Server component. Auth-gates DSO membership for the job, fetches job +
 * applications + candidates in one round trip (RLS scopes everything to the
 * caller's DSO). Reads ?view=list|kanban from search params (default kanban),
 * then hands off to <ApplicationsBoard>, which owns view-toggle state +
 * localStorage persistence client-side.
 *
 * Day 2 of Phase 5A kanban. Day 3 will wire drag-drop, Day 4 realtime sync.
 */

import { redirect, notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ApplicationsBoard,
  type BoardView,
} from "./applications-board";
import type { KanbanApplication } from "./kanban-board";
import type { ApplicationStatus } from "@/lib/applications/stages";
import { EmployerShell } from "@/components/employer/employer-shell";
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
    title: job
      ? `Applications · ${job.title as string} · DSO Hire`
      : "Applications · DSO Hire",
  };
}

export default async function PerJobApplicationsPage({
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
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, dso_id")
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

  // Per-application comment counts (drives the chat-bubble indicator on
  // the kanban card). The application_comment_counts view is RLS-scoped
  // via security_invoker, so we only see counts for our own DSO. Missing
  // ids = zero comments.
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

  // Per-application scorecard aggregates (drives the star indicator on
  // the kanban card). Only submitted scorecards are summed; drafts stay
  // private until submission. Same security_invoker pattern as comments.
  const { data: rawScorecardSummaries } = appIds.length
    ? await supabase
        .from("application_scorecard_summaries")
        .select("application_id, avg_score, reviewer_count")
        .in("application_id", appIds)
    : { data: [] };

  // Per-application boolean: does this application have ≥1 screening answer
  // or ≥1 submitted scorecard? Drives the AI rejection-reason suggester's
  // disabled state in the bulk-reject dialog. We compute this in two cheap
  // count queries rather than another two joins.
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

  // DSO-level tier gate for the AI rejection-reason suggester (Growth+ only).
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
    };
  });

  const initialView: BoardView = sp.view === "list" ? "list" : "kanban";

  return (
    <EmployerShell active="jobs">
      <ApplicationsBoard
        initialApplications={initialApplications}
        job={{ id: job.id as string, title: jobTitle }}
        initialView={initialView}
        aiSuggesterAvailable={aiSuggesterAvailable}
        aiSuggesterContextByAppId={Object.fromEntries(aiContextByAppId)}
      />
    </EmployerShell>
  );
}
