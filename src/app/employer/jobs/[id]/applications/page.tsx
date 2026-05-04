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

  const jobTitle = job.title as string;
  const initialApplications: KanbanApplication[] = apps.map((a) => ({
    id: a.id,
    job_id: a.job_id,
    candidate_id: a.candidate_id,
    status: a.status,
    created_at: a.created_at,
    stage_entered_at: a.stage_entered_at,
    pipeline_position: a.pipeline_position,
    candidate: candMap.get(a.candidate_id) ?? null,
    jobTitle,
  }));

  const initialView: BoardView = sp.view === "list" ? "list" : "kanban";

  return (
    <EmployerShell active="jobs">
      <ApplicationsBoard
        initialApplications={initialApplications}
        job={{ id: job.id as string, title: jobTitle }}
        initialView={initialView}
      />
    </EmployerShell>
  );
}
