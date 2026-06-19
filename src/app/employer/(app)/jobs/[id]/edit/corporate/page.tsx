/**
 * /employer/jobs/[id]/edit/corporate — sectioned edit page for a CORPORATE
 * job posting (Phase 5G.d, 2026-05-14).
 *
 * The parallel route to /employer/jobs/[id]/edit (the dental-clinical
 * sectioned edit page). Five inline-editable section cards (Basics /
 * Description / Compensation & Sandbox / Screening / Status), each saving
 * on its own via a per-section server action. Pattern mirrors ../page.tsx.
 *
 * This route is for scope='corporate' jobs. If the job is NOT a corporate
 * job, bounce to the practice edit page so the operator gets the correct
 * field set (and vice-versa — the practice edit page should bounce
 * corporate jobs here; that redirect is a follow-up, out of scope for this
 * task which only builds the corporate surface).
 *
 * The select string projects every corporate sandbox column the corporate
 * edit-sections component reads — Vercel's full tsc narrows row types to
 * the projected columns, so anything referenced below MUST be in the SELECT.
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ConfidentialSearchCard } from "@/components/employer/confidential-search-card";
import { softDeleteJob } from "../../../actions";
import {
  CorporateEditSections,
  type CorporateEditSectionsInitial,
} from "./edit-sections";
import type {
  LocationOption,
  WizardScreeningQuestion,
  CompensationType,
} from "../../../job-wizard";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("title")
    .eq("id", id)
    .maybeSingle();
  return {
    title: job ? `Edit: ${job.title as string}` : "Edit Corporate Job",
  };
}

export default async function EditCorporateJobPage({ params }: PageProps) {
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

  // Every column the corporate edit-sections component touches MUST be in
  // this SELECT — Vercel's full tsc narrows the row type to projected
  // columns and errors on unprojected `job.X` references.
  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, dso_id, title, slug, description, employment_type, scope, corporate_function, authority_level, compensation_min, compensation_max, compensation_period, compensation_type, compensation_visible, requirements, status, hide_stages_from_candidate, external_links, work_mode, work_mode_detail, remote_state_restrictions, travel_expectation, travel_territory, reports_to, direct_reports_band, indirect_reports_band, education_requirement, industry_experience, min_years_corporate_experience, max_years_corporate_experience, variable_comp_enabled, variable_comp_target, variable_comp_structure, bonus_enabled, bonus_target, bonus_structure, equity_offered, equity_note, confidential"
    )
    .eq("id", jobId)
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  if (!job) notFound();

  // Scope guard — this route is corporate-only. Non-corporate jobs bounce
  // to the practice edit page so the operator sees the correct field set.
  if ((job.scope as string | null) !== "corporate") {
    redirect(`/employer/jobs/${jobId}/edit`);
  }

  const [
    { data: locations },
    { data: jobLocations },
    { data: rawQuestions },
    { data: jobVerifications },
  ] = await Promise.all([
    supabase
      .from("dso_locations")
      .select("id, name, city, state")
      .eq("dso_id", dsoUser.dso_id)
      .order("name"),
    supabase
      .from("job_locations")
      .select("location_id")
      .eq("job_id", jobId),
    supabase
      .from("job_screening_questions")
      .select(
        "id, prompt, helper_text, kind, options, required, sort_order, knockout, knockout_correct_answer"
      )
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("job_verification_requirements")
      .select("verification_type")
      .eq("job_id", jobId),
  ]);

  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    city: (l.city as string | null) ?? null,
    state: (l.state as string | null) ?? null,
  }));

  // #83 Phase 4 — roster + current assignment set for the confidential card.
  const [{ data: rosterRows }, { data: accessRows }] = await Promise.all([
    supabase
      .from("dso_users")
      .select("id, full_name, role")
      .eq("dso_id", dsoUser.dso_id)
      .order("full_name"),
    supabase.from("job_team_access").select("dso_user_id").eq("job_id", jobId),
  ]);
  const teammates = ((rosterRows ?? []) as Array<Record<string, unknown>>).map(
    (t) => ({
      id: t.id as string,
      name: ((t.full_name as string | null) ?? "Teammate").trim() || "Teammate",
      role: (t.role as string | null) ?? "",
    })
  );
  const assignedIds = (
    (accessRows ?? []) as Array<{ dso_user_id: string }>
  ).map((r) => r.dso_user_id);

  const initial: CorporateEditSectionsInitial = {
    id: job.id as string,
    title: job.title as string,
    description: (job.description as string) ?? "",
    employment_type: job.employment_type as string,
    corporate_function: (job.corporate_function as string | null) ?? null,
    authority_level: (job.authority_level as string | null) ?? null,
    compensation_min: (job.compensation_min as number | null) ?? null,
    compensation_max: (job.compensation_max as number | null) ?? null,
    compensation_period:
      (job.compensation_period as string | null) ?? null,
    compensation_type:
      ((job.compensation_type as CompensationType | null) ?? "range"),
    compensation_visible: (job.compensation_visible as boolean) ?? true,
    requirements: (job.requirements as string | null) ?? null,
    status: job.status as string,
    location_ids: ((jobLocations ?? []) as Array<{ location_id: string }>).map(
      (jl) => jl.location_id
    ),
    hide_stages_from_candidate:
      (job.hide_stages_from_candidate as boolean | null) ?? false,
    external_links: ((job.external_links as
      | Array<{ label: string; url: string }>
      | null) ?? []) as Array<{ label: string; url: string }>,
    // 16-column corporate sandbox.
    work_mode: (job.work_mode as string | null) ?? null,
    work_mode_detail: (job.work_mode_detail as string | null) ?? null,
    remote_state_restrictions: ((job.remote_state_restrictions as
      | string[]
      | null) ?? []) as string[],
    travel_expectation: (job.travel_expectation as string | null) ?? null,
    travel_territory: (job.travel_territory as string | null) ?? null,
    reports_to: (job.reports_to as string | null) ?? null,
    direct_reports_band:
      (job.direct_reports_band as string | null) ?? null,
    indirect_reports_band:
      (job.indirect_reports_band as string | null) ?? null,
    education_requirement:
      (job.education_requirement as string | null) ?? null,
    industry_experience:
      (job.industry_experience as string | null) ?? null,
    min_years_corporate_experience:
      (job.min_years_corporate_experience as number | null) ?? null,
    max_years_corporate_experience:
      (job.max_years_corporate_experience as number | null) ?? null,
    variable_comp_enabled:
      (job.variable_comp_enabled as boolean | null) ?? false,
    variable_comp_target:
      (job.variable_comp_target as number | null) ?? null,
    variable_comp_structure:
      (job.variable_comp_structure as string | null) ?? null,
    bonus_enabled: (job.bonus_enabled as boolean | null) ?? false,
    bonus_target: (job.bonus_target as number | null) ?? null,
    bonus_structure: (job.bonus_structure as string | null) ?? null,
    equity_offered: (job.equity_offered as boolean | null) ?? false,
    equity_note: (job.equity_note as string | null) ?? null,
    // 5G.e Tier 2 — verification requirements.
    verification_requirements: (
      (jobVerifications ?? []) as Array<{ verification_type: string }>
    ).map((v) => v.verification_type),
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
      knockout: boolean | null;
      knockout_correct_answer: unknown | null;
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
    knockout: q.knockout ?? false,
    knockout_correct_answer: q.knockout_correct_answer ?? null,
  }));

  return (
    <>
      <Link
        href={`/employer/jobs/${initial.id}`}
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-[#3D5266] hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Pipeline
      </Link>

      <header className="mb-8">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-[#3D5266] mb-2">
          Edit Corporate Job
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink">
          {initial.title}
        </h1>
        {initial.status === "active" && (
          <Link
            href={`/jobs/${job.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-[#3D5266] hover:text-ink transition-colors font-semibold"
          >
            View public listing
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        <p className="mt-4 max-w-[680px] text-sm text-slate-body leading-relaxed">
          Edit any section below. Each section saves on its own — no preview
          step or publish button to remember.
        </p>
      </header>

      <CorporateEditSections
        dsoId={dsoUser.dso_id as string}
        initial={initial}
        initialQuestions={initialQuestions}
        locations={locationOptions}
      />

      {/* #83 Phase 4 — confidential search (the DSOFit quiet C-suite flow). */}
      <div className="mt-8 max-w-[820px]">
        <h2 className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          Team Visibility
        </h2>
        <ConfidentialSearchCard
          jobId={initial.id}
          teammates={teammates}
          initialConfidential={Boolean(job.confidential)}
          initialAssigneeIds={assignedIds}
        />
      </div>

      {/* Soft-delete (separated from main form for safety) */}
      <section className="mt-16 pt-10 border-t border-[var(--rule)] max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-danger mb-2">
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
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-danger text-danger text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-danger-bg transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete Job
          </button>
        </form>
      </section>
    </>
  );
}

async function softDeleteJobAction(formData: FormData) {
  "use server";
  await softDeleteJob({ ok: false }, formData);
}
