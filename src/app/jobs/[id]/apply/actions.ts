"use server";

/**
 * /jobs/[id]/apply server action.
 *
 * Creates the application row + uploads the resume (if provided) to the
 * `resumes` Supabase Storage bucket at path `${auth_user_id}/${timestamp}-${filename}`.
 *
 * Idempotency: if an application for (job_id, candidate_id) already exists,
 * we update its cover_letter + resume_url instead of inserting again. Any
 * existing screening-question answers are upserted (delete+insert) to match
 * the new submission.
 *
 * Screening answers arrive as form fields named:
 *   q__${questionId}                    — text/yes_no/single/number (string)
 *   q__${questionId}                    — multi_select (repeated, formData.getAll)
 * The action looks up each question's kind to know how to interpret the value.
 *
 * Side effects (fire-and-forget — never block apply success):
 *   - Email candidate confirmation (ApplicationReceived)
 *   - Email all DSO members of the new application (NewApplication)
 *   Both sends are logged to email_log via lib/email/send.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { dispatchNotification } from "@/lib/notifications/dispatcher";
import { dispatchCandidateEmail } from "@/lib/email/templates/dispatch";
import { dispatchInboxSystemMessage } from "@/lib/inbox/dispatch-system";
import { after } from "next/server";
import { runAutomationsForEvent } from "@/lib/automations/engine";
import { resolveCandidateReplyTo } from "@/lib/email/candidate-reply-to";
import { ApplicationReceived } from "@/emails/candidate/ApplicationReceived";
import { NewApplication } from "@/emails/employer/NewApplication";
import type { ScreeningQuestion } from "./types";
import { composeName } from "@/lib/candidate/name";
import { isKnockoutFailure } from "@/lib/screening/evaluate-knockout";
import {
  isVerificationType,
  getVerificationType,
} from "@/lib/verifications/types";

export interface ApplyState {
  ok: boolean;
  error?: string;
  message?: string;
  alreadyApplied?: boolean;
  /** Set on success — lets the wizard link straight to the new application. */
  applicationId?: string;
}

