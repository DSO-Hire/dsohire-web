/**
 * /employer/jobs/[id]/edit — sectioned edit page (Phase 4.7.b).
 *
 * The wizard chrome (Step X of 5 + Continue button) is gone. Replaced
 * with five inline-editable section cards (Basics / Description /
 * Compensation & Details / Screening / Status), each with its own Save
 * button + per-section server action. Pattern parallels the candidate
 * profile editor (Phase 4.2.b) but uses inline editing rather than modal
 * sheets — the JD's TipTap editor and the screening-question CRUD UI are
 * too heavy for a sheet, and editing a job is a "lean in" surface, not a
 * "dip in and out" one.
 *
 * Soft-delete danger zone stays at the bottom, separated from the form
 * sections by a rule.
 *
 * Back link returns to /employer/jobs/[id] (the pipeline view).
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import {
  loadJobAttachments,
  JOB_ATTACHMENT_TIER_CAPS,
  tierLabel,
} from "@/lib/jobs/attachments";
import { softDeleteJob } from "../../actions";
import {
  EditSections,
  type EditSectionsInitial,
} from "./edit-sections";
import { JobAttachmentsSection } from "../job-attachments-section";
import type {
  LocationOption,
  WizardScreeningQuestion,
} from "../../job-wizard";
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
      "id, dso_id, title, slug, description, employment_type, role_category, compensation_min, compensation_max, compensation_period, compensation_type, compensation_visible, variable_comp_enabled, variable_comp_target, variable_comp_structure, bonus_enabled, bonus_target, bonus_structure, equity_offered, equity_note, benefits, requirements, status, posted_at, applications_count, views, hide_stages_from_candidate, scope, specialty, min_years_experience, schedule_days, schedule_evenings, schedule_weekends, corporate_function, external_links"
    )
    .eq("id", jobId)
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  if (!job) notFound();

  // 5G.d — corporate-scope jobs use the parallel corporate edit surface,
  // which renders the 16-column corporate sandbox field set instead of the
  // clinical one. The corporate edit page reciprocally bounces non-corporate
  // jobs back here, so the two routes stay scope-correct.
  if ((job.scope as string | null) === "corporate") {
    redirect(`/employer/jobs/${jobId}/edit/corporate`);
  }

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
      .select(
        "id, prompt, helper_text, kind, options, required, sort_order, knockout, knockout_correct_answer"
      )
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true }),
  ]);

  const locationOptions: LocationOption[] = (locations ?? []).map((l) => ({
    id: l.id as string,
    name: l.name as string,
    city: (l.city as string | null) ?? null,
    state: (l.state as string | null) ?? null,
  }));

  const initial: EditSectionsInitial = {
    id: job.id as string,
    title: job.title as string,
    description: (job.description as string) ?? "",
    employment_type: job.employment_type as string,
    role_category: job.role_category as string,
    compensation_min: (job.compensation_min as number | null) ?? null,
    compensation_max: (job.compensation_max as number | null) ?? null,
    compensation_period: (job.compensation_period as string | null) ?? null,
    compensation_type:
      (job.compensation_type as
        | "range"
        | "starting_at"
        | "up_to"
        | "exact"
        | "doe"
        | null) ?? "range",
    compensation_visible: (job.compensation_visible as boolean) ?? true,
    // 2026-05-14 — composable compensation components.
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
    benefits: ((job.benefits as string[] | null) ?? []) as string[],
    requirements: (job.requirements as string | null) ?? null,
    status: job.status as string,
    location_ids: ((jobLocations ?? []) as Array<{ location_id: string }>).map(
      (jl) => jl.location_id
    ),
    skills: ((jobSkills ?? []) as Array<{ skill: string }>).map((s) => s.skill),
    hide_stages_from_candidate:
      (job.hide_stages_from_candidate as boolean | null) ?? false,
    scope:
      (job.scope as "location" | "regional" | "corporate" | null) ??
      "location",
    specialty: ((job.specialty as string[] | null) ?? []) as string[],
    min_years_experience:
      (job.min_years_experience as number | null) ?? null,
    schedule_days: (((job as Record<string, unknown>).schedule_days as
      | string[]
      | null) ?? []) as string[],
    schedule_evenings: Boolean(
      (job as Record<string, unknown>).schedule_evenings
    ),
    schedule_weekends: Boolean(
      (job as Record<string, unknown>).schedule_weekends
    ),
    corporate_function:
      ((job as Record<string, unknown>).corporate_function as
        | string
        | null) ?? null,
    external_links: (((job as Record<string, unknown>).external_links as
      | Array<{ label: string; url: string }>
      | null) ?? []) as Array<{ label: string; url: string }>,
  };

  // Load attachments + active subscription tier in parallel with the
  // initial-state composition above. Both are needed to render the new
  // JobAttachmentsSection beneath the existing edit sections.
  const [attachments, sub] = await Promise.all([
    loadJobAttachments(supabase, jobId),
    getActiveSubscription(supabase, dsoUser.dso_id as string),
  ]);
  const subTier = sub?.tier ?? "starter";
  const attachmentTierCap =
    JOB_ATTACHMENT_TIER_CAPS[subTier] ?? JOB_ATTACHMENT_TIER_CAPS.starter;
  const attachmentTierLabel = tierLabel(subTier);

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
    // E2.10 — preload knockout state so the wizard editor pre-fills
    // when an admin reopens a job to tweak the knockout policy.
    knockout: q.knockout ?? false,
    knockout_correct_answer: q.knockout_correct_answer ?? null,
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
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[13px] text-heritage hover:text-heritage-deep transition-colors font-semibold"
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

      <EditSections
        dsoId={dsoUser.dso_id as string}
        initial={initial}
        initialQuestions={initialQuestions}
        locations={locationOptions}
      />

      <div className="mt-8 max-w-[820px]">
        <JobAttachmentsSection
          jobId={initial.id}
          initialAttachments={attachments}
          tierCap={attachmentTierCap}
          tierLabel={attachmentTierLabel}
        />
      </div>

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
