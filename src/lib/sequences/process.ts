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
import { getDisplayedDsoName } from "@/lib/dso/affiliation-display";
import { NurtureMessage } from "@/emails/candidate/NurtureMessage";
import { ProspectInterest } from "@/emails/candidate/ProspectInterest";
import { getDsoAppliedCandidateIds } from "@/lib/candidate/anonymity";
import { logProspectActivity } from "@/lib/sourcing/pipeline";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const MAX_PER_RUN = 500;

type Admin = ReturnType<typeof createSupabaseServiceRoleClient>;

export interface ProcessResult {
  due: number;
  sent: number;
  completed: number;
  exited: number;
  skipped: number;
  /** Count of each auto-exit reason this run (replied / stage_changed / …). */
  exitReasons: Record<string, number>;
}

interface EnrollmentRow {
  id: string;
  sequence_id: string;
  application_id: string | null;
  dso_id: string;
  enrolled_at: string;
  enrolled_stage_id: string | null;
  current_step: number;
  subject_kind: string;
  prospect_thread_id: string | null;
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
  const result: ProcessResult = {
    due: 0,
    sent: 0,
    completed: 0,
    exited: 0,
    skipped: 0,
    exitReasons: {},
  };

  let query = admin
    .from("automation_sequence_enrollments")
    .select(
      "id, sequence_id, application_id, dso_id, enrolled_at, enrolled_stage_id, current_step, subject_kind, prospect_thread_id"
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
    result.exitReasons.sequence_disabled = (result.exitReasons.sequence_disabled ?? 0) + 1;
    return;
  }