const RESUME_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const RESUME_MAX_BYTES = 10 * 1024 * 1024; // 10 MB — must match storage.buckets

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export async function applyToJob(
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  const jobId = String(formData.get("job_id") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const coverLetter = String(formData.get("cover_letter") ?? "").trim();
  const sourceTag =
    String(formData.get("source") ?? "").trim().slice(0, 64) || null;
  const resumeFile = formData.get("resume") as File | null;

  if (!jobId) {
    return { ok: false, error: "Missing job reference. Please try again." };
  }

  if (!firstName || !lastName) {
    return {
      ok: false,
      error:
        "Please enter your first and last name before submitting your application.",
    };
  }

  const supabase = await createSupabaseServerClient();

  // Auth — must be a signed-in candidate
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your session expired. Please sign in again.",
    };
  }

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, first_name, last_name, headline, resume_url")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return {
      ok: false,
      error: "Your candidate profile is missing. Please sign up first.",
    };
  }

  // Persist first/last name back to the candidate row whenever the wizard's
  // submitted name differs from what we have on file. Cheap update, keeps
  // legacy/imported candidates from staying nameless. (full_name is a
  // generated column — we only write the parts.)
  if (
    (candidate.first_name as string | null)?.trim() !== firstName ||
    (candidate.last_name as string | null)?.trim() !== lastName
  ) {
    await supabase
      .from("candidates")
      .update({ first_name: firstName, last_name: lastName })
      .eq("id", candidate.id as string);
  }
  const candidateName = composeName({
    first_name: firstName,
    last_name: lastName,
  });

  // Verify job is active
  const { data: job } = await supabase
    .from("jobs")
    .select("id, dso_id, title, status, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || (job.status as string) !== "active" || job.deleted_at) {
    return {
      ok: false,
      error: "This job is no longer accepting applications.",
    };
  }

  // 30-day cooldown after withdraw (locked rule R9). If the candidate
  // previously applied to this job and withdrew within the last 30
  // days, block the re-apply with a friendly message. Calculated from
  // withdrawn_at; falls back to updated_at when withdrawn_at is null
  // (legacy applications withdrawn before this column existed).
  const { data: priorApp } = await supabase
    .from("applications")
    .select("id, withdrawn_at, updated_at")
    .eq("job_id", jobId)
    .eq("candidate_id", candidate.id as string)
    .maybeSingle();
  // `withdrawn_at` is the source of truth for a withdrawn application —
  // the old `status` enum column was removed when configurable pipeline
  // stages shipped (~2026-05-12). A non-null withdrawn_at == withdrawn.
  if (priorApp && priorApp.withdrawn_at) {
    const withdrawAt = new Date(
      ((priorApp.withdrawn_at as string | null) ??
        (priorApp.updated_at as string)) || Date.now()
    );
    const days = (Date.now() - withdrawAt.getTime()) / (1000 * 60 * 60 * 24);
    if (days < 30) {
      const remaining = Math.max(1, Math.ceil(30 - days));
      return {
        ok: false,
        error: `You withdrew this application recently — try again in ${remaining} day${remaining === 1 ? "" : "s"}.`,
      };
    }
  }

  // Pull screening questions for this job — we need them both to validate
  // required answers and to know how to interpret each form value.
  // E2.10 (2026-05-13) — also pull knockout flag + correct-answer payload
  // so we can soft-tag failing applications after answers persist.
  const { data: rawQuestions } = await supabase
    .from("job_screening_questions")
    .select(
      "id, prompt, helper_text, kind, options, required, sort_order, knockout, knockout_correct_answer"
    )
    .eq("job_id", jobId);
  const questions = (rawQuestions ?? []) as unknown as ScreeningQuestion[];

  // 5G.e Tier 2 — verification requirements for this job. Drives which
  // verification-type rows we accept from the FormData (we only persist
  // attestations for types the job actually requires).
  const { data: rawVerificationRequirements } = await supabase
    .from("job_verification_requirements")
    .select("verification_type, required")
    .eq("job_id", jobId);
  const verificationRequirements = (rawVerificationRequirements ??
    []) as Array<{ verification_type: string; required: boolean }>;

  // Parse + validate answers from formData
  const answersByQuestion = parseAnswers(questions, formData);
  const missingRequired = questions.find(
    (q) => q.required && !hasAnswer(answersByQuestion[q.id])
  );
  if (missingRequired) {
    return {
      ok: false,
      error: `Please answer the required question: "${missingRequired.prompt.slice(
        0,
        80
      )}"`,
    };
  }

  // Parse + validate verification attestations from formData. We only
  // consider verification types the job actually requires; anything else
  // in the form is ignored.
  const verificationRows = parseVerifications(
    verificationRequirements,
    formData
  );
  const missingVerification = verificationRequirements.find(
    (req) =>
      req.required &&
      !verificationRows.some((r) => r.verification_type === req.verification_type && r.attested)
  );
  if (missingVerification) {
    const vt = getVerificationType(missingVerification.verification_type);
    return {
      ok: false,
      error: `Please confirm the required verification: "${
        vt?.label ?? missingVerification.verification_type
      }"`,
    };
  }

  // Resume handling: optional override; if not provided, fall back to
  // candidate.resume_url (their saved profile resume).
  let resumeUrl: string | null = (candidate.resume_url as string | null) ?? null;

  if (resumeFile && resumeFile.size > 0) {
    if (!RESUME_MIME.has(resumeFile.type)) {
      return {
        ok: false,
        error: "Resume must be a PDF or Word document (.pdf, .doc, .docx).",
      };
    }
    if (resumeFile.size > RESUME_MAX_BYTES) {
      return {
        ok: false,
        error: "Resume file is too large. Maximum size is 10 MB.",
      };
    }

    const safeName = resumeFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(path, resumeFile, {
        contentType: resumeFile.type,
        upsert: false,
      });

    if (uploadError) {
      return {
        ok: false,
        error: `We couldn't upload your resume: ${uploadError.message}`,
      };
    }

    resumeUrl = path;

    // If candidate has no resume_url yet, save this as their default resume.
    if (!candidate.resume_url) {
      await supabase
        .from("candidates")
        .update({ resume_url: path })
        .eq("id", candidate.id as string);
    }
  }

  // Check for existing application (idempotency). Any existing row for
  // this (job, candidate) pair is a hard block — see the branch below.
  const { data: existing } = await supabase
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("candidate_id", candidate.id as string)
    .maybeSingle();

  let applicationId: string;
  const alreadyApplied = false;

  if (existing) {
    // Hard block on duplicate apply (Cam 2026-05-08 PM). Page-level
    // redirect catches the canonical UX path; this branch defends
    // against direct form posts (curl, replays, etc.). The candidate
    // should be looking at their existing application surface, not
    // rewriting it.
    return {
      ok: false,
      alreadyApplied: true,
      error:
        "You've already applied to this job. Visit My Applications to track its status or message the team.",
    };
  } else {
    // stage_id is auto-filled by the applications_fill_default_stage
    // trigger to the DSO's default 'open'-kind stage. Don't pass it.
    const { data: newApp, error: insertError } = await supabase
      .from("applications")
      .insert({
        job_id: jobId,
        candidate_id: candidate.id as string,
        cover_letter: coverLetter || null,
        resume_url: resumeUrl,
        source: sourceTag,
      })
      .select("id")
      .single();

    if (insertError) {
      return { ok: false, error: insertError.message };
    }
    applicationId = newApp?.id as string;
  }

  // ── Persist screening answers ──
  // Strategy: delete prior answers for this application then re-insert. RLS
  // on application_question_answers requires the application to be the
  // candidate's own, which we already enforced via the application
  // insert/update path above.
  if (questions.length > 0) {
    // Delete prior rows (no-op if first submission)
    await supabase
      .from("application_question_answers")
      .delete()
      .eq("application_id", applicationId);

    const rowsToInsert = questions
      .map((q) => answerToRow(applicationId, q, answersByQuestion[q.id]))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (rowsToInsert.length > 0) {
      const { error: answersError } = await supabase
        .from("application_question_answers")
        .insert(rowsToInsert);

      if (answersError) {
        // Don't roll the application back — surface the error, candidate can
        // re-submit which will overwrite. Log for ops.
        console.error("[apply] answer insert failed:", answersError);
        return {
          ok: false,
          error: `Application saved, but we couldn't save your screening answers: ${answersError.message}. Please re-submit.`,
        };
      }
    }
  }

  // ── Persist verification attestations (5G.e Tier 2 — multi-credential) ──
  // Same delete-prior-then-insert strategy as screening answers above —
  // RLS on application_verifications requires the application to be the
  // candidate's own, which the application insert path already enforced.
  // The delete cascades to application_verification_credentials (ON DELETE
  // CASCADE), so re-submits start from a clean slate. We re-select the
  // inserted rows' ids so we can attach 0..N credential links per row.
  if (verificationRequirements.length > 0) {
    await supabase
      .from("application_verifications")
      .delete()
      .eq("application_id", applicationId);

    const verificationInsertRows = verificationRows.map((r) => ({
      application_id: applicationId,
      verification_type: r.verification_type,
      attested: r.attested,
      attested_at: r.attested ? new Date().toISOString() : null,
      note: r.note,
    }));

    if (verificationInsertRows.length > 0) {
      const { data: insertedVerifications, error: verificationsError } =
        await supabase
          .from("application_verifications")
          .insert(verificationInsertRows)
          .select("id, verification_type");

      if (verificationsError) {
        // Mirror the screening-answers failure handling — don't roll the
        // application back; surface the error so the candidate can re-submit.
        console.error(
          "[apply] verification insert failed:",
          verificationsError
        );
        return {
          ok: false,
          error: `Application saved, but we couldn't save your verification confirmations: ${verificationsError.message}. Please re-submit.`,
        };
      }

      // Build the join-table rows: one per linked credential, keyed back to
      // the application_verifications row of the same verification type.
      const verifIdByType = new Map(
        ((insertedVerifications ?? []) as Array<{
          id: string;
          verification_type: string;
        }>).map((v) => [v.verification_type, v.id])
      );
      const credentialLinkRows: Array<{
        application_verification_id: string;
        credential_type: string;
        credential_id: string;
      }> = [];
      for (const r of verificationRows) {
        const avId = verifIdByType.get(r.verification_type);
        if (!avId) continue;
        for (const c of r.linkedCredentials) {
          credentialLinkRows.push({
            application_verification_id: avId,
            credential_type: c.credential_type,
            credential_id: c.credential_id,
          });
        }
      }

      if (credentialLinkRows.length > 0) {
        const { error: credentialsError } = await supabase
          .from("application_verification_credentials")
          .insert(credentialLinkRows);

        if (credentialsError) {
          // Non-fatal for the application + attestations (those landed) —
          // surface the error so the candidate can re-submit and re-link.
          console.error(
            "[apply] verification credential-link insert failed:",
            credentialsError
          );
          return {
            ok: false,
            error: `Application saved, but we couldn't save your linked credentials: ${credentialsError.message}. Please re-submit.`,
          };
        }
      }
    }
  }

  // ── E2.10 — Soft knockout evaluation ──
  // Compute which knockout questions the candidate failed and persist
  // the result on the application row. NEVER auto-reject (per locked
  // spec); the application stays status='new' and the recruiter sees
  // the chip in the kanban + a callout on the application detail page.
  //
  // Failure detection is fail-soft: any unexpected shape in the
  // correct-answer payload, or any kind that doesn't support knockout
  // (short_text/long_text), passes silently. We'd rather miss a
  // legitimate knockout than over-tag an application with bad data.
  const knockoutQuestions = questions.filter(
    (q) => (q as ScreeningQuestion & { knockout?: boolean }).knockout === true
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
        // Truncate at 80 chars to bound the kanban chip width.
        const truncated =
          q.prompt.length > 80 ? q.prompt.slice(0, 77) + "..." : q.prompt;
        failedPrompts.push(truncated);
      }
    }
    if (failedPrompts.length > 0) {
      // Service-role update — RLS on applications.UPDATE is recruiter-
      // scoped, but at this point in the apply flow the candidate is the
      // current user and they wouldn't pass the recruiter check. The
      // candidate just inserted this row; writing knockout metadata back
      // is a system-level concern, not a user-permission one.
      const admin = createSupabaseServiceRoleClient();
      const { error: koError } = await admin
        .from("applications")
        .update({
          knockout_failed_questions: failedPrompts,
          knockout_failed_at: new Date().toISOString(),
        })
        .eq("id", applicationId);
      if (koError) {
        // Non-fatal — the application is in place, the knockout tag just
        // didn't land. Log for ops; don't surface to the candidate
        // (per spec: candidates never see knockout state).
        console.warn("[apply] knockout tag write failed:", koError);
      }
    }
  }

  // Fire transactional emails — fire-and-forget, never block on these.
  void sendApplicationEmails({
    applicationId,
    jobId,
    candidateId: candidate.id as string,
    candidateAuthUserId: user.id,
    candidateName,
    candidateFirstName: firstName,
    candidateHeadline: (candidate.headline as string | null) ?? null,
    dsoId: job.dso_id as string,
    jobTitle: job.title as string,
  });

  // Drop a system message into the candidate's inbox thread (Phase 4.8)
  // only on the FIRST submission — re-submissions update the existing
  // application row + answers without a new "received" event.
  if (!alreadyApplied) {
    void dispatchInboxSystemMessage({
      applicationId,
      eventKind: "application_received",
      senderRole: "employer",
      body: `Your application for ${job.title} was received. We'll let you know when the team reviews it or moves it forward.`,
    });

    // N13: fire the application.received automation trigger ADDITIVELY —
    // AFTER the existing ack email + inbox message above (which are untouched,
    // so there's no double-send). Custom received rules (Scale+, opt-in) can
    // notify a teammate or tag the application. Uses next/after() so it
    // survives the serverless freeze per feedback_vercel_serverless_fire_and_forget.
    const receivedAppId = applicationId;
    after(async () => {
      await runAutomationsForEvent({
        trigger: "application.received",
        applicationId: receivedAppId,
        dsoId: job.dso_id as string,
        candidateId: candidate.id as string,
        jobId,
        jobTitle: job.title as string,
        triggerEventKey: `received:${receivedAppId}`,
      });
    });
  }

  revalidatePath(`/candidate/dashboard`);
  revalidatePath(`/candidate/applications`);
  return {
    ok: true,
    alreadyApplied,
    applicationId,
    message: alreadyApplied
      ? "You'd already applied to this role — we updated your application with the latest answers, cover letter, and resume."
      : `Application submitted to ${job.title as string}. Track its status from your application page or candidate dashboard.`,
  };
}

