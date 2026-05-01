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
import { sendEmail } from "@/lib/email/send";
import { ApplicationReceived } from "@/emails/candidate/ApplicationReceived";
import { NewApplication } from "@/emails/employer/NewApplication";
import type { ScreeningQuestion } from "./types";

export interface ApplyState {
  ok: boolean;
  error?: string;
  message?: string;
  alreadyApplied?: boolean;
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
  const coverLetter = String(formData.get("cover_letter") ?? "").trim();
  const resumeFile = formData.get("resume") as File | null;

  if (!jobId) {
    return { ok: false, error: "Missing job reference. Please try again." };
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
    .select("id, full_name, headline, resume_url")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return {
      ok: false,
      error: "Your candidate profile is missing. Please sign up first.",
    };
  }

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

  // Pull screening questions for this job — we need them both to validate
  // required answers and to know how to interpret each form value.
  const { data: rawQuestions } = await supabase
    .from("job_screening_questions")
    .select("id, prompt, helper_text, kind, options, required, sort_order")
    .eq("job_id", jobId);
  const questions = (rawQuestions ?? []) as unknown as ScreeningQuestion[];

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

  // Check for existing application (idempotency)
  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("job_id", jobId)
    .eq("candidate_id", candidate.id as string)
    .maybeSingle();

  let applicationId: string;
  let alreadyApplied = false;

  if (existing) {
    alreadyApplied = true;
    applicationId = existing.id as string;

    const { error: updateError } = await supabase
      .from("applications")
      .update({
        cover_letter: coverLetter || null,
        resume_url: resumeUrl,
      })
      .eq("id", applicationId);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }
  } else {
    const { data: newApp, error: insertError } = await supabase
      .from("applications")
      .insert({
        job_id: jobId,
        candidate_id: candidate.id as string,
        cover_letter: coverLetter || null,
        resume_url: resumeUrl,
        status: "new",
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

  // Fire transactional emails — fire-and-forget, never block on these.
  void sendApplicationEmails({
    applicationId,
    jobId,
    candidateId: candidate.id as string,
    candidateAuthUserId: user.id,
    candidateName: (candidate.full_name as string | null) ?? null,
    candidateHeadline: (candidate.headline as string | null) ?? null,
    dsoId: job.dso_id as string,
    jobTitle: job.title as string,
  });

  revalidatePath(`/candidate/dashboard`);
  revalidatePath(`/candidate/applications`);
  return {
    ok: true,
    alreadyApplied,
    message: alreadyApplied
      ? "You'd already applied to this role — we updated your application with the latest answers, cover letter, and resume."
      : `Application submitted to ${job.title as string}. Track its status on your candidate dashboard.`,
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
 * Email side effects
 * ───────────────────────────────────────────────────────────── */

interface SendApplicationEmailsParams {
  applicationId: string;
  jobId: string;
  candidateId: string;
  candidateAuthUserId: string;
  candidateName: string | null;
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
        admin.from("dsos").select("id, name").eq("id", params.dsoId).maybeSingle(),
        admin
          .from("job_locations")
          .select("location:dso_locations(name, city, state)")
          .eq("job_id", params.jobId),
        admin.auth.admin.getUserById(params.candidateAuthUserId),
      ]);

    const jobLocationsLabel = formatJobLocations(
      ((jobLocs ?? []) as unknown as Array<{
        location: { name: string; city: string | null; state: string | null } | null;
      }>)
        .map((row) => row.location)
        .filter((l): l is NonNullable<typeof l> => l !== null)
    );

    const dsoName = (dso?.name as string | undefined) ?? "your DSO";
    const candidateEmail = candidateAuthUser?.data?.user?.email ?? null;
    const candidateDisplayName = params.candidateName?.trim() || "there";

    /* ── Email 1: candidate confirmation ── */
    if (candidateEmail) {
      void sendEmail({
        to: candidateEmail,
        subject: `Application received: ${params.jobTitle} at ${dsoName}`,
        template: "candidate.application_received",
        replyTo: `cam@dsohire.com`,
        relatedDsoId: params.dsoId,
        relatedCandidateId: params.candidateId,
        react: ApplicationReceived({
          candidateName: candidateDisplayName,
          jobTitle: params.jobTitle,
          dsoName,
          trackingUrl: `${SITE_URL}/candidate/dashboard`,
        }),
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
            email: res.data?.user?.email ?? null,
            name: m.full_name,
          };
        } catch {
          return { email: null, name: m.full_name };
        }
      })
    );

    const employerApplicationUrl = `${SITE_URL}/employer/applications/${params.applicationId}`;

    for (const recipient of memberEmailLookups) {
      if (!recipient.email) continue;
      void sendEmail({
        to: recipient.email,
        subject: `New application: ${params.jobTitle} · ${dsoName}`,
        template: "employer.new_application",
        replyTo: candidateEmail ?? undefined,
        relatedDsoId: params.dsoId,
        relatedCandidateId: params.candidateId,
        react: NewApplication({
          recipientName: recipient.name?.split(" ")[0] || "there",
          candidateName: params.candidateName?.trim() || "A candidate",
          candidateEmail: candidateEmail ?? undefined,
          candidateHeadline: params.candidateHeadline,
          jobTitle: params.jobTitle,
          jobLocations: jobLocationsLabel,
          applicationUrl: employerApplicationUrl,
        }),
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
