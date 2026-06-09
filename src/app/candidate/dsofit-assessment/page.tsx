/**
 * /candidate/dsofit-assessment — the DSOFit (corporate-side) assessment.
 *
 * The corporate sibling of the PracticeFit assessment: a ~5-min tap-to-answer
 * flow capturing the signals the engine scores corporate roles on (function,
 * level, scope, multi-site scale, domain, work mode). Pre-fills any prior
 * answers so a re-take shows them. Saving maps answers onto the candidate's
 * DSOFit signal columns. Every question is optional — a blank just excludes that
 * dimension, never a penalty.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DsoFitAssessmentWizard } from "./dsofit-assessment-wizard";

export const metadata: Metadata = { title: "DSOFit Assessment" };

/** Reverse of the save-side DOMAIN_YEARS_BUCKET: bucket from a year count. */
function domainYearsBucket(n: number | null): string | null {
  if (n == null) return null;
  if (n < 2) return "lt2";
  if (n <= 5) return "2_5";
  if (n <= 10) return "6_10";
  return "10_plus";
}

export default async function DsoFitAssessmentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/dsofit-assessment");

  // select("*") (rather than naming the new DSOFit columns) so this compiles
  // before database.types.ts is regenerated for the dsofit_candidate_signals
  // migration; we read the new columns off the Record cast below. (Types regen
  // is a tracked follow-up.)
  const { data: candidateRow } = await supabase
    .from("candidates")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidateRow) redirect("/candidate/dashboard");

  const c = candidateRow as Record<string, unknown>;
  const clin = c.clinician_exploring_corporate;
  const salaryNum = c.min_salary as number | null;

  const initial: Record<string, unknown> = {
    dsofit_function_targets: (c.dsofit_function_targets as string[] | null) ?? [],
    current_title: (c.current_title as string | null) ?? "",
    seniority_level: (c.seniority_level as string | null) ?? null,
    mgmt_span: (c.mgmt_span as string | null) ?? null,
    pl_scope: (c.pl_scope as string | null) ?? null,
    org_scale_experience: (c.org_scale_experience as string | null) ?? null,
    domain_background: (c.domain_background as string | null) ?? null,
    domain_years: domainYearsBucket((c.domain_years as number | null) ?? null),
    work_mode_pref: (c.work_mode_pref as string | null) ?? null,
    travel_tolerance: (c.travel_tolerance as string | null) ?? null,
    min_salary: salaryNum != null ? String(salaryNum) : "",
    salary_unit: (c.salary_unit as string | null) ?? "yearly",
    corporate_comp_interests: (c.corporate_comp_interests as string[] | null) ?? [],
    dsofit_skills: (c.dsofit_skills as string[] | null) ?? [],
    work_pace: (c.work_pace as string | null) ?? null,
    autonomy_pref: (c.autonomy_pref as string | null) ?? null,
    clinician_exploring_corporate:
      clin === true ? "yes" : clin === false ? "no" : null,
  };

  return (
    <CandidateShell active="practice-fit">
      <DsoFitAssessmentWizard
        initial={initial}
        completedBefore={c.dsofit_assessment_completed_at != null}
      />
    </CandidateShell>
  );
}
