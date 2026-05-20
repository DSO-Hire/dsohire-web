"use server";

/**
 * E3.21 — move / copy a candidate's application to another job in the SAME DSO.
 *
 * Why service-role for the writes: the applications INSERT policy is
 * candidate-only (candidates apply for themselves), so an employer can't
 * insert an application under their own session. We mirror the invite-accept
 * pattern: authorize manually with the user's session first (they must be able
 * to READ the source application — RLS proves DSO membership — and the target
 * job must belong to the same DSO), then perform the write with service-role.
 *
 * Move vs copy:
 *   - copy: clone the application onto the target job (lands in that DSO's
 *     default "New" stage via the fill_default_application_stage trigger);
 *     the original is left untouched.
 *   - move: same clone, then archive the original into the source job's
 *     withdrawn (closed) lane with a note. The archive is a DIRECT stage_id
 *     update — NOT moveApplicationStage — so it does NOT dispatch a
 *     candidate-facing inbox message. Moves are silent to the candidate.
 *
 * Both are blocked by the unique (job_id, candidate_id) constraint; we
 * pre-check and return a friendly error.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export type TransferMode = "move" | "copy";

export interface MoveCopyTarget {
  id: string;
  title: string;
  /** True when the candidate already has an application on this job. */
  taken: boolean;
}

export type ListTargetsResult =
  | { ok: true; targets: MoveCopyTarget[] }
  | { ok: false; error: string };

export type TransferResult =
  | { ok: true; newApplicationId: string; mode: TransferMode }
  | { ok: false; error: string };

interface SourceContext {
  candidateId: string;
  sourceJobId: string;
  dsoId: string;
  coverLetter: string | null;
  resumeUrl: string | null;
  employerNotes: string | null;
}

/**
 * Load + authorize the source application under the USER's session. Returns
 * null when the user can't read it (not a member / not found) — RLS is the
 * authorization gate.
 */
async function loadSourceContext(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  applicationId: string
): Promise<SourceContext | null> {
  const { data, error } = await supabase
    .from("applications")
    .select(
      "candidate_id, job_id, cover_letter, resume_url, employer_notes, jobs:jobs!inner(dso_id)"
    )
    .eq("id", applicationId)
    .maybeSingle();
  if (error || !data) return null;

  const jobsRel = (data as Record<string, unknown>).jobs as
    | { dso_id: string }
    | Array<{ dso_id: string }>
    | null;
  const job = Array.isArray(jobsRel) ? jobsRel[0] ?? null : jobsRel;
  if (!job?.dso_id) return null;

  return {
    candidateId: (data as { candidate_id: string }).candidate_id,
    sourceJobId: (data as { job_id: string }).job_id,
    dsoId: job.dso_id,
    coverLetter: (data as { cover_letter: string | null }).cover_letter,
    resumeUrl: (data as { resume_url: string | null }).resume_url,
    employerNotes: (data as { employer_notes: string | null }).employer_notes,
  };
}

