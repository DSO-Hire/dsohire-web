"use server";

/**
 * N16 v2 — drip sequence server actions.
 *
 *   • Builder CRUD (createSequence / saveSequenceSteps / setSequenceEnabled /
 *     deleteSequence) — owner/admin, Scale+. Writes via the authenticated
 *     client (RLS owner/admin policy).
 *   • Enrollment (enrollInSequence / stopEnrollment) — owner/admin/recruiter,
 *     Scale+ to enroll. Enrollment rows are written via service-role after an
 *     explicit access check (RLS on the table is read-only), mirroring the
 *     offer-sends posture.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { dsoCanUseSequences } from "./tier";
import { processDueSequences } from "./process";
import { isBlocked } from "@/lib/sourcing/blocklist";
import {
  effectivePermissions,
  type Capability,
} from "@/lib/permissions/capabilities";

export type SeqResult = { ok: true; id?: string } | { ok: false; error: string };

interface StepInput {
  delay_days: number;
  subject: string;
  body: string;
}

async function resolveActor(): Promise<
  | {
      ok: true;
      dsoId: string;
      dsoUserId: string;
      role: string;
      authId: string;
      /** #83 Phase 2 — effective capability map (role preset + overrides). */
      perms: Record<Capability, boolean>;
      /** Shorthand for perms["integrations.manage"]. */
      canManage: boolean;
    }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  const { data: me } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, permission_overrides")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return { ok: false, error: "You don't have access to this DSO." };
  const perms = effectivePermissions(
    me.role as string,
    (me as Record<string, unknown>).permission_overrides
  );
  return {
    ok: true,
    dsoId: me.dso_id as string,
    dsoUserId: me.id as string,
    role: me.role as string,
    authId: user.id,
    perms,
    canManage: perms["integrations.manage"],
  };
}

function validateSteps(steps: StepInput[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) {
    return "Add at least one step.";
  }
  if (steps.length > 12) return "A sequence can have at most 12 steps.";
  for (const s of steps) {
    if (!s.subject?.trim()) return "Every step needs a subject.";
    if (s.subject.length > 200) return "A subject is too long (max 200).";
    if (!s.body?.trim()) return "Every step needs a message body.";
    if (s.body.length > 4000) return "A message body is too long (max 4000).";
    const d = Number(s.delay_days);
    if (!Number.isInteger(d) || d < 0 || d > 365) {
      return "Each step's delay must be a whole number of days (0–365).";
    }
  }
  return null;
}

/** Create a sequence + its steps in one shot (owner/admin, Scale+). */
export async function saveSequence(input: {
  id?: string;
  name: string;
  steps: StepInput[];
}): Promise<SeqResult> {
  const who = await resolveActor();
  if (!who.ok) return who;
  if (!who.canManage) {
    return { ok: false, error: "You don't have permission to edit sequences." };
  }
  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseSequences(supabase, who.dsoId))) {
    return { ok: false, error: "Drip sequences are a Scale feature. Upgrade to use them." };
  }
  const name = (input.name ?? "").trim();
  if (!name) return { ok: false, error: "Give the sequence a name." };
  if (name.length > 120) return { ok: false, error: "Name is too long (max 120)." };
  const stepErr = validateSteps(input.steps);
  if (stepErr) return { ok: false, error: stepErr };

  let sequenceId = input.id ?? null;
  if (sequenceId) {
    const { error: upErr } = await supabase
      .from("automation_sequences")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", sequenceId)
      .eq("dso_id", who.dsoId);
    if (upErr) return { ok: false, error: "Couldn't update the sequence." };
  } else {
    const { data: created, error: insErr } = await supabase
      .from("automation_sequences")
      .insert({
        dso_id: who.dsoId,
        name,
        created_by_dso_user_id: who.dsoUserId,
      })
      .select("id")
      .maybeSingle();
    if (insErr || !created) return { ok: false, error: "Couldn't create the sequence." };
    sequenceId = created.id as string;
  }

  // Replace the step set (delete + reinsert in order).
  await supabase.from("automation_sequence_steps").delete().eq("sequence_id", sequenceId);
  const rows = input.steps.map((s, i) => ({
    sequence_id: sequenceId as string,
    step_order: i,
    delay_days: Math.trunc(Number(s.delay_days)),
    subject: s.subject.trim(),
    body: s.body.trim(),
  }));
  const { error: stepErr2 } = await supabase
    .from("automation_sequence_steps")
    .insert(rows);
  if (stepErr2) return { ok: false, error: "Saved the sequence, but the steps didn't save. Try again." };

  revalidatePath("/employer/automations");
  return { ok: true, id: sequenceId };
}

