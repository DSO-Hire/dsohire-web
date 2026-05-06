/**
 * /employer/jobs/[id]/edit — wizard edit surface (Phase 4.7.a).
 *
 * Moved from /employer/jobs/[id] when 4.7.a flipped the per-job page to
 * pipeline-first. Reuses JobWizard in edit mode + exposes the soft-delete
 * danger zone. Back link returns to the pipeline view.
 *
 * Phase 4.7.b will refactor this from wizard chrome to a single-page
 * sectioned form (Basics / Description / Compensation / Screening /
 * Visibility) with no "Step X of 5" indicator. For now we keep the
 * wizard as-is; the route move is what 4.7.a needs.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  JobWizard,
  type JobWizardInitial,
  type LocationOption,
  type WizardScreeningQuestion,
} from "../../job-wizard";
import { softDeleteJob } from "../../actions";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
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
    title: job ? `Edit: ${job.title as string}` : "Edit Job",
  };
}

export default async function EditJobPage({ params }: PageProps) {
  const { id: jobId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, title, slug, description, employment_type, role_category, compensation_min, compensation_max, compensation_period, compensation_visible, benefits, requirements, status, posted_at, applications_count, views, hide_stages_from_candidate"
    )
    .eq("id", jobId)
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  if (!job) notFound();

  const [
    { data: locations },
    { data: jobLocations },
    { data: jobSkills },
    { data: rawQuestions },
  ] = await Promise.all([
    supabase
      .from("dso_locations")
      .select("id, name, city, state")
      .eq("dso_id", dsoUser.dso_id)
      .order("name"),
    supabase.from("job_locations").select("location_id").eq("job_id", jobId),
    supabase.from("job_skills").select("skill").eq("job_id", jobId),
    supabase
      .from("job_screening_questions")
      .select("id, prompt, helper_text, kind, options, required, sort_order")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
  ]);

  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    city: (l.city as string | null) ?? null,
    state: (l.state as string | null) ?? null,
  }));

  const initial: JobWizardInitial = {
    id: job.id as string,
    title: job.title as string,
    description: (job.description as string) ?? "",
    employment_type: job.employment_type as string,
    role_category: job.role_category as string,
    compensation_min: (job.compensation_min as number | null) ?? null,
    compensation_max: (job.compensation_max as number | null) ?? null,
    compensation_period: (job.compensation_period as string | null) ?? null,
    compensation_visible: (job.compensation_visible as boolean) ?? true,
    benefits: ((job.benefits as string[] | null) ?? []) as string[],
    requirements: (job.requirements as string | null) ?? null,
    status: job.status as string,
    location_ids: ((jobLocations ?? []) as Array<{ location_id: string }>).map(
      (jl) => jl.location_id
    ),
    skills: ((jobSkills ?? []) as Array<{ skill: string }>).map((s) => s.skill),
    hide_stages_from_candidate:
      (job.hide_stages_from_candidate as boolean | null) ?? false,
  };

  const initialQuestions: WizardScreeningQuestion[] = (
    (rawQuestions ?? []) as Array<{
      id: string;
      prompt: string;
      helper_text: string | null;
      kind: WizardScreeningQuestion["kind"];
      options: Array<{ id: string; label: string }> | null;
      required: boolean;
      sort_order: number;
    }>
  ).map((q) => ({
    id: q.id,
    persisted: true,
    prompt: q.prompt,
    helper_text: q.helper_text,
    kind: q.kind,
    options: q.options,
    required: q.required,
    sort_order: q.sort_order,
  }));

  return (
    <EmployerShell active="jobs">
      <Link
        href={`/employer/jobs/${initial.id}`}
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Pipeline
      </Link>

      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Edit Job
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          {initial.title}
        </h1>
        {initial.status === "active" && (
          <Link
            href={`/jobs/${job.id}`}
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-heritage hover:text-heritage-deep transition-colors font-semibold"
          >
            View public listing
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </header>

      <JobWizard
        dsoId={dsoUser.dso_id}
        locations={locationOptions}
        mode="edit"
        initial={initial}
        initialQuestions={initialQuestions}
      />

      {/* Soft-delete (separated from main form for safety) */}
      <section className="mt-16 pt-10 border-t border-[var(--rule)] max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-red-700 mb-2">
          Danger Zone
        </div>
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
          Delete this job posting
        </h2>
        <p className="text-[14px] text-slate-body leading-relaxed mb-5 max-w-[560px]">
          Soft-deletes the job. It stops showing publicly immediately, but
          historical applications stay linked for your records.
        </p>
        <form action={softDeleteJobAction} className="inline-block">
          <input type="hidden" name="job_id" value={initial.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-300 text-red-700 text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Job
          </button>
        </form>
      </section>
    </EmployerShell>
  );
}

async function softDeleteJobAction(formData: FormData) {
  "use server";
  await softDeleteJob({ ok: false }, formData);
}
