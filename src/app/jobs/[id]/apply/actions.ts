"use server";

/**
 * /jobs/[id]/apply server action.
 *
 * Creates the application row + uploads the resume (if provided) to the
 * `resumes` Supabase Storage bucket at path `${auth_user_id}/${timestamp}-${filename}`.
 *
 * Idempotency: if an application for (job_id, candidate_id) already exists,
 * we update its cover_letter + resume_url instead of inserting again.
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

  // Fire transactional emails — fire-and-forget, never block on these.
  // Each helper has its own try/catch and logs failures to email_log.
  void sendApplicationEmails({
    applicationId: newApp?.id as string,
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
    message: `Application submitted to ${job.title as string}. Track its status on your candidate dashboard.`,
  };
}

/* ───────────────────────────────────────────────────────────────
 * Email side effects
 *
 * Lookups need the service-role client so we can read auth.users and so
 * email_log inserts pass RLS. Failures are swallowed inside sendEmail —
 * email is never allowed to break the apply flow.
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

    // Pull DSO name, the locations tagged on this job, and candidate email
    // in parallel.
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

    // Resolve member emails via auth.admin.getUserById (parallel)
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
    // Never throw — apply succeeded, email is best-effort.
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