  // Automatic exit conditions.
  const exitReason = await checkExit(admin, enr);
  if (exitReason) {
    await exitEnrollment(admin, enr.id, exitReason);
    result.exited += 1;
    result.exitReasons[exitReason] = (result.exitReasons[exitReason] ?? 0) + 1;
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
      result.exitReasons.no_candidate_email = (result.exitReasons.no_candidate_email ?? 0) + 1;
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
  if (enr.subject_kind === "prospect") return checkProspectExit(admin, enr);

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
  if (enr.subject_kind === "prospect") return sendProspectStep(admin, enr, step);

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

  const fullName = ((cand?.full_name as string | null) ?? "").trim();
  const nameParts = fullName ? fullName.split(/\s+/) : [];
  const firstName =
    (cand?.first_name as string | null) ?? nameParts[0] ?? "there";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  const { data: jobRow } = jobId
    ? await admin.from("jobs").select("title").eq("id", jobId).maybeSingle()
    : { data: null };
  const jobTitle = (jobRow?.title as string | null) ?? "the role";

  // Affiliation-masked name — candidate sees the PRACTICE name, never the
  // corporate DSO, when masking is on. Raw dsos.name was an affiliation leak.
  let dsoName = "the hiring team";
  try {
    const displayed = await getDisplayedDsoName({
      jobId: jobId ?? "",
      viewer: { role: "candidate", applicationId: enr.application_id as string },
    });
    if (displayed.name) dsoName = displayed.name;
  } catch (e) {
    console.warn("[sequences] dso name resolve failed", e);
  }

  const fill = (s: string) =>
    s
      .replaceAll("{{first_name}}", firstName)
      .replaceAll("{{last_name}}", lastName)
      .replaceAll("{{job_title}}", jobTitle)
      .replaceAll("{{practice_name}}", dsoName);
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

/* ───── Prospect (Sourcing CRM) branch ───── */

/** Exit conditions for a prospect enrollment (no application context). */
async function checkProspectExit(
  admin: Admin,
  enr: EnrollmentRow
): Promise<string | null> {
  if (!enr.prospect_thread_id) return "thread_gone";

  const { data: thread } = await admin
    .from("prospect_threads")
    .select("id, candidate_id, dso_id, status")
    .eq("id", enr.prospect_thread_id)
    .maybeSingle();
  if (!thread) return "thread_gone";

  // Candidate muted or blocked → opted out (block also removes from discovery).
  const status = (thread.status as string) ?? "active";
  if (status === "muted" || status === "blocked") return "opted_out";

  const candidateId = thread.candidate_id as string;
  const dsoId = thread.dso_id as string;

  // Candidate replied in the thread since enrollment.
  const { count: replyCount } = await admin
    .from("prospect_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", enr.prospect_thread_id)
    .eq("sender_role", "candidate")
    .gte("created_at", enr.enrolled_at);
  if ((replyCount ?? 0) > 0) return "replied";

  // Candidate applied to one of this DSO's jobs → convert + exit.
  const applied = await getDsoAppliedCandidateIds(admin, dsoId, [candidateId]);
  if (applied.has(candidateId)) {
    await convertProspect(admin, thread.id as string, dsoId, candidateId);
    return "applied";
  }

  // No longer discoverable (candidate hid their profile or left).
  const { data: cand } = await admin
    .from("candidates")
    .select("cv_visibility, is_guest, deleted_at")
    .eq("id", candidateId)
    .maybeSingle();
  if (
    !cand ||
    (cand.cv_visibility as string) === "hidden" ||
    cand.is_guest === true ||
    cand.deleted_at
  ) {
    return "not_discoverable";
  }

  return null;
}

/** Mark a prospect converted: link the application, flip thread + pool stage. */
async function convertProspect(
  admin: Admin,
  threadId: string,
  dsoId: string,
  candidateId: string
): Promise<void> {
  // Find one of this DSO's applications from this candidate to associate.
  const { data: jobRows } = await admin
    .from("jobs")
    .select("id")
    .eq("dso_id", dsoId);
  const jobIds = ((jobRows ?? []) as Array<{ id: string }>).map((j) => j.id);
  let applicationId: string | null = null;
  if (jobIds.length > 0) {
    const { data: appRow } = await admin
      .from("applications")
      .select("id")
      .eq("candidate_id", candidateId)
      .in("job_id", jobIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    applicationId = (appRow?.id as string | null) ?? null;
  }
  await admin
    .from("prospect_threads")
    .update({
      status: "converted",
      application_id: applicationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);
  await admin
    .from("dso_talent_pool_entries")
    .update({ pipeline_stage: "converted", last_activity_at: new Date().toISOString() })
    .eq("dso_id", dsoId)
    .eq("candidate_id", candidateId);
  await logProspectActivity(admin, {
    dsoId,
    candidateId,
    kind: "converted",
    metadata: { thread_id: threadId, application_id: applicationId },
  });
}

/** Deliver a prospect nurture step into the thread + a no-reply email nudge. */
async function sendProspectStep(
  admin: Admin,
  enr: EnrollmentRow,
  step: StepRow
): Promise<SendOutcome> {
  if (!enr.prospect_thread_id) return "no_recipient";
  const { data: thread } = await admin
    .from("prospect_threads")
    .select("id, candidate_id, dso_id, candidate_revealed")
    .eq("id", enr.prospect_thread_id)
    .maybeSingle();
  if (!thread) return "no_recipient";
  const candidateId = thread.candidate_id as string;
  const dsoId = thread.dso_id as string;

  const { data: cand } = await admin
    .from("candidates")
    .select("first_name, full_name, auth_user_id, anonymous_mode")
    .eq("id", candidateId)
    .maybeSingle();
  const authUserId = (cand?.auth_user_id as string | null) ?? null;
  if (!authUserId) return "no_recipient";
  const { data: authResp } = await admin.auth.admin.getUserById(authUserId);
  const email = authResp?.user?.email;
  if (!email) return "no_recipient";

  // Masking: anonymous + not applied + not revealed → neutral greeting, never
  // the real name in the DSO-visible thread message.
  const applied = await getDsoAppliedCandidateIds(admin, dsoId, [candidateId]);
  const masked =
    Boolean(cand?.anonymous_mode) &&
    !applied.has(candidateId) &&
    !Boolean(thread.candidate_revealed);
  const firstName = masked
    ? "there"
    : ((cand?.first_name as string | null) ??
        ((cand?.full_name as string | null) ?? "").trim().split(/\s+/)[0] ??
        "there");

  // DSO name reveals to the candidate on outbound (the #52 first-outbound rule).
  const { data: dso } = await admin
    .from("dsos")
    .select("name")
    .eq("id", dsoId)
    .maybeSingle();
  const dsoName = (dso?.name as string | null) ?? "A dental group";

  const fill = (s: string) =>
    s
      .replaceAll("{{first_name}}", firstName)
      .replaceAll("{{last_name}}", "")
      .replaceAll("{{job_title}}", "")
      .replaceAll("{{practice_name}}", dsoName);
  const filledBody = fill(step.body);

  // In-app thread message (service role bypasses RLS).
  await admin.from("prospect_messages").insert({
    thread_id: enr.prospect_thread_id,
    sender_role: "dso",
    body: filledBody,
  });
  await admin
    .from("prospect_threads")
    .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", enr.prospect_thread_id);
  await logProspectActivity(admin, {
    dsoId,
    candidateId,
    kind: "outreach_sent",
    metadata: { thread_id: enr.prospect_thread_id, sequence_id: enr.sequence_id },
  });

  // No-reply email nudge (replies happen in-app only).
  await dispatchNotification({
    userId: authUserId,
    eventKind: "prospect.interested_nudge",
    relatedDsoId: dsoId,
    relatedCandidateId: candidateId,
    email: {
      to: email,
      subject: fill(step.subject) || `${dsoName} is interested in you on DSO Hire`,
      react: ProspectInterest({
        dsoName,
        messageBody: filledBody,
        threadUrl: `${SITE_URL}/candidate/prospects/${enr.prospect_thread_id}`,
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
