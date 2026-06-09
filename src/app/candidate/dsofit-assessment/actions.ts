"use server";

/**
 * DSOFit — save the corporate-side assessment.
 *
 * Mirrors the PracticeFit save action: maps the wizard's keyed answers onto the
 * candidate's DSOFit signal columns (the engine reads these for corporate
 * scoring) + stamps completion. Sparse update — blanks are skipped, never
 * overwrite good data. Every field is optional; a blank just excludes that
 * dimension (no penalty, no fabricated signal).
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// "use server" files may only EXPORT async functions — keep consts module-local.
const DSOFIT_ASSESSMENT_VERSION = "2026-06-09-v1";

type Answers = Record<string, unknown>;

interface Result {
  ok: boolean;
  error?: string;
}

/** Domain-experience buckets → a representative years number. */
const DOMAIN_YEARS_BUCKET: Record<string, number> = {
  lt2: 1,
  "2_5": 3,
  "6_10": 8,
  "10_plus": 12,
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function strArr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length ? out : [];
}
function intOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
}

export async function saveDsoFitAssessment(answers: Answers): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return { ok: false, error: "No candidate profile." };
  const candidateId = (candidate as { id: string }).id;

  const update: Record<string, unknown> = {};
  const set = (col: string, val: unknown) => {
    if (val !== null && val !== undefined) update[col] = val;
  };

  // Target & function.
  set("dsofit_function_targets", strArr(answers.dsofit_function_targets));
  set("current_title", str(answers.current_title));

  // Level & scope.
  set("seniority_level", str(answers.seniority_level));
  set("mgmt_span", str(answers.mgmt_span));
  set("pl_scope", str(answers.pl_scope));

  // Scale & domain.
  set("org_scale_experience", str(answers.org_scale_experience));
  set("domain_background", str(answers.domain_background));
  if (typeof answers.domain_years === "string") {
    const yrs = DOMAIN_YEARS_BUCKET[answers.domain_years];
    if (yrs !== undefined) set("domain_years", yrs);
  } else {
    set("domain_years", intOrNull(answers.domain_years));
  }

  // Work preferences.
  set("work_mode_pref", str(answers.work_mode_pref));
  set("travel_tolerance", str(answers.travel_tolerance));
  set("min_salary", intOrNull(answers.min_salary));
  set("salary_unit", str(answers.salary_unit));
  set("corporate_comp_interests", strArr(answers.corporate_comp_interests));

  // Strengths + work style (work_pace/autonomy_pref are shared columns).
  set("dsofit_skills", strArr(answers.dsofit_skills));
  set("work_pace", str(answers.work_pace));
  set("autonomy_pref", str(answers.autonomy_pref));

  // Clinician → corporate intent (the #48 bridge signal).
  const clin = str(answers.clinician_exploring_corporate);
  if (clin === "yes") set("clinician_exploring_corporate", true);
  else if (clin === "no") set("clinician_exploring_corporate", false);

  // Completion stamp.
  update.dsofit_assessment_completed_at = new Date().toISOString();
  void DSOFIT_ASSESSMENT_VERSION; // reserved for a future version column

  const { error } = await supabase
    .from("candidates")
    .update(update)
    .eq("id", candidateId);
  if (error) {
    console.error("[dsofit-assessment] save failed", error);
    return { ok: false, error: "Couldn't save your assessment." };
  }

  revalidatePath("/candidate/dashboard");
  return { ok: true };
}