/* ───────────────────────────────────────────────────────────────
 * Answer parsing
 * ───────────────────────────────────────────────────────────── */

interface ParsedAnswer {
  text: string | null;
  choice: string | null;
  choices: string[] | null;
  number: number | null;
}

function parseAnswers(
  questions: ScreeningQuestion[],
  formData: FormData
): Record<string, ParsedAnswer> {
  const out: Record<string, ParsedAnswer> = {};
  for (const q of questions) {
    const key = `q__${q.id}`;
    const allValues = formData.getAll(key);
    const first =
      allValues.length > 0 ? String(allValues[0] ?? "").trim() : "";

    const empty: ParsedAnswer = {
      text: null,
      choice: null,
      choices: null,
      number: null,
    };

    switch (q.kind) {
      case "short_text":
      case "long_text":
        out[q.id] = first ? { ...empty, text: first } : empty;
        break;
      case "yes_no":
        if (first === "yes" || first === "no") {
          out[q.id] = { ...empty, choice: first };
        } else {
          out[q.id] = empty;
        }
        break;
      case "single_select": {
        const validIds = new Set((q.options ?? []).map((o) => o.id));
        if (first && validIds.has(first)) {
          out[q.id] = { ...empty, choice: first };
        } else {
          out[q.id] = empty;
        }
        break;
      }
      case "multi_select": {
        const validIds = new Set((q.options ?? []).map((o) => o.id));
        const cleaned = allValues
          .map((v) => String(v ?? "").trim())
          .filter((v) => v && validIds.has(v));
        out[q.id] =
          cleaned.length > 0 ? { ...empty, choices: cleaned } : empty;
        break;
      }
      case "number": {
        if (first === "") {
          out[q.id] = empty;
          break;
        }
        const n = Number(first);
        out[q.id] = Number.isFinite(n) ? { ...empty, number: n } : empty;
        break;
      }
    }
  }
  return out;
}

