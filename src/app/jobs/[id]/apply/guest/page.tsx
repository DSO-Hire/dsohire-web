/**
 * /jobs/[id]/apply/guest — public guest apply form (E2.1 / Phase 5F).
 *
 * Single-page form (not a wizard) — matches Indeed / LinkedIn / ZipRec /
 * Workable patterns. Candidate enters email, name, optional phone, resume,
 * optional cover letter, and answers screening Qs. On submit:
 *   - Server creates a guest candidate row + the application
 *   - Confirmation email goes to the candidate with a magic-link "Claim
 *     your account" CTA
 *   - Page shows the success state inline
 *
 * No auth wall. If the user IS authenticated, we route them to the
 * canonical /jobs/[id]/apply since they don't need the guest path.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Briefcase, MapPin } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { GuestApplyForm } from "./guest-form";
import type { ScreeningQuestion, JobVerificationRequirement } from "../types";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ source?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return {
    title: job ? `Apply as guest: ${job.title as string}` : "Apply as guest",
  };
}

export default async function GuestApplyPage({ params, searchParams }: PageProps) {
  const { id: jobId } = await params;
  const sp = searchParams ? await searchParams : {};
  const sourceTag = (sp.source ?? "").trim().slice(0, 64) || null;
  const supabase = await createSupabaseServerClient();

  // If already authenticated, send to the canonical apply page.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(`/jobs/${jobId}/apply`);
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, dso_id, title, employment_type, role_category, status, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || (job.status as string) !== "active" || job.deleted_at) {
    notFound();
  }

  const [
    { data: dso },
    { data: rawLocations },
    { data: rawQuestions },
    { data: rawVerificationRequirements },
  ] = await Promise.all([
    supabase
      .from("dsos")
      .select("id, name, slug")
      .eq("id", job.dso_id as string)
      .maybeSingle(),
    supabase
      .from("job_locations")
      .select(
        "location:dso_locations(name, city, state, public_dso_affiliation)"
      )
      .eq("job_id", jobId),
    supabase
      .from("job_screening_questions")
      .select("id, prompt, helper_text, kind, options, required, sort_order")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("job_verification_requirements")
      .select("verification_type, required")
      .eq("job_id", jobId),
  ]);

  const locations = ((rawLocations ?? []) as unknown as Array<{
    location: {
      name: string;
      city: string | null;
      state: string | null;
      public_dso_affiliation: boolean;
    } | null;
  }>)
    .map((r) => r.location)
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const allLocationsPublic =
    locations.length === 0 || locations.every((l) => l.public_dso_affiliation);
  const singlePracticeName =
    locations.length === 1 ? locations[0]!.name : null;
  const displayedEmployerName = allLocationsPublic
    ? ((dso?.name as string | undefined) ?? "this DSO")
    : (singlePracticeName ?? "Multiple locations");

  const questions = ((rawQuestions ?? []) as unknown as ScreeningQuestion[]) ?? [];

  const verificationRequirements =
    ((rawVerificationRequirements ?? []) as unknown as JobVerificationRequirement[]) ??
    [];

  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <Link
          href={`/jobs/${jobId}`}
          className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to job
        </Link>

        <header className="mb-10">
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
            Apply as guest
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1px] leading-[1.1] text-ink mb-3">
            {job.title as string}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-slate-body">
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" />
              {displayedEmployerName}
            </span>
            {locations.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {locations
                  .map((l) =>
                    [l.city, l.state].filter(Boolean).join(", ")
                  )
                  .filter((s) => s.length > 0)
                  .slice(0, 3)
                  .join(" · ")}
              </span>
            )}
          </div>

          <div className="mt-6 border-l-4 border-heritage bg-cream p-4 max-w-[640px]">
            <p className="text-[13px] text-ink leading-relaxed">
              <strong>No account required.</strong> Submit your application
              with just an email. After you apply, we&apos;ll send you a
              magic link to claim your account so you can track this and
              future applications &mdash; entirely optional.{" "}
              <Link
                href={`/candidate/sign-up?next=${encodeURIComponent(`/jobs/${jobId}/apply`)}`}
                className="font-semibold underline underline-offset-2 hover:text-heritage-deep"
              >
                Prefer to sign up first?
              </Link>
            </p>
          </div>
        </header>

        <GuestApplyForm
          jobId={jobId}
          questions={questions}
          verificationRequirements={verificationRequirements}
          sourceTag={sourceTag}
        />
      </div>
    </SiteShell>
  );
}
