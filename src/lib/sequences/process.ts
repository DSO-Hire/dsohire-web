/**
 * N16 v2 — drip-sequence processor (cron core). Server-only; service-role.
 *
 * For each ACTIVE enrollment whose next step is due, we:
 *   1. Re-check the sequence is still enabled.
 *   2. Check the automatic EXIT conditions (candidate replied, stage moved
 *      off the enrolled stage, or an offer was sent) — if any, exit quietly.
 *   3. Claim the step in the sends ledger (idempotent — unique per
 *      enrollment+step), then send that step's nurture email.
 *   4. Advance to the next step (scheduling next_send_at from its delay) or
 *      mark the enrollment completed when the steps run out.
 *
 * Drips are intentionally low-stakes: we claim-then-send so a crash can at
 * worst drop one email rather than double-send.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { resolveCandidateReplyTo } from "@/lib/email/candidate-reply-to";
import { NurtureMessage } from "@/emails/candidate/NurtureMessage";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const MAX_PER_RUN = 500;

type Admin = ReturnType<typeof createSupabaseServiceRoleClient>;

export interface ProcessResult {
  due: number;
  sent: number;
  completed: number;
  exited: number;
  skipped: number;
}

interface EnrollmentRow {
  id: string;
  sequence_id: string;
  application_id: string;
  dso_id: string;
  enrolled_at: string;
  enrolled_stage_id: string | null;
  current_step: number;
}

interface StepRow {
  id: string;
  step_order: number;
  delay_days: number;
  subject: string;
  body: string;
}

export async function processDueSequences(
  /** Optional DSO scope — used by the owner-triggered "Run now" button so it
   *  only processes the caller's org. The cron passes nothing (all DSOs). */
  dsoId?: string
): Promise<ProcessResult> {
  const admin = createSupabaseServiceRoleClient();
  const nowIso = new Date().toISOString();
  const result: ProcessResult = { due: 0, sent: 0, completed: 0, exited: 0, skipped: 0 };

  let query = admin
    .from("automation_sequence_enrollments")
    .select(
      "id, sequence_id, application_id, dso_id, enrolled_at, enrolled_stage_id, current_step"
    )
    .eq("status", "active")
    .lte("next_send_at", nowIso)
    .order("next_send_at", { ascending: true })
    .limit(MAX_PER_RUN);
  if (dsoId) query = query.eq("dso_id", dsoId);
  const { data: dueRows, error } = await query;
  if (error) {
    console.warn("[sequences] due query failed", error);
    return result;
  }
  const enrollments = (dueRows ?? []) as EnrollmentRow[];
  result.due = enrollments.length;

  for (const enr of enrollments) {
    try {
      await processOne(admin, enr, result);
    } catch (err) {
      result.skipped += 1;
      console.warn("[sequences] enrollment processing failed", enr.id, err);
    }
  }
  return result;
}