export async function setSequenceEnabled(
  id: string,
  enabled: boolean
): Promise<SeqResult> {
  const who = await resolveActor();
  if (!who.ok) return who;
  if (!who.canManage) {
    return { ok: false, error: "You don't have permission to change sequences." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("automation_sequences")
    .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("dso_id", who.dsoId);
  if (error) return { ok: false, error: "Couldn't update the sequence." };
  revalidatePath("/employer/automations");
  return { ok: true };
}

export async function deleteSequence(id: string): Promise<SeqResult> {
  const who = await resolveActor();
  if (!who.ok) return who;
  if (!who.canManage) {
    return { ok: false, error: "You don't have permission to delete sequences." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("automation_sequences")
    .delete()
    .eq("id", id)
    .eq("dso_id", who.dsoId);
  if (error) return { ok: false, error: "Couldn't delete the sequence." };
  revalidatePath("/employer/automations");
  return { ok: true };
}

/** Manually enroll an application into a sequence (owner/admin/recruiter). */
export async function enrollInSequence(
  applicationId: string,
  sequenceId: string
): Promise<SeqResult> {
  const who = await resolveActor();
  if (!who.ok) return who;
  // #83 Phase 2 — enrolling a candidate in a drip is messaging them.
  if (!who.perms["apps.message"]) {
    return { ok: false, error: "You don't have permission to start sequences." };
  }
  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseSequences(supabase, who.dsoId))) {
    return { ok: false, error: "Drip sequences are a Scale feature." };
  }

  // Access check + current stage via RLS.
  const { data: app } = await supabase
    .from("applications")
    .select("id, stage_id, jobs:jobs!inner(dso_id)")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return { ok: false, error: "Application not found or access denied." };
  const jobsRel = (app as Record<string, unknown>).jobs as
    | { dso_id: string }
    | Array<{ dso_id: string }>
    | null;
  const job = Array.isArray(jobsRel) ? jobsRel[0] ?? null : jobsRel;
  if (!job || job.dso_id !== who.dsoId) {
    return { ok: false, error: "Application is outside your organization." };
  }

  // Don't enroll a candidate who would immediately auto-exit (they'd get no
  // emails + a confusing "stopped" result). Two of the three exits are
  // knowable up front: a delivered offer, or a closed/terminal stage.
  const { count: deliveredOffers } = await supabase
    .from("application_offer_sends")
    .select("id", { count: "exact", head: true })
    .eq("application_id", applicationId)
    .in("approval_status", ["not_required", "approved"]);
  if ((deliveredOffers ?? 0) > 0) {
    return {
      ok: false,
      error: "This candidate already has an offer out — a nurture sequence won't send to them.",
    };
  }
  const { data: stageRow } = await supabase
    .from("dso_pipeline_stages")
    .select("kind")
    .eq("id", app.stage_id as string)
    .maybeSingle();
  const stageKind = (stageRow?.kind as string | null) ?? null;
  if (stageKind && ["hired", "rejected", "withdrawn"].includes(stageKind)) {
    return {
      ok: false,
      error: "This candidate is in a closed stage — sequences are for active candidates.",
    };
  }

  // Sequence must belong to the DSO, be enabled, and have steps.
  const { data: seq } = await supabase
    .from("automation_sequences")
    .select("id, is_enabled")
    .eq("id", sequenceId)
    .eq("dso_id", who.dsoId)
    .maybeSingle();
  if (!seq || seq.is_enabled !== true) {
    return { ok: false, error: "That sequence isn't available." };
  }
  const { data: steps } = await supabase
    .from("automation_sequence_steps")
    .select("delay_days, step_order")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });
  const firstStep = (steps ?? [])[0] as { delay_days: number } | undefined;
  if (!firstStep) return { ok: false, error: "That sequence has no steps yet." };

  const admin = createSupabaseServiceRoleClient();
  const nowMs = Date.now();
  const nextSendAt = new Date(
    nowMs + Math.max(0, Number(firstStep.delay_days) || 0) * 86_400_000
  ).toISOString();
  const { error: enrErr } = await admin
    .from("automation_sequence_enrollments")
    .insert({
      sequence_id: sequenceId,
      application_id: applicationId,
      dso_id: who.dsoId,
      enrolled_by_dso_user_id: who.dsoUserId,
      enrolled_stage_id: (app.stage_id as string | null) ?? null,
      status: "active",
      current_step: 0,
      next_send_at: nextSendAt,
    });
  if (enrErr) {
    // 23505 = the partial unique (one active enrollment per application).
    if (enrErr.code === "23505") {
      return { ok: false, error: "This candidate is already in a sequence." };
    }
    return { ok: false, error: "Couldn't start the sequence. Try again." };
  }

  revalidatePath(`/employer/applications/${applicationId}`);
  return { ok: true };
}

/**
 * Manually enroll a PROSPECT (non-applicant) into a sequence (Sourcing CRM
 * Phase 3). Scale+ like applicant sequences. Binds to the prospect thread
 * (created if needed) so steps deliver in-app + as a no-reply nudge, and exits
 * auto-fire on reply / apply / opt-out / undiscoverable (see process.ts).
 */
