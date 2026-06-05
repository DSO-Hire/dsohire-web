"use server";

/**
 * PracticeFit v3 — save the assessment.
 *
 * Maps the wizard's keyed answers onto the candidate's signal columns (the
 * scoring engine reads these in Phase B) + stores the raw payload for
 * re-scoring / analytics / application autofill. Partial saves are fine —
 * unknown keys are ignored, blanks are skipped (never overwrite good data with
 * empty). Bumping practice_fit_consent isn't needed (it already defaults to
 * 'full').
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// NOTE: a "use server" file may only EXPORT async functions, so this stays
// module-local (not exported) — the build fails otherwise.
const ASSESSMENT_VERSION = "2026-06-05-v3.1";

type Answers = Record<string, unknown>;

interface Result {
  ok: boolean;
  error?: string;
}

/** Buckets → a representative dental-experience number for the engine. */
const YEARS_BUCKET: Record<string, number> = {
  new_grad: 0,
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

export async function saveAssessment(answers: Answers): Promise<Result> {
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

  // Build a sparse update — only include fields the wizard actually answered,
  // so a partial save never wipes existing profile data with blanks.
  const update: Record<string, unknown> = {};
  const set = (col: string, val: unknown) => {
    if (val !== null && val !== undefined) update[col] = val;
  };

  // Part 1 — résumé-prefilled basics (existing columns).
  set("desired_roles", strArr(answers.desired_roles));
  if (typeof answers.years_experience === "string") {
    const yrs = YEARS_BUCKET[answers.years_experience];
    if (yrs !== undefined) set("years_experience_dental", yrs);
  }
  set("desired_specialty", strArr(answers.desired_specialty));
  set("pms_systems", strArr(answers.pms_systems));
  set("temp_or_perm", str(answers.temp_or_perm));
  set("min_salary", intOrNull(answers.min_salary));
  set("salary_unit", str(answers.salary_unit));
  set("availability", str(answers.availability));

  // Part 2 — v3 signal columns.
  set("work_pace", str(answers.work_pace));
  set("autonomy_pref", str(answers.autonomy_pref));
  set("patient_facing_energy", intOrNull(answers.patient_facing_energy));
  set("mentorship_pref", str(answers.mentorship_pref));
  set("procedures_confident", strArr(answers.procedures_confident));
  set("procedures_growth", strArr(answers.procedures_growth));
  set("practice_feel", str(answers.practice_feel));
  set("ce_growth_importance", intOrNull(answers.ce_growth_importance));
  set("work_life_priority", intOrNull(answers.work_life_priority));
  set("career_trajectory", str(answers.career_trajectory));
  set("commute_max_minutes", intOrNull(answers.commute_max_minutes));
  // Ranked top-3 priorities; keep the legacy single comp_priority = the #1
  // so any back-compat reader still works.
  const rankedPriorities = strArr(answers.comp_priorities);
  set("comp_priorities", rankedPriorities);
  set(
    "comp_priority",
    rankedPriorities && rankedPriorities.length > 0
      ? rankedPriorities[0]
      : str(answers.comp_priority)
  );
  set("relocation_pref", str(answers.relocation));
  set("assessment_note", str(answers.assessment_note));

  // v3.1 — question-bank expansion signals. Stored now; the genuinely-new
  // dims stay unscored until a practice-profile mirror exists (never a penalty).
  set("pms_proficiency", str(answers.pms_proficiency));
  set("team_size_pref", str(answers.team_size_pref));
  set("patient_population_pref", strArr(answers.patient_population_pref));
  set("benefit_priorities", strArr(answers.benefit_priorities));
  set("deal_breakers", strArr(answers.deal_breakers));

  // Raw payload + metadata (re-scoring / analytics / autofill).
  update.assessment_responses = answers;
  update.assessment_completed_at = new Date().toISOString();
  update.assessment_version = ASSESSMENT_VERSION;

  const { error } = await supabase
    .from("candidates")
    .update(update)
    .eq("id", candidateId);
  if (error) {
    console.error("[assessment] save failed", error);
    return { ok: false, error: "Couldn't save your assessment." };
  }

  revalidatePath("/candidate/practice-fit");
  revalidatePath("/candidate/dashboard");
  return { ok: true };
}
