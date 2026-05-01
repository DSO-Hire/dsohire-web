/**
 * /jobs/[id]/apply — candidate apply form for a specific job.
 *
 * Auth wall: if logged out, bounce to /candidate/sign-up?next=/jobs/[id]/apply
 * so the user comes back to this exact page after verifying their email.
 *
 * If they already have an application for this job, we still show the form
 * (with their previous cover letter prefilled) so they can update it. The
 * action handles upsert semantics.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, MapPin, Briefcase } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ApplyForm } from "./apply-form";
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

  // Auth wall — redirect to sign-up with next param
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

  // Pull DSO + locations for context cards
  const [{ data: dso }, { data: rawLocations }] = await Promise.all([
    supabase
      .from("dsos")
      .select("id, name, slug")
      .eq("id", job.dso_id as string)
      .maybeSingle(),
    supabase
      .from("job_locations")
      .select("location:dso_locations(city, state)")
      .eq("job_id", jobId),
  ]);

  const locations = ((rawLocations ?? []) as unknown as Array<{
    location: { city: string | null; state: string | null } | null;
  }>)
    .map((r) => r.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  // Candidate row — must exist (created at sign-up)
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, resume_url")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) {
    // User is signed in but has no candidate row — likely an employer who
    // clicked an apply link. Send them to candidate sign-up so they can
    // create the candidate side of their account.
    redirect(`/candidate/sign-up?next=${encodeURIComponent(`/jobs/${jobId}/apply`)}`);
  }

  const savedResume = (candidate.resume_url as string | null) ?? null;
  const savedResumeName = savedResume
    ? savedResume.split("/").pop()?.replace(/^\d+-/, "") ?? null
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

        <div className="border border-[var(--rule)] bg-white p-8 sm:p-10">
          <ApplyForm
            jobId={jobId}
            jobTitle={job.title as string}
            hasSavedResume={Boolean(savedResume)}
            savedResumeName={savedResumeName}
          />
        </div>

        <p className="mt-8 text-[12px] text-slate-meta leading-relaxed">
          Signed in as <span className="font-semibold text-ink">{candidate.full_name ?? user.email}</span>.{" "}
          <Link
            href="/candidate/profile"
            className="text-heritage underline underline-offset-2 hover:text-heritage-deep font-semibold"
          >
            Update your profile
          </Link>{" "}
          to autofill future applications.
        </p>
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
