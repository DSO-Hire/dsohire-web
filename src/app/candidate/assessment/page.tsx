/**
 * /candidate/assessment — the PracticeFit v3 assessment (Phase A).
 *
 * The ~5-min, mostly tap-to-answer flow that captures the moat data no résumé
 * contains (work pace, autonomy, mentorship, clinical confidence, culture feel,
 * what-matters-most). Part 1 basics are PRE-FILLED from the candidate's profile
 * (which the résumé importer populates) and shown to confirm; Part 2 is always
 * asked. Saving maps answers onto the candidate's signal columns + stores the
 * raw payload for re-scoring and application autofill.
 *
 * Graceful for everyone: new grads, career-changers, and no-résumé candidates
 * all have a first-class path — every experience question has a positive
 * "new / growing" answer that's excluded from the denominator, never penalized.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AssessmentWizard } from "./assessment-wizard";

export const metadata: Metadata = { title: "PracticeFit Assessment" };

/** Reverse of the save-side YEARS_BUCKET: pick a bucket from a year count. */
function yearsBucket(n: number | null): string | null {
  if (n == null) return null;
  if (n <= 0) return "new_grad";
  if (n < 2) return "lt2";
  if (n <= 5) return "2_5";
  if (n <= 10) return "6_10";
  return "10_plus";
}

export default async function CandidateAssessmentPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/assessment");

  const { data: candidateRow } = await supabase
    .from("candidates")
    .select(
      // Part 1 (résumé-prefilled basics) + Part 2 (v3 signal columns, so a
      // re-take shows prior answers).
      "id, desired_roles, years_experience_dental, desired_specialty, pms_systems, temp_or_perm, min_salary, salary_unit, availability, work_pace, autonomy_pref, patient_facing_energy, mentorship_pref, procedures_confident, procedures_growth, practice_feel, ce_growth_importance, work_life_priority, career_trajectory, commute_max_minutes, comp_priority, relocation_pref, assessment_note"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidateRow) redirect("/candidate/dashboard");

  const c = candidateRow as Record<string, unknown>;

  // Build the wizard's keyed prefill. Anything null simply renders unanswered.
  const initial: Record<string, unknown> = {
    desired_roles: (c.desired_roles as string[] | null) ?? [],
    years_experience: yearsBucket(
      (c.years_experience_dental as number | null) ?? null
    ),
    desired_specialty: (c.desired_specialty as string[] | null) ?? [],
    pms_systems: (c.pms_systems as string[] | null) ?? [],
    temp_or_perm: (c.temp_or_perm as string | null) ?? null,
    min_salary: (c.min_salary as number | null) ?? null,
    salary_unit: (c.salary_unit as string | null) ?? "hourly",
    availability: (c.availability as string | null) ?? null,
    work_pace: (c.work_pace as string | null) ?? null,
    autonomy_pref: (c.autonomy_pref as string | null) ?? null,
    patient_facing_energy:
      (c.patient_facing_energy as number | null) ?? null,
    mentorship_pref: (c.mentorship_pref as string | null) ?? null,
    procedures_confident: (c.procedures_confident as string[] | null) ?? [],
    procedures_growth: (c.procedures_growth as string[] | null) ?? [],
    practice_feel: (c.practice_feel as string | null) ?? null,
    ce_growth_importance: (c.ce_growth_importance as number | null) ?? null,
    work_life_priority: (c.work_life_priority as number | null) ?? null,
    career_trajectory: (c.career_trajectory as string | null) ?? null,
    commute_max_minutes: (c.commute_max_minutes as number | null) ?? null,
    comp_priority: (c.comp_priority as string | null) ?? null,
    relocation: (c.relocation_pref as string | null) ?? null,
    assessment_note: (c.assessment_note as string | null) ?? "",
  };

  return (
    <CandidateShell active="practice-fit">
      <header className="mb-8 max-w-[680px]">
        <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] leading-tight text-ink">
          Two quick steps, about five minutes.
        </h1>
        <p className="mt-3 text-base text-slate-body">
          This is how practices find <em>you</em>. We pre-filled what we could
          from your profile — confirm it, then answer a few questions no résumé
          can capture. The more you share, the sharper your matches. You can
          stop anytime; nothing here is required.
        </p>
      </header>

      <AssessmentWizard initial={initial} />
    </CandidateShell>
  );
}
