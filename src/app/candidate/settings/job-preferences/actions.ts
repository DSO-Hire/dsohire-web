"use server";

/**
 * Job Preferences server actions (Phase 4.3.c).
 *
 * Replaces the redirect-to-/candidate/profile stub with a real settings tab.
 * Five independent save actions — each section saves on its own so a save
 * in one section doesn't require submitting the rest. Mirrors the
 * privacy-page pattern.
 *
 *   • saveRolesAndSpecialty   — desired_roles[], desired_specialty[]
 *   • saveLicenseStates       — license_states[] + dso_size_preference
 *                               (matching-only fields that don't appear
 *                                on the profile editor)
 *   • saveLocations           — desired_locations[] (city+state chip array)
 *   • saveSchedule            — schedule_preferences jsonb (days + relocate)
 *                               + temp_or_perm + availability
 *   • saveCompensation        — min_salary + salary_unit
 *
 * All five write to the same `candidates` row. Visibility (cv_visibility)
 * stays on the profile editor + privacy tab; this page is "where/when/how I
 * want to work" — discovery toggles live elsewhere.
 *
 * NOTE on duplication with /candidate/profile: yes, several columns are
 * editable in both places. That's intentional: profile is "what an employer
 * sees," settings is "the matching filter I want." Both write to the same
 * candidates row so they can never drift.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ROLE_CATEGORIES,
  SPECIALTIES,
  TEMP_OR_PERM_OPTIONS,
  SALARY_UNIT_OPTIONS,
  type SchedulePreferences,
} from "@/lib/candidate/canonical-lists";
import { US_STATES } from "@/lib/us-states";

type Result =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const ROLE_VALUES = new Set(ROLE_CATEGORIES.map((r) => r.value));
const SPECIALTY_VALUES = new Set(SPECIALTIES.map((s) => s.value));
const TEMP_OR_PERM_VALUES = new Set(TEMP_OR_PERM_OPTIONS.map((t) => t.value));
const SALARY_UNIT_VALUES = new Set(SALARY_UNIT_OPTIONS.map((s) => s.value));
const STATE_CODE_VALUES = new Set(US_STATES.map((s) => s.code));
const DSO_SIZE_VALUES = new Set(["small", "mid", "large", "any"]);

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────── */

async function getAuthedCandidate() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, error: "Please sign in." };
  }
  return { ok: true as const, supabase, user };
}

function revalidateAfterSave() {
  revalidatePath("/candidate/settings/job-preferences");
  revalidatePath("/candidate/profile");
}

/* ──────────────────────────────────────────────────────────────
 * 1. Roles + specialty
 * ─────────────────────────────────────────────────────────── */

export async function saveRolesAndSpecialty(input: {
  desired_roles: string[];
  desired_specialty: string[];
}): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const roles = input.desired_roles.filter((v) => ROLE_VALUES.has(v));
  const specialty = input.desired_specialty.filter((v) =>
    SPECIALTY_VALUES.has(v)
  );

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      desired_roles: roles,
      desired_specialty: specialty,
    })
    .eq("auth_user_id", ctx.user.id);

  if (error) {
    console.error("[job-preferences] saveRolesAndSpecialty", error);
    return { ok: false, error: "Couldn't save your role preferences." };
  }
  revalidateAfterSave();
  return { ok: true, message: "Roles + specialty saved." };
}

/* ──────────────────────────────────────────────────────────────
 * 2. License states + DSO size preference
 *
 * Both fields gate matching but don't appear on the profile editor.
 * License states is denormalized from candidate_licenses for query
 * speed (Talent Pool browse + job search filter read this column
 * directly without joining licenses).
 * ─────────────────────────────────────────────────────────── */

