"use server";

/**
 * Guest apply server action (E2.1 / Phase 5F, shipped 2026-05-11).
 *
 * Parallel to /jobs/[id]/apply/actions.ts (applyToJob) but supports
 * unauthenticated applications:
 *   - email + name collected explicitly
 *   - candidate row inserted via service role with is_guest=true and
 *     auth_user_id=null
 *   - application inserted via service role
 *   - resume uploaded to a guest-keyed path
 *   - confirmation email sent with a "Claim your account" magic-link
 *     that triggers /auth/callback → links auth_user_id to the existing
 *     guest candidate row (matched by lower(email)).
 *
 * If a guest candidate with this email already exists, we re-use the row
 * (don't insert a duplicate). If they've already applied to this job as a
 * guest, we update the application (idempotent) — same shape as the
 * authenticated path.
 *
 * Honeypot: a `website` field is expected to be empty. Bots fill it; we
 * return a fake success.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { ApplicationReceived } from "@/emails/candidate/ApplicationReceived";
import { NewApplication } from "@/emails/employer/NewApplication";
import type { ScreeningQuestion } from "../types";
import { isKnockoutFailure } from "@/lib/screening/evaluate-knockout";

export interface GuestApplyState {
  ok: boolean;
  error?: string;
  message?: string;
  email?: string;
}

const RESUME_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const RESUME_MAX_BYTES = 10 * 1024 * 1024;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const CLAIM_TTL_DAYS = 90;

const initialAnswerEmpty: AnswerValue = {};
type AnswerValue =
  | { text?: string | null }
  | { choice?: string | null }
  | { choices?: string[] }
  | { number?: number | null };

function hasAnswer(a: AnswerValue | undefined): boolean {
  if (!a) return false;
  const t = (a as { text?: string }).text;
  if (typeof t === "string" && t.trim() !== "") return true;
  const c = (a as { choice?: string }).choice;
  if (typeof c === "string" && c.trim() !== "") return true;
  const cs = (a as { choices?: string[] }).choices;
  if (Array.isArray(cs) && cs.length > 0) return true;
  const n = (a as { number?: number }).number;
  if (typeof n === "number" && !Number.isNaN(n)) return true;
  return false;
}

function parseAnswers(
  questions: ScreeningQuestion[],
  formData: FormData
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const q of questions) {
    const key = `q__${q.id}`;
    if (q.kind === "multi_select") {
      const values = formData.getAll(key).map((v) => String(v));
      out[q.id] = { choices: values };
    } else if (q.kind === "number") {
      const v = formData.get(key);
      const n = v == null || v === "" ? null : Number(v);
      out[q.id] = { number: typeof n === "number" && !Number.isNaN(n) ? n : null };
    } else if (q.kind === "single_select" || q.kind === "yes_no") {
      const v = formData.get(key);
      out[q.id] = { choice: v == null ? null : String(v) };
    } else {
      const v = formData.get(key);
      out[q.id] = { text: v == null ? null : String(v) };
    }
  }
  void initialAnswerEmpty;
  return out;
}

export async function submitGuestApplication(
  _prev: GuestApplyState,
  formData: FormData
): Promise<GuestApplyState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const coverLetter = String(formData.get("cover_letter") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const sourceTag =
    String(formData.get("source") ?? "").trim().slice(0, 64) || null;
  const honeypot = String(formData.get("website") ?? "").trim();
  const resumeFile = formData.get("resume") as File | null;

  if (honeypot) {
    return { ok: true, email, message: "Application submitted." };
  }

  if (!jobId) return { ok: false, error: "Missing job reference." };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!fullName) {
    return { ok: false, error: "Please enter your full name." };
  }

  const admin = createSupabaseServiceRoleClient();

  // 1. Verify the job is active.
  const { data: job, error: jobErr } = await admin
    .from("jobs")
    .select("id, dso_id, title, status, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (jobErr || !job || (job.status as string) !== "active" || job.deleted_at) {
    return { ok: false, error: "This job is no longer accepting applications." };
  }

  // 2. Block guest apply if an AUTH candidate already exists with this email.
  // (Their account exists; they should sign in to apply, not create a
  // duplicate guest row.)
  const { data: { users: existingUsers } = { users: [] } } =
    await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  void existingUsers;
  const { data: matchingAuthCandidate } = await admin
    .from("candidates")
    .select("id, auth_user_id")
    .eq("email", email)
    .eq("is_guest", false)
    .maybeSingle();
  if (matchingAuthCandidate) {
    return {
      ok: false,
      error:
        "You already have an account with this email. Sign in to apply (we'll bring you back to this job).",
    };
  }

  // 3. Get-or-create the guest candidate row.
  let candidateId: string;
  let createdGuest = false;
  const { data: existingGuest } = await admin
    .from("candidates")
    .select("id, resume_url")
    .ilike("email", email)
    .eq("is_guest", true)
    .maybeSingle();

  if (existingGuest) {
    candidateId = existingGuest.id as string;
    // Refresh the claim window every time the guest re-applies.
    await admin
      .from("candidates")
      .update({
        full_name: fullName,
        phone: phone || null,
        claim_expires_at: new Date(
          Date.now() + CLAIM_TTL_DAYS * 86400 * 1000
        ).toISOString(),
      })
      .eq("id", candidateId);
  } else {
    const { data: inserted, error: insertErr } = await admin
      .from("candidates")
      .insert({
        auth_user_id: null,
        email,
        full_name: fullName,
        phone: phone || null,
        is_guest: true,
        claim_expires_at: new Date(
          Date.now() + CLAIM_TTL_DAYS * 86400 * 1000
        ).toISOString(),
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.warn("[guest-apply] candidate insert failed", insertErr);
      return { ok: false, error: "Couldn't create your guest profile." };
    }
    candidateId = inserted.id as string;
    createdGuest = true;
  }

  // 4. Pull screening questions + validate.
  // E2.10 — same knockout fields pulled here so the guest apply flow
  // gets the same soft-knockout tagging.
  const { data: rawQuestions } = await admin
    .from("job_screening_questions")
    .select(
      "id, prompt, helper_text, kind, options, required, sort_order, knockout, knockout_correct_answer"
    )
    .eq("job_id", jobId);
  const questions = (rawQuestions ?? []) as unknown as ScreeningQuestion[];
  const answersByQuestion = parseAnswers(questions, formData);
  const missingRequired = questions.find(
    (q) => q.required && !hasAnswer(answersByQuestion[q.id])
  );
  if (missingRequired) {
    return {
      ok: false,
      error: `Please answer the required question: "${missingRequired.prompt.slice(0, 80)}"`,
    };
  }

  // 5. Resume upload — guest path uses candidate-id-keyed storage path
  // (no auth.uid() available). The `resumes` bucket policy is service-
  // role-friendly since we use the admin client.
  let resumeUrl: string | null = (existingGuest?.resume_url as string | null) ?? null;
  if (resumeFile && resumeFile.size > 0) {
    if (!RESUME_MIME.has(resumeFile.type)) {
      return {
        ok: false,
        error: "Resume must be a PDF or Word document (.pdf, .doc, .docx).",
      };
    }
    if (resumeFile.size > RESUME_MAX_BYTES) {
      return { ok: false, error: "Resume too large (max 10 MB)." };
    }
    const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `guest/${candidateId}/${Date.now()}-${safeName}`;
    const arrayBuffer = await resumeFile.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from("resumes")
      .upload(path, arrayBuffer, {
        contentType: resumeFile.type,
        upsert: false,
      });
    if (uploadErr) {
      console.warn("[guest-apply] resume upload failed", uploadErr);
    } else {
      resumeUrl = path;
      if (!existingGuest?.resume_url) {
        await admin
          .from("candidates")
          .update({ resume_url: path })
          .eq("id", candidateId);
      }
    }
  }

  // 6. Application — idempotent on (job_id, candidate_id).
  const { data: priorApp } = await admin
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  // Resolve the job's DSO and its default 'open'-kind stage so re-applies
  // can flip the application back to the open stage (the original insert
  // gets stage_id auto-filled by the BEFORE INSERT trigger).
  let openStageId: string | null = null;
  {
    const { data: jobRow } = await admin
      .from("jobs")
      .select("dso_id")
      .eq("id", jobId)
      .maybeSingle();
    const dsoId = (jobRow as { dso_id: string } | null)?.dso_id ?? null;
    if (dsoId) {
      const { data: stageRow } = await admin
        .from("dso_pipeline_stages")
        .select("id")
        .eq("dso_id", dsoId)
        .eq("kind", "open")
        .eq("is_default", true)
        .maybeSingle();
      openStageId = (stageRow as { id: string } | null)?.id ?? null;
    }
  }
  let applicationId: string;
  if (priorApp) {
    applicationId = priorApp.id as string;
    await admin
      .from("applications")
      .update({
        cover_letter: coverLetter || null,
        resume_url: resumeUrl,
        ...(openStageId ? { stage_id: openStageId } : {}),
        ...(sourceTag ? { source: sourceTag } : {}),
      })
      .eq("id", applicationId);
  } else {
    // stage_id auto-filled by the applications_fill_default_stage trigger.
    const { data: inserted, error: appErr } = await admin
      .from("applications")
      .insert({
        job_id: jobId,
        candidate_id: candidateId,
        cover_letter: coverLetter || null,
        resume_url: resumeUrl,
        source: sourceTag,
      })
      .select("id")
      .single();
    if (appErr || !inserted) {
      console.warn("[guest-apply] application insert failed", appErr);
      return { ok: false, error: "Couldn't submit your application." };
    }
    applicationId = inserted.id as string;
  }

  // 7. Screening answers — delete + insert to keep idempotent.
  await admin
    .from("application_screening_answers")
    .delete()
    .eq("application_id", applicationId);
  const answerRows: Array<Record<string, unknown>> = [];
  for (const q of questions) {
    const a = answersByQuestion[q.id];
    if (!hasAnswer(a)) continue;
    const t = (a as { text?: string }).text;
    const c = (a as { choice?: string }).choice;
    const cs = (a as { choices?: string[] }).choices;
    const n = (a as { number?: number }).number;
    answerRows.push({
      application_id: applicationId,
      question_id: q.id,
      answer_text: typeof t === "string" ? t : null,
      answer_choice: typeof c === "string" ? c : null,
      answer_choices: Array.isArray(cs) && cs.length > 0 ? cs : null,
      answer_number: typeof n === "number" ? n : null,
    });
  }
  if (answerRows.length > 0) {
    await admin.from("application_screening_answers").insert(answerRows);
  }

  // E2.10 — soft knockout evaluation (same flow as the auth'd apply path).
  // Guest applications can also fail knockouts; the recruiter sees the
  // chip in the kanban regardless of whether the candidate ever claimed
  // the account. Failures truncated at 80 chars to bound chip width.
  const knockoutQuestions = questions.filter(
    (q) =>
      (q as ScreeningQuestion & { knockout?: boolean }).knockout === true
  );
  if (knockoutQuestions.length > 0) {
    const failedPrompts: string[] = [];
    for (const q of knockoutQuestions) {
      const correctAnswer = (q as ScreeningQuestion & {
        knockout_correct_answer?: unknown;
      }).knockout_correct_answer;
      const candidateAnswer = answersByQuestion[q.id];
      if (
        isKnockoutFailure(correctAnswer, candidateAnswer, q.kind as string)
      ) {
        const truncated =
          q.prompt.length > 80 ? q.prompt.slice(0, 77) + "..." : q.prompt;
        failedPrompts.push(truncated);
      }
    }
    if (failedPrompts.length > 0) {
      const { error: koError } = await admin
        .from("applications")
        .update({
          knockout_failed_questions: failedPrompts,
          knockout_failed_at: new Date().toISOString(),
        })
        .eq("id", applicationId);
      if (koError) {
        console.warn("[guest-apply] knockout tag write failed:", koError);
      }
    }
  }

  // 8. Emails — fire-and-forget. Guest path doesn't have an auth.users
  // row yet, so we use dispatchNotification directly with `userId: null`
  // and an explicit `to:` address. (The notification orchestrator's
  // user-preference check is skipped when userId is null.)
  const claimUrl = `${SITE_URL}/candidate/claim?email=${encodeURIComponent(email)}&next=${encodeURIComponent("/candidate/dashboard")}`;
  const { data: dsoRow } = await admin
    .from("dsos")
    .select("name")
    .eq("id", job.dso_id as string)
    .maybeSingle();
  const dsoName = (dsoRow?.name as string | undefined) ?? "the practice";

  void sendEmail({
    to: email,
    subject: `Application received: ${job.title as string}`,
    template: "candidate.application_received.guest",
    replyTo: "cam@dsohire.com",
    relatedDsoId: job.dso_id as string,
    relatedCandidateId: candidateId,
    react: ApplicationReceived({
      candidateName: fullName,
      jobTitle: job.title as string,
      dsoName,
      trackingUrl: claimUrl,
    }),
  });

  // Notify DSO members.
  void (async () => {
    try {
      const { data: members } = await admin
        .from("dso_users")
        .select("auth_user_id, full_name")
        .eq("dso_id", job.dso_id as string);
      const recipients = (members ?? []) as Array<{
        auth_user_id: string;
        full_name: string | null;
      }>;
      const employerApplicationUrl = `${SITE_URL}/employer/applications/${applicationId}`;
      for (const m of recipients) {
        try {
          const res = await admin.auth.admin.getUserById(m.auth_user_id);
          const memberEmail = res.data?.user?.email ?? null;
          if (!memberEmail) continue;
          void dispatchNotification({
            userId: m.auth_user_id,
            eventKind: "employer.new_application",
            relatedDsoId: job.dso_id as string,
            relatedCandidateId: candidateId,
            email: {
              to: memberEmail,
              subject: `New application: ${job.title as string} · ${dsoName}`,
              react: NewApplication({
                recipientName: m.full_name?.split(" ")[0] || "there",
                candidateName: fullName,
                candidateEmail: email,
                jobTitle: job.title as string,
                applicationUrl: employerApplicationUrl,
              }),
            },
          });
        } catch (err) {
          console.warn("[guest-apply] notify member failed", err);
        }
      }
    } catch (err) {
      console.warn("[guest-apply] employer notify failed", err);
    }
  })();

  revalidatePath(`/jobs/${jobId}`);
  return {
    ok: true,
    email,
    message: createdGuest
      ? "Application submitted. Check your inbox to claim your account."
      : "Application submitted. We've updated your existing guest profile.",
  };
}