async function processOne(
  admin: Admin,
  enr: EnrollmentRow,
  result: ProcessResult
): Promise<void> {
  // Sequence still enabled?
  const { data: seq } = await admin
    .from("automation_sequences")
    .select("id, is_enabled")
    .eq("id", enr.sequence_id)
    .maybeSingle();
  if (!seq || seq.is_enabled !== true) {
    await exitEnrollment(admin, enr.id, "sequence_disabled");
    result.exited += 1;
    return;
  }

  // Automatic exit conditions.
  const exitReason = await checkExit(admin, enr);
  if (exitReason) {
    await exitEnrollment(admin, enr.id, exitReason);
    result.exited += 1;
    return;
  }

  // Steps in order.
  const { data: stepRows } = await admin
    .from("automation_sequence_steps")
    .select("id, step_order, delay_days, subject, body")
    .eq("sequence_id", enr.sequence_id)
    .order("step_order", { ascending: true });
  const steps = (stepRows ?? []) as StepRow[];

  const step = steps[enr.current_step];
  if (!step) {
    // Ran out of steps → done.
    await admin
      .from("automation_sequence_enrollments")
      .update({
        status: "completed",
        next_send_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", enr.id)
      .eq("status", "active");
    result.completed += 1;
    return;
  }

  // Claim the step (idempotent) BEFORE sending.
  const { error: claimErr } = await admin
    .from("automation_sequence_sends")
    .insert({ enrollment_id: enr.id, step_id: step.id });
  const alreadySent = claimErr?.code === "23505";
  if (claimErr && !alreadySent) {
    result.skipped += 1;
    console.warn("[sequences] ledger claim failed", enr.id, claimErr);
    return;
  }

  if (!alreadySent) {
    const sendOutcome = await sendStep(admin, enr, step);
    if (sendOutcome === "no_recipient") {
      // Candidate can't receive email (guest / no address) — the whole
      // sequence is undeliverable; exit instead of looping forever.
      await exitEnrollment(admin, enr.id, "no_candidate_email");
      result.exited += 1;
      return;
    }
    result.sent += 1;
  }

  // Advance to the next step or complete.
  const nextStep = steps[enr.current_step + 1];
  const nowMs = Date.now();
  if (nextStep) {
    await admin
      .from("automation_sequence_enrollments")
      .update({
        current_step: enr.current_step + 1,
        last_sent_at: new Date().toISOString(),
        next_send_at: new Date(nowMs + nextStep.delay_days * 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", enr.id)
      .eq("status", "active");
  } else {
    await admin
      .from("automation_sequence_enrollments")
      .update({
        current_step: enr.current_step + 1,
        last_sent_at: new Date().toISOString(),
        status: "completed",
        next_send_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", enr.id)
      .eq("status", "active");
    result.completed += 1;
  }
}

/** Returns an exit reason string if the sequence should stop, else null. */
async function checkExit(admin: Admin, enr: EnrollmentRow): Promise<string | null> {
  const { data: app } = await admin
    .from("applications")
    .select("id, stage_id")
    .eq("id", enr.application_id)
    .maybeSingle();
  if (!app) return "application_gone";

  // Stage moved off the stage the candidate was in at enrollment.
  if (enr.enrolled_stage_id && (app.stage_id as string) !== enr.enrolled_stage_id) {
    return "stage_changed";
  }

  // Candidate replied since enrollment.
  const { count: replyCount } = await admin
    .from("application_messages")
    .select("id", { count: "exact", head: true })
    .eq("application_id", enr.application_id)
    .eq("sender_role", "candidate")
    .gte("created_at", enr.enrolled_at);
  if ((replyCount ?? 0) > 0) return "replied";

  // An offer has actually gone out (delivered, not a pending/rejected draft).
  const { count: offerCount } = await admin
    .from("application_offer_sends")
    .select("id", { count: "exact", head: true })
    .eq("application_id", enr.application_id)
    .in("approval_status", ["not_required", "approved"]);
  if ((offerCount ?? 0) > 0) return "offer_sent";

  return null;
}

type SendOutcome = "sent" | "no_recipient";

async function sendStep(
  admin: Admin,
  enr: EnrollmentRow,
  step: StepRow
): Promise<SendOutcome> {
  // Candidate + job context (mirrors runNurtureEmail).
  const { data: app } = await admin
    .from("applications")
    .select("id, candidate_id, job_id")
    .eq("id", enr.application_id)
    .maybeSingle();
  const candidateId = (app?.candidate_id as string | null) ?? null;
  const jobId = (app?.job_id as string | null) ?? null;
  if (!candidateId) return "no_recipient";

  const { data: cand } = await admin
    .from("candidates")
    .select("first_name, full_name, auth_user_id")
    .eq("id", candidateId)
    .maybeSingle();
  const authUserId = (cand?.auth_user_id as string | null) ?? null;
  if (!authUserId) return "no_recipient";
  const { data: authResp } = await admin.auth.admin.getUserById(authUserId);
  const email = authResp?.user?.email;
  if (!email) return "no_recipient";

  const firstName =
    (cand?.first_name as string | null) ??
    ((cand?.full_name as string | null) ?? "there").split(" ")[0] ??
    "there";

  const { data: jobRow } = jobId
    ? await admin.from("jobs").select("title").eq("id", jobId).maybeSingle()
    : { data: null };
  const jobTitle = (jobRow?.title as string | null) ?? "the role";

  const { data: dsoRow } = await admin
    .from("dsos")
    .select("name")
    .eq("id", enr.dso_id)
    .maybeSingle();
  const dsoName = (dsoRow?.name as string | undefined) ?? "the hiring team";

  const fill = (s: string) =>
    s.replaceAll("{{first_name}}", firstName).replaceAll("{{job_title}}", jobTitle);
  const applicationUrl = `${SITE_URL}/candidate/applications/${enr.application_id}`;
  const replyTo = await resolveCandidateReplyTo(enr.dso_id);

  await dispatchNotification({
    userId: authUserId,
    eventKind: "candidate.nurture",
    relatedDsoId: enr.dso_id,
    relatedCandidateId: candidateId,
    email: {
      to: email,
      subject: fill(step.subject),
      replyTo,
      react: NurtureMessage({
        recipientName: firstName,
        dsoName,
        jobTitle,
        messageBody: fill(step.body),
        applicationUrl,
      }),
    },
  });
  return "sent";
}

async function exitEnrollment(
  admin: Admin,
  enrollmentId: string,
  reason: string
): Promise<void> {
  await admin
    .from("automation_sequence_enrollments")
    .update({
      status: "exited",
      exit_reason: reason,
      exited_at: new Date().toISOString(),
      next_send_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", enrollmentId)
    .eq("status", "active");
}