function hasAnswer(a: ParsedAnswer | undefined): boolean {
  if (!a) return false;
  return (
    a.text !== null ||
    a.choice !== null ||
    (a.choices !== null && a.choices.length > 0) ||
    a.number !== null
  );
}

function answerToRow(
  applicationId: string,
  q: ScreeningQuestion,
  a: ParsedAnswer | undefined
): {
  application_id: string;
  question_id: string;
  answer_text: string | null;
  answer_choice: string | null;
  answer_choices: string[] | null;
  answer_number: number | null;
} | null {
  if (!a || !hasAnswer(a)) return null;
  return {
    application_id: applicationId,
    question_id: q.id,
    answer_text: a.text,
    answer_choice: a.choice,
    answer_choices: a.choices,
    answer_number: a.number,
  };
}

/* ───────────────────────────────────────────────────────────────
 * Verification parsing (5G.e Tier 2 — multi-credential, migration ...004)
 *
 * FormData shape emitted by the wizard, one set per required type:
 *   v__${type}          — "1" when attested, else absent
 *   v__${type}__cred_id — linked credential row id (repeated, 0..N)
 *   v__${type}__note    — free-text note (optional)
 *
 * The credential's *source table* is no longer carried in the form — it's
 * re-derived from the verification type's `credentialSource` (every linked
 * credential for a given verification shares one source table). Each
 * parsed verification carries 0..N {credential_type, credential_id} links,
 * persisted to the application_verification_credentials join table.
 *
 * Only verification types the job actually requires are considered; any
 * other v__ fields in the form are ignored. Types are re-validated with
 * isVerificationType as defense-in-depth.
 * ───────────────────────────────────────────────────────────── */

