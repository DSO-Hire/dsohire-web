"use server";

/**
 * Inline editor server action (Phase 5D v1.3).
 *
 * Powers the small inline forms in WhyThisMatch's UnscoredDimRow that
 * let candidates fix simple single-value preferences without leaving
 * the page. Multi-select dims (specialty, skills, license_states)
 * still link out to /candidate/profile sections — those need full
 * chip-picker UX that doesn't fit in an expander row.
 *
 * Supported dim keys:
 *   • compensation       → min_salary + salary_unit
 *   • years_experience   → years_experience_dental (int)
 *   • employment_type    → temp_or_perm enum
 *   • dso_size           → dso_size_preference enum
 *
 * Validation is intentionally narrow — we trust the candidate, but we
 * don't trust unbounded ints or arbitrary string enum values. After
 * save, revalidatePath() on every surface that renders WhyThisMatch
 * so the fit recomputes via input_hash drift on next render.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FitDimensionKey } from "./types";

export type InlineDimResult =
  | { ok: true }
  | { ok: false; error: string };

const DIMS_WITH_INLINE_EDITORS: ReadonlySet<FitDimensionKey> = new Set([
  "compensation",
  "years_experience",
  "employment_type",
  "dso_size",
]);

export interface UpdateInlineDimInput {
  dimKey: FitDimensionKey;
  /** Stringly-typed payload from the form; shape varies per dim. */
  payload: Record<string, string>;
}

const SalaryUnitSchema = z.enum(["hourly", "yearly", "per_visit", "per_day"]);
const TempOrPermSchema = z.enum(["temp", "perm", "either"]);
const DsoSizeSchema = z.enum(["small", "mid", "large", "any"]);

export async function updateInlineDim(
  input: UpdateInlineDimInput
): Promise<InlineDimResult> {
  if (!DIMS_WITH_INLINE_EDITORS.has(input.dimKey)) {
    return { ok: false, error: "This field doesn't support inline edit." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  // Resolve the candidate row before writing — RLS will enforce
  // ownership on the update, but we want a clear error on missing rows.
  const { data: cand } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!cand) {
    return { ok: false, error: "Candidate profile not found." };
  }

  const candidateId = (cand as { id: string }).id;

  // Per-dim validation + update payload assembly.
  const updates: Record<string, unknown> = {};
  switch (input.dimKey) {
    case "compensation": {
      const min = parseInt((input.payload.min_salary ?? "").trim(), 10);
      if (Number.isNaN(min) || min < 0) {
        return { ok: false, error: "Enter a valid minimum salary." };
      }
      if (min > 10_000_000) {
        return { ok: false, error: "That salary looks too high." };
      }
      const unitParse = SalaryUnitSchema.safeParse(input.payload.salary_unit);
      if (!unitParse.success) {
        return { ok: false, error: "Pick a valid pay period." };
      }
      updates.min_salary = min;
      updates.salary_unit = unitParse.data;
      break;
    }
    case "years_experience": {
      const yrs = parseInt((input.payload.years ?? "").trim(), 10);
      if (Number.isNaN(yrs) || yrs < 0) {
        return { ok: false, error: "Enter a valid number of years." };
      }
      if (yrs > 80) {
        return { ok: false, error: "That's a lot of years — please double-check." };
      }
      updates.years_experience_dental = yrs;
      break;
    }
    case "employment_type": {
      const parse = TempOrPermSchema.safeParse(input.payload.temp_or_perm);
      if (!parse.success) {
        return { ok: false, error: "Pick a valid preference." };
      }
      updates.temp_or_perm = parse.data;
      break;
    }
    case "dso_size": {
      const parse = DsoSizeSchema.safeParse(input.payload.dso_size_preference);
      if (!parse.success) {
        return { ok: false, error: "Pick a valid DSO size preference." };
      }
      updates.dso_size_preference = parse.data;
      break;
    }
  }

  const { error } = await supabase
    .from("candidates")
    .update(updates)
    .eq("id", candidateId);
  if (error) {
    console.error("[practice-fit/inline-edit] update failed:", error);
    return { ok: false, error: "Save failed. Try again." };
  }

  // Refresh every surface that renders WhyThisMatch so the fit
  // recomputes on next render. The candidate's input_hash now differs
  // from any cached row → get-or-compute will recompute.
  revalidatePath("/candidate/dashboard");
  revalidatePath("/candidate/applications");
  // /jobs/[id] may render the chip too; revalidate the route (covers
  // any [id] dynamic).
  revalidatePath("/jobs", "layout");
  // /candidate/profile so the answer reflects there too.
  revalidatePath("/candidate/profile");

  return { ok: true };
}
