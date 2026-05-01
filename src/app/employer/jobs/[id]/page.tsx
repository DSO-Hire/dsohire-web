/**
 * /employer/jobs/[id] — edit an existing job.
 *
 * Reuses JobForm in edit mode. Also exposes status transition + soft-delete
 * actions. The view-public-listing link goes to /jobs/[slug] if the job is
 * active (clickable preview).
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JobForm, type JobFormInitial, type LocationOption } from "../job-form";
import { JobStatusActions } from "./status-actions";
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
      "id, dso_id, title, slug, description, employment_type, role_category, compensation_min, compensation_max, compensation_period, compensation_visible, benefits, requirements, status, posted_at, applications_count, views"
    )
    .eq("id", jobId)
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  if (!job) notFound();

  const [{ data: locations }, { data: jobLocations }, { data: jobSkills }] =
    await Promise.all([
      supabase
        .from("dso_locations")
        .select("id, name, city, state")
        .eq("dso_id", dsoUser.dso_id)
        .order("name"),
      supabase.from("job_locations").select("location_id").eq("job_id", jobId),
      supabase.from("job_skills").select("skill").eq("job_id", jobId),
    ]);

  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    city: (l.city as string | null) ?? null,
    state: (l.state as string | null) ?? null,
  }));

  const initial: JobFormInitial = {
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
  };

  return (
    <EmployerShell active="jobs">
      <Link
        href="/employer/jobs"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Jobs
      </Link>

      <header className="mb-10 flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
            {initial.status === "draft"
              ? "Draft Job"
              : initial.status === "active"
                ? "Active Job"
                : initial.status}
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
            {initial.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-5 text-[12px] text-slate-body">
            <span>
              <strong className="text-ink font-bold">{job.applications_count ?? 0}</strong>{" "}
              applications
            </span>
            <span>
              <strong className="text-ink font-bold">{job.views ?? 0}</strong> views
            </span>
            {initial.status === "active" && (
              <Link
                href={`/jobs/${job.id}`}
                className="inline-flex items-center gap-1 text-heritage hover:text-heritage-deep transition-colors font-semibold"
              >
                View public listing
                <ExternalLink className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>

        <JobStatusActions jobId={initial.id} currentStatus={initial.status} />
      </header>

      <JobForm
        dsoId={dsoUser.dso_id}
        locations={locationOptions}
        mode="edit"
        initial={initial}
      />

      {/* Soft-delete (separated from main form for safety) */}
      <section className="mt-16 pt-10 border-t border-[var(--rule)] max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-red-700 mb-2">
          Danger Zone
        </div>
        <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink mb-2">
          Delete this job posting
        </h2>
        <p className="text-[13px] text-slate-body leading-relaxed mb-5 max-w-[560px]">
          Soft-deletes the job. It stops showing publicly immediately, but
          historical applications stay linked for your records.
        </p>
        <form action={softDeleteJobAction} className="inline-block">
          <input type="hidden" name="job_id" value={initial.id} />
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-red-300 text-red-700 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Job
          </button>
        </form>
      </section>
    </EmployerShell>
  );
}

import { softDeleteJob } from "../actions";

async function softDeleteJobAction(formData: FormData) {
  "use server";
  await softDeleteJob({ ok: false }, formData);
}
