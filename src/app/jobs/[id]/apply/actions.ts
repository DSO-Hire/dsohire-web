"use server";

/**
 * /jobs/[id]/apply server action.
 *
 * Creates the application row + uploads the resume (if provided) to the
 * `resumes` Supabase Storage bucket at path `${auth_user_id}/${timestamp}-${filename}`.
 *
 * Idempotency: if an application for (job_id, candidate_id) already exists,
 * we update its cover_letter + resume_url instead of inserting again.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    .select("id, full_name, resume_url")
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
    .select("id, title, status, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || (job.status as string) !== "active" || job.deleted_at) {
    return {
      ok: false,
      error: "This job is no longer accepting applications.",
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

    // Path: ${auth_user_id}/${timestamp}-${filename}
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

    // If candidate has no resume_url yet, save this as their default resume
    // so subsequent applications can reuse it.
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

  if (existing) {
    // Update cover letter / resume override on re-apply
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        cover_letter: coverLetter || null,
        resume_url: resumeUrl,
      })
      .eq("id", existing.id as string);

    if (updateError) {
      return { ok: false, error: updateError.message };
    }

    revalidatePath(`/candidate/dashboard`);
    revalidatePath(`/candidate/applications`);
    return {
      ok: true,
      alreadyApplied: true,
      message:
        "You'd already applied to this role — we updated your cover letter and resume on the existing application.",
    };
  }

  const { error: insertError } = await supabase.from("applications").insert({
    job_id: jobId,
    candidate_id: candidate.id as string,
    cover_letter: coverLetter || null,
    resume_url: resumeUrl,
    status: "new",
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  revalidatePath(`/candidate/dashboard`);
  revalidatePath(`/candidate/applications`);
  return {
    ok: true,
    message: `Application submitted to ${job.title as string}. Track its status on your candidate dashboard.`,
  };
}