interface ParsedVerification {
  verification_type: string;
  attested: boolean;
  linkedCredentials: Array<{ credential_type: string; credential_id: string }>;
  note: string | null;
}

const VALID_CREDENTIAL_TYPES = new Set([
  "candidate_license",
  "candidate_certification",
  "candidate_education",
]);

function parseVerifications(
  requirements: Array<{ verification_type: string; required: boolean }>,
  formData: FormData
): ParsedVerification[] {
  const out: ParsedVerification[] = [];
  for (const req of requirements) {
    const type = req.verification_type;
    // Defense-in-depth — skip anything that isn't a known verification slug.
    if (!isVerificationType(type)) continue;

    const attested = String(formData.get(`v__${type}`) ?? "").trim() === "1";

    // The source table for every linked credential on this verification is
    // fixed by the verification type. null source → attestation only; any
    // stray cred ids in the form are ignored.
    const credentialType = getVerificationType(type)?.credentialSource ?? null;
    const linkedCredentials: Array<{
      credential_type: string;
      credential_id: string;
    }> = [];
    if (credentialType && VALID_CREDENTIAL_TYPES.has(credentialType)) {
      const seen = new Set<string>();
      for (const raw of formData.getAll(`v__${type}__cred_id`)) {
        const id = String(raw ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        linkedCredentials.push({
          credential_type: credentialType,
          credential_id: id,
        });
      }
    }

    const rawNote = String(formData.get(`v__${type}__note`) ?? "").trim();

    out.push({
      verification_type: type,
      attested,
      linkedCredentials,
      note: rawNote || null,
    });
  }
  return out;
}

/* ───────────────────────────────────────────────────────────────
 * Email side effects
 * ───────────────────────────────────────────────────────────── */

interface SendApplicationEmailsParams {
  applicationId: string;
  jobId: string;
  candidateId: string;
  candidateAuthUserId: string;
  candidateName: string | null;
  candidateFirstName: string | null;
  candidateHeadline: string | null;
  dsoId: string;
  jobTitle: string;
}

async function sendApplicationEmails(
  params: SendApplicationEmailsParams
): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();

    const [{ data: dso }, { data: jobLocs }, candidateAuthUser] =
      await Promise.all([
        admin
          .from("dsos")
          .select("id, name, affiliation_reveal_policy")
          .eq("id", params.dsoId)
          .maybeSingle(),
        admin
          .from("job_locations")
          .select(
            "location:dso_locations(name, city, state, public_dso_affiliation)"
          )
          .eq("job_id", params.jobId),
        admin.auth.admin.getUserById(params.candidateAuthUserId),
      ]);

    const allLocs = ((jobLocs ?? []) as unknown as Array<{
      location: {
        name: string;
        city: string | null;
        state: string | null;
        public_dso_affiliation: boolean;
      } | null;
    }>)
      .map((row) => row.location)
      .filter((l): l is NonNullable<typeof l> => l !== null);

    const jobLocationsLabel = formatJobLocations(allLocs);

    const dsoName = (dso?.name as string | undefined) ?? "your DSO";

    // Affiliation display for the candidate confirmation email
    // (Phase 4.5.b launch-blocker). At apply time, the application is
    // fresh (status='new', affiliation_revealed=false), so:
    //   - Public job → DSO name
    //   - Private job + policy=never|after_hire|per_application →
    //     practice name (single-loc) or "Multiple locations"
    // The "after_hire" policy can flip later when status changes;
    // future status-change emails would re-run this logic. Per Cam's
    // 2026-05-08 direction, only NEW emails use the affiliation
    // wrapper; the receipt email runs once at apply time.
    const allLocsPublic =
      allLocs.length === 0 || allLocs.every((l) => l.public_dso_affiliation);
    const policy =
      ((dso?.affiliation_reveal_policy as
        | "never"
        | "after_hire"
        | "per_application"
        | undefined) ?? "never");
    // For a fresh application, only `never` reveals (it can't); after_hire
    // requires status='hired' which isn't the case yet; per_application
    // requires the bit flipped which isn't either. So when the job is
    // private, the email always uses the masked name.
    const policyAllowsRevealAtApply = false; // see comment above
    const singlePracticeName =
      allLocs.length === 1 ? allLocs[0]!.name : null;
    const displayedEmployerName = allLocsPublic
      ? dsoName
      : policyAllowsRevealAtApply
        ? dsoName
        : (singlePracticeName ?? "Multiple locations");
    // Suppress unused warning — `policy` is reserved for the
    // status-change email wave we'll wire next.
    void policy;
    const candidateEmail = candidateAuthUser?.data?.user?.email ?? null;
    const candidateDisplayName = params.candidateName?.trim() || "there";
    // Reply-To routes candidate replies to the DSO (configured careers inbox
    // or owner email), never the platform founder. Was hardcoded before.
    const candidateReplyTo = await resolveCandidateReplyTo(params.dsoId);

    /* ── Email 1: candidate confirmation ──
       Phase 4.5.f: dispatchCandidateEmail() short-circuits to a custom
       template if the DSO is on Growth+ and has saved one for this kind;
       otherwise falls back to the existing ApplicationReceived component. */
    if (candidateEmail) {
      const firstName =
        params.candidateFirstName?.trim() || candidateDisplayName;
      void dispatchCandidateEmail({
        kind: "candidate.application_received",
        dsoId: params.dsoId,
        recipientUserId: params.candidateAuthUserId,
        recipientEmail: candidateEmail,
        displayDsoName: displayedEmployerName,
        candidate: {
          first_name: firstName,
          full_name: candidateDisplayName,
          email: candidateEmail,
        },
        job: {
          title: params.jobTitle,
          url: `${SITE_URL}/jobs/${params.jobId}`,
          location_name: jobLocationsLabel || null,
        },
        relatedDsoId: params.dsoId,
        relatedCandidateId: params.candidateId,
        replyTo: candidateReplyTo,
        fallback: {
          subject: `Application received: ${params.jobTitle} at ${displayedEmployerName}`,
          react: ApplicationReceived({
            candidateName: candidateDisplayName,
            jobTitle: params.jobTitle,
            dsoName: displayedEmployerName,
            trackingUrl: `${SITE_URL}/candidate/dashboard`,
          }),
        },
      });
    }

    /* ── Email 2: every DSO member ── */
    const { data: dsoMembers } = await admin
      .from("dso_users")
      .select("auth_user_id, full_name, role")
      .eq("dso_id", params.dsoId);

    const memberRows =
      (dsoMembers ?? []) as Array<{
        auth_user_id: string;
        full_name: string | null;
        role: string;
      }>;

    if (memberRows.length === 0) return;

    const memberEmailLookups = await Promise.all(
      memberRows.map(async (m) => {
        try {
          const res = await admin.auth.admin.getUserById(m.auth_user_id);
          return {
            authUserId: m.auth_user_id,
            email: res.data?.user?.email ?? null,
            name: m.full_name,
          };
        } catch {
          return {
            authUserId: m.auth_user_id,
            email: null,
            name: m.full_name,
          };
        }
      })
    );

    const employerApplicationUrl = `${SITE_URL}/employer/applications/${params.applicationId}`;

    for (const recipient of memberEmailLookups) {
      if (!recipient.email) continue;
      void dispatchNotification({
        userId: recipient.authUserId,
        eventKind: "employer.new_application",
        relatedDsoId: params.dsoId,
        relatedCandidateId: params.candidateId,
        email: {
          to: recipient.email,
          subject: `New application: ${params.jobTitle} · ${dsoName}`,
          replyTo: candidateEmail ?? undefined,
          react: NewApplication({
            recipientName: recipient.name?.split(" ")[0] || "there",
            candidateName: params.candidateName?.trim() || "A candidate",
            candidateEmail: candidateEmail ?? undefined,
            candidateHeadline: params.candidateHeadline,
            jobTitle: params.jobTitle,
            jobLocations: jobLocationsLabel,
            applicationUrl: employerApplicationUrl,
          }),
        },
      });
    }
  } catch (err) {
    console.error("[apply] sendApplicationEmails failed:", err);
  }
}

function formatJobLocations(
  locs: Array<{ name: string; city: string | null; state: string | null }>
): string {
  if (locs.length === 0) return "your DSO";
  if (locs.length === 1) {
    const l = locs[0];
    const parts = [l.name, [l.city, l.state].filter(Boolean).join(", ")].filter(
      Boolean
    );
    return parts.join(" · ");
  }
  if (locs.length <= 3) {
    return locs.map((l) => l.name).join(", ");
  }
  return `${locs.length} locations`;
}