export async function listMoveCopyTargets(
  applicationId: string
): Promise<ListTargetsResult> {
  if (!applicationId) return { ok: false, error: "Missing application id." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const ctx = await loadSourceContext(supabase, applicationId);
  if (!ctx) return { ok: false, error: "Application not found." };

  // The DSO's other jobs (RLS scopes this to jobs the user can access, which
  // also respects hiring-manager location scoping).
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, title")
    .eq("dso_id", ctx.dsoId)
    .neq("id", ctx.sourceJobId)
    .order("created_at", { ascending: false });
  if (jobsErr) return { ok: false, error: "Couldn't load jobs." };

  const targetIds = (jobs ?? []).map((j) => j.id as string);
  let takenSet = new Set<string>();
  if (targetIds.length > 0) {
    const { data: existing } = await supabase
      .from("applications")
      .select("job_id")
      .eq("candidate_id", ctx.candidateId)
      .in("job_id", targetIds);
    takenSet = new Set(
      (existing ?? []).map((r) => (r as { job_id: string }).job_id)
    );
  }

  return {
    ok: true,
    targets: (jobs ?? []).map((j) => ({
      id: j.id as string,
      title: (j.title as string | null) ?? "Untitled job",
      taken: takenSet.has(j.id as string),
    })),
  };
}

export async function transferApplication(
  applicationId: string,
  targetJobId: string,
  mode: TransferMode
): Promise<TransferResult> {
  if (!applicationId || !targetJobId) {
    return { ok: false, error: "Missing application or target job." };
  }
  if (mode !== "move" && mode !== "copy") {
    return { ok: false, error: "Invalid transfer mode." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Authorize via the user's session (RLS proves DSO membership).
  const ctx = await loadSourceContext(supabase, applicationId);
  if (!ctx) return { ok: false, error: "Application not found." };

  // Resolve the target job + confirm it's in the SAME DSO and readable by
  // this user (RLS). Cross-DSO transfers are never allowed.
  const { data: targetJob } = await supabase
    .from("jobs")
    .select("id, title, dso_id")
    .eq("id", targetJobId)
    .maybeSingle();
  if (!targetJob) return { ok: false, error: "Target job not found." };
  if ((targetJob as { dso_id: string }).dso_id !== ctx.dsoId) {
    return {
      ok: false,
      error: "You can only move a candidate to a job in the same organization.",
    };
  }
  const targetTitle = (targetJob as { title: string | null }).title ?? "the job";

  // Unique (job_id, candidate_id) guard — friendly pre-check.
  const { data: clash } = await supabase
    .from("applications")
    .select("id")
    .eq("candidate_id", ctx.candidateId)
    .eq("job_id", targetJobId)
    .maybeSingle();
  if (clash) {
    return {
      ok: false,
      error: `This candidate already has an application on "${targetTitle}".`,
    };
  }

  const admin = createSupabaseServiceRoleClient();

  // Resolve the target DSO's default "New" stage for the clone (same DSO, so
  // ctx.dsoId). The fill_default_application_stage trigger would do this too,
  // but stage_id is a required Insert field — pass it explicitly + deterministically.
  const { data: openStage } = await admin
    .from("dso_pipeline_stages")
    .select("id")
    .eq("dso_id", ctx.dsoId)
    .eq("kind", "open")
    .order("is_default", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!openStage) {
    return {
      ok: false,
      error: "Couldn't find a default stage for the target job.",
    };
  }
  const openStageId = (openStage as { id: string }).id;

  // For a move, resolve the source DSO's withdrawn stage up front so we fail
  // before creating the clone if it's somehow missing.
  let withdrawnStageId: string | null = null;
  if (mode === "move") {
    const { data: wStage } = await admin
      .from("dso_pipeline_stages")
      .select("id")
      .eq("dso_id", ctx.dsoId)
      .eq("kind", "withdrawn")
      .order("is_default", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!wStage) {
      return {
        ok: false,
        error: "Couldn't find a closed stage to archive the original into.",
      };
    }
    withdrawnStageId = (wStage as { id: string }).id;
  }

  // Clone onto the target job, landing in the target DSO's default "New" stage.
  const { data: clone, error: cloneErr } = await admin
    .from("applications")
    .insert({
      job_id: targetJobId,
      candidate_id: ctx.candidateId,
      stage_id: openStageId,
      cover_letter: ctx.coverLetter,
      resume_url: ctx.resumeUrl,
      employer_notes: ctx.employerNotes,
      moved_from_application_id: applicationId,
    })
    .select("id")
    .single();

  if (cloneErr || !clone) {
    if (cloneErr?.code === "23505") {
      return {
        ok: false,
        error: `This candidate already has an application on "${targetTitle}".`,
      };
    }
    return { ok: false, error: "Couldn't create the application. Try again." };
  }
  const newApplicationId = clone.id as string;

  // For a move, archive the original into the withdrawn lane with a note.
  // Direct stage_id update → silent to the candidate (no inbox dispatch).
  if (mode === "move" && withdrawnStageId) {
    const stamp = new Date().toISOString().slice(0, 10);
    const note = `[Moved to "${targetTitle}" on ${stamp}]`;
    const newNotes = ctx.employerNotes
      ? `${ctx.employerNotes}\n\n${note}`
      : note;
    await admin
      .from("applications")
      .update({ stage_id: withdrawnStageId, employer_notes: newNotes })
      .eq("id", applicationId);
  }

  revalidatePath(`/employer/applications/${applicationId}`);
  revalidatePath(`/employer/applications/${newApplicationId}`);
  revalidatePath(`/employer/jobs/${ctx.sourceJobId}`);
  revalidatePath(`/employer/jobs/${targetJobId}`);

  return { ok: true, newApplicationId, mode };
}
