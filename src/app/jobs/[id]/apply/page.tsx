/**
 * /jobs/[id]/apply — candidate apply wizard for a specific job.
 *
 * Auth wall: if logged out, bounce to /candidate/sign-up?next=/jobs/[id]/apply
 * so the user comes back to this exact page after verifying their email.
 *
 * Multi-step wizard:
 *   1. Intro (job confirm + profile prefill summary)
 *   2. Screening questions (only mounted when the job has any)
 *   3. Resume
 *   4. Cover letter
 *   5. Review + submit (with profile-completeness banner)
 *
 * Drafts persist in localStorage keyed by jobId+candidateId. Resuming an
 * existing application surfaces previously saved cover letter + answers.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, MapPin, Briefcase } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApplyWizard } from "./apply-wizard";
import type { ScreeningQuestion, CandidatePrefill, ExistingAnswer } from "./types";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

const EMP_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  prn: "PRN",
  locum: "Locum",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return { title: job ? `Apply: ${job.title as string}` : "Apply" };
}

export default async function ApplyPage({ params }: PageProps) {
  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();

  // Auth wall
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/candidate/sign-up?next=${encodeURIComponent(`/jobs/${jobId}/apply`)}`);
  }

  // Job exists and is active
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, title, employment_type, role_category, status, deleted_at"
    )
    .eq("id", jobId)
    .maybeSingle();
  if (!job || (job.status as string) !== "active") notFound();

  // DSO + locations + screening questions in parallel
  const [
    { data: dso },
    { data: rawLocations },
    { data: rawQuestions },
  ] = await Promise.all([
    supabase
      .from("dsos")
      .select("id, name, slug")
      .eq("id", job.dso_id as string)
      .maybeSingle(),
    supabase
      .from("job_locations")
      .select("location:dso_locations(city, state)")
      .eq("job_id", jobId),
    supabase
      .from("job_screening_questions")
      .select("id, prompt, helper_text, kind, options, required, sort_order")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
  ]);

  const locations = ((rawLocations ?? []) as unknown as Array<{
    location: { city: string | null; state: string | null } | null;
  }>)
    .map((r) => r.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const questions = ((rawQuestions ?? []) as unknown as ScreeningQuestion[]) ?? [];

  // Candidate row
  const { data: rawCandidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, summary, years_experience, current_title, availability, resume_url, linkedin_url, phone"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!rawCandidate) {
    redirect(`/candidate/sign-up?next=${encodeURIComponent(`/jobs/${jobId}/apply`)}`);
  }

  const candidate = rawCandidate as unknown as CandidatePrefill & {
    id: string;
    resume_url: string | null;
  };

  // Existing application — surface for resume-of-prior-attempt
  const { data: existingApp } = await supabase
    .from("applications")
    .select("id, cover_letter, resume_url, status")
    .eq("job_id", jobId)
    .eq("candidate_id", candidate.id)
    .maybeSingle();

  let existingAnswers: ExistingAnswer[] = [];
  if (existingApp) {
    const { data: rawAnswers } = await supabase
      .from("application_question_answers")
      .select(
        "question_id, answer_text, answer_choice, answer_choices, answer_number"
      )
      .eq("application_id", existingApp.id as string);
    existingAnswers = (rawAnswers ?? []) as ExistingAnswer[];
  }

  const savedResumeUrl = candidate.resume_url ?? null;
  const savedResumeName = savedResumeUrl
    ? savedResumeUrl.split("/").pop()?.replace(/^\d+-/, "") ?? null
    : null;

  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[920px] mx-auto">
        <Link
          href={`/jobs/${jobId}`}
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-8"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Job Details
        </Link>

        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3">
          Applying to
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-4 max-w-[760px]">
          {job.title as string}
        </h1>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-slate-body mb-10 pb-10 border-b border-[var(--rule)]">
          <span className="font-semibold text-ink">{dso?.name ?? "DSO"}</span>
          <span className="inline-flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {ROLE_LABELS[job.role_category as string] ?? job.role_category} ·{" "}
            {EMP_LABELS[job.employment_type as string] ?? job.employment_type}
          </span>
          {locations.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {formatLocations(locations)}
            </span>
          )}
        </div>

        <ApplyWizard
          jobId={jobId}
          jobTitle={job.title as string}
          dsoName={dso?.name ?? "this DSO"}
          questions={questions}
          candidate={{
            id: candidate.id,
            full_name: candidate.full_name,
            headline: candidate.headline,
            summary: candidate.summary,
            years_experience: candidate.years_experience,
            current_title: candidate.current_title,
            availability: candidate.availability,
            linkedin_url: candidate.linkedin_url,
            phone: candidate.phone,
          }}
          savedResumeUrl={savedResumeUrl}
          savedResumeName={savedResumeName}
          existingApplication={
            existingApp
              ? {
                  id: existingApp.id as string,
                  cover_letter:
                    (existingApp.cover_letter as string | null) ?? null,
                  status: existingApp.status as string,
                }
              : null
          }
          existingAnswers={existingAnswers}
          userEmail={user.email ?? null}
        />
      </section>
    </SiteShell>
  );
}

function formatLocations(
  locs: Array<{ city: string | null; state: string | null }>
): string {
  if (locs.length === 0) return "";
  if (locs.length === 1) {
    return [locs[0].city, locs[0].state].filter(Boolean).join(", ");
  }
  const states = Array.from(new Set(locs.map((l) => l.state).filter(Boolean)));
  if (states.length === 1) return `${locs.length} locations · ${states[0]}`;
  return `${locs.length} locations`;
}