export async function saveLicenseStatesAndDsoSize(input: {
  license_states: string[];
  dso_size_preference: "small" | "mid" | "large" | "any" | null;
}): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const states = input.license_states
    .map((s) => s.trim().toUpperCase())
    .filter((s) => STATE_CODE_VALUES.has(s));
  // Dedupe.
  const dedupedStates = Array.from(new Set(states));

  if (
    input.dso_size_preference !== null &&
    !DSO_SIZE_VALUES.has(input.dso_size_preference)
  ) {
    return { ok: false, error: "Pick a valid DSO size preference." };
  }

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      license_states: dedupedStates,
      dso_size_preference: input.dso_size_preference,
    })
    .eq("auth_user_id", ctx.user.id);

  if (error) {
    console.error("[job-preferences] saveLicenseStatesAndDsoSize", error);
    return { ok: false, error: "Couldn't save your license + DSO size prefs." };
  }
  revalidateAfterSave();
  return { ok: true, message: "License states + DSO size saved." };
}

/* ──────────────────────────────────────────────────────────────
 * 3. Locations
 * ─────────────────────────────────────────────────────────── */

export async function saveLocations(input: {
  desired_locations: string[];
}): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  const cleaned = input.desired_locations
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= 80);

  const { error } = await ctx.supabase
    .from("candidates")
    .update({ desired_locations: cleaned })
    .eq("auth_user_id", ctx.user.id);

  if (error) {
    console.error("[job-preferences] saveLocations", error);
    return { ok: false, error: "Couldn't save your locations." };
  }
  revalidateAfterSave();
  return { ok: true, message: "Locations saved." };
}

/* ──────────────────────────────────────────────────────────────
 * 4. Schedule + temp/perm + availability
 * ─────────────────────────────────────────────────────────── */

export async function saveSchedule(input: {
  schedule_preferences: SchedulePreferences;
  temp_or_perm: "temp" | "perm" | "either" | null;
  availability: string | null;
}): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  if (
    input.temp_or_perm !== null &&
    !TEMP_OR_PERM_VALUES.has(input.temp_or_perm)
  ) {
    return { ok: false, error: "Pick a valid permanent/temp option." };
  }

  // Sanitize schedule keys to known weekday booleans + the two flags.
  const allowedKeys: Array<keyof SchedulePreferences> = [
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
    "evenings",
    "willing_to_relocate",
  ];
  const cleanSched: SchedulePreferences = {};
  for (const k of allowedKeys) {
    const v = input.schedule_preferences[k];
    if (typeof v === "boolean") {
      cleanSched[k] = v;
    }
  }

  const availability =
    input.availability && input.availability.length <= 50
      ? input.availability
      : null;

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      schedule_preferences: cleanSched,
      temp_or_perm: input.temp_or_perm,
      availability,
    })
    .eq("auth_user_id", ctx.user.id);

  if (error) {
    console.error("[job-preferences] saveSchedule", error);
    return { ok: false, error: "Couldn't save your schedule." };
  }
  revalidateAfterSave();
  return { ok: true, message: "Schedule + availability saved." };
}

/* ──────────────────────────────────────────────────────────────
 * 5. Compensation
 * ─────────────────────────────────────────────────────────── */

export async function saveCompensation(input: {
  min_salary: number | null;
  salary_unit: "hourly" | "yearly" | "per_visit" | "per_day" | null;
}): Promise<Result> {
  const ctx = await getAuthedCandidate();
  if (!ctx.ok) return ctx;

  if (input.salary_unit !== null && !SALARY_UNIT_VALUES.has(input.salary_unit)) {
    return { ok: false, error: "Pick a valid compensation unit." };
  }
  if (input.min_salary !== null) {
    if (
      !Number.isFinite(input.min_salary) ||
      input.min_salary < 0 ||
      input.min_salary > 10_000_000
    ) {
      return { ok: false, error: "Enter a valid minimum compensation." };
    }
  }

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      min_salary: input.min_salary,
      salary_unit: input.salary_unit,
    })
    .eq("auth_user_id", ctx.user.id);

  if (error) {
    console.error("[job-preferences] saveCompensation", error);
    return { ok: false, error: "Couldn't save your compensation." };
  }
  revalidateAfterSave();
  return { ok: true, message: "Compensation saved." };
}