export async function enrollProspectInSequence(
  candidateId: string,
  sequenceId: string
): Promise<SeqResult> {
  const who = await resolveActor();
  if (!who.ok) return who;
  // Enrolling a prospect in a drip is messaging them.
  if (!who.perms["sourcing.message"]) {
    return { ok: false, error: "You don't have permission to start sequences." };
  }
  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseSequences(supabase, who.dsoId))) {
    return { ok: false, error: "Drip sequences are a Scale feature." };
  }

  // Candidate must be reachable + not blocking this DSO.
  const { data: cand } = await supabase
    .from("candidates")
    .select("id, cv_visibility, is_guest, deleted_at")
    .eq("id", candidateId)
    .maybeSingle();
  if (
    !cand ||
    (cand.cv_visibility as string) === "hidden" ||
    cand.is_guest ||
    cand.deleted_at
  ) {
    return { ok: false, error: "This candidate isn't reachable right now." };
  }
  if (await isBlocked(supabase, who.dsoId, candidateId)) {
    return { ok: false, error: "This candidate isn't reachable right now." };
  }

  // Sequence must belong to the DSO, be enabled, and have steps.
  const { data: seq } = await supabase
    .from("automation_sequences")
    .select("id, is_enabled")
    .eq("id", sequenceId)
    .eq("dso_id", who.dsoId)
    .maybeSingle();
  if (!seq || seq.is_enabled !== true) {
    return { ok: false, error: "That sequence isn't available." };
  }
  const { data: steps } = await supabase
    .from("automation_sequence_steps")
    .select("delay_days, step_order")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });
  const firstStep = (steps ?? [])[0] as { delay_days: number } | undefined;
  if (!firstStep) return { ok: false, error: "That sequence has no steps yet." };

  // Get-or-create the prospect thread to bind the enrollment to.
  let threadId: string;
  const { data: existing } = await supabase
    .from("prospect_threads")
    .select("id, status")
    .eq("dso_id", who.dsoId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (existing) {
    if ((existing.status as string) === "blocked") {
      return { ok: false, error: "This candidate isn't reachable right now." };
    }
    threadId = existing.id as string;
  } else {
    const { data: created, error: tErr } = await supabase
      .from("prospect_threads")
      .insert({
        dso_id: who.dsoId,
        candidate_id: candidateId,
        created_by: who.dsoUserId,
        status: "active",
      })
      .select("id")
      .single();
    if (tErr || !created) {
      return { ok: false, error: "Couldn't open the conversation." };
    }
    threadId = created.id as string;
  }

  const admin = createSupabaseServiceRoleClient();
  const nextSendAt = new Date(
    Date.now() + Math.max(0, Number(firstStep.delay_days) || 0) * 86_400_000
  ).toISOString();
  const { error: enrErr } = await admin
    .from("automation_sequence_enrollments")
    .insert({
      sequence_id: sequenceId,
      subject_kind: "prospect",
      prospect_thread_id: threadId,
      application_id: null,
      dso_id: who.dsoId,
      enrolled_by_dso_user_id: who.dsoUserId,
      status: "active",
      current_step: 0,
      next_send_at: nextSendAt,
    });
  if (enrErr) {
    if (enrErr.code === "23505") {
      return { ok: false, error: "This prospect is already in a sequence." };
    }
    return { ok: false, error: "Couldn't start the sequence. Try again." };
  }

  revalidatePath(`/employer/talent-pool/prospects/${candidateId}`);
  return { ok: true };
}

/**
 * Owner/admin "Run now" — process this DSO's due sequence steps on demand
 * (so you don't have to wait for the hourly cron). Returns a short report.
 */
export async function runSequencesNow(): Promise<
  | {
      ok: true;
      sent: number;
      completed: number;
      exited: number;
      due: number;
      exitReasons: Record<string, number>;
    }
  | { ok: false; error: string }
> {
  const who = await resolveActor();
  if (!who.ok) return who;
  if (!who.canManage) {
    return { ok: false, error: "You don't have permission to run sequences." };
  }
  try {
    const r = await processDueSequences(who.dsoId);
    revalidatePath("/employer/automations");
    return {
      ok: true,
      sent: r.sent,
      completed: r.completed,
      exited: r.exited,
      due: r.due,
      exitReasons: r.exitReasons,
    };
  } catch (err) {
    console.warn("[sequences] run-now failed", err);
    return { ok: false, error: "Couldn't run sequences right now. Try again." };
  }
}

export async function stopEnrollment(enrollmentId: string): Promise<SeqResult> {
  const who = await resolveActor();
  if (!who.ok) return who;
  // #83 Phase 2 — same capability as starting one.
  if (!who.perms["apps.message"]) {
    return { ok: false, error: "You don't have permission to stop sequences." };
  }
  const admin = createSupabaseServiceRoleClient();
  const { data: enr } = await admin
    .from("automation_sequence_enrollments")
    .select("id, dso_id, application_id, status")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (!enr || enr.dso_id !== who.dsoId) {
    return { ok: false, error: "Enrollment not found." };
  }
  if (enr.status !== "active") {
    return { ok: false, error: "This sequence isn't running." };
  }
  const { error } = await admin
    .from("automation_sequence_enrollments")
    .update({
      status: "exited",
      exit_reason: "manual",
      exited_at: new Date().toISOString(),
      next_send_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId)
    .eq("status", "active");
  if (error) return { ok: false, error: "Couldn't stop the sequence." };
  revalidatePath(`/employer/applications/${enr.application_id as string}`);
  return { ok: true };
}
