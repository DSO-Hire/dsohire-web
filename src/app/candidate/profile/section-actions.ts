"use server";

/**
 * Section-by-section profile edit server actions (Phase 4.2.b).
 *
 * One action per section card on /candidate/profile:
 *   - upsertIdentity         — name, headline, summary, pronouns, phone,
 *                              location, years_experience_dental, linkedin
 *   - upsertRolePreferences  — desired_roles[], desired_specialty[],
 *                              temp_or_perm
 *   - upsertSkillsLanguages  — skills[], languages[]
 *   - upsertJobPreferences   — desired_locations[], min_salary,
 *                              salary_unit, schedule_preferences,
 *                              cv_visibility
 *   - upsertWorkHistoryEntry / deleteWorkHistoryEntry
 *   - upsertEducationEntry   / deleteEducationEntry
 *   - upsertLicenseEntry     / deleteLicenseEntry
 *   - upsertCertificationEntry / deleteCertificationEntry
 *
 * Practice Fit section is read-only at v1 (Phase 5D placeholder).
 *
 * All actions revalidate /candidate/profile so the section card preview
 * reflects the new state immediately. RLS enforces ownership at the DB
 * layer; we still gate on auth at the app layer for clean error UX.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SchedulePreferences } from "@/lib/candidate/canonical-lists";

type Result =
  | { ok: true }
  | { ok: false; error: string };

async function getCandidateContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };

  const { data: candidate } = await supabase
    .from("candidates")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) {
    return { ok: false as const, error: "Candidate record missing." };
  }
  return {
    ok: true as const,
    supabase,
    user,
    candidateId: candidate.id as string,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────

export interface IdentityInput {
  full_name: string;
  pronouns?: string | null;
  headline?: string | null;
  summary?: string | null;
  phone?: string | null;
  current_location_city?: string | null;
  current_location_state?: string | null;
  years_experience_dental?: number | null;
  linkedin_url?: string | null;
}

export async function upsertIdentity(input: IdentityInput): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const fullName = input.full_name.trim();
  if (!fullName) return { ok: false, error: "Full name is required." };

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      full_name: fullName,
      pronouns: input.pronouns?.trim() || null,
      headline: input.headline?.trim() || null,
      summary: input.summary?.trim() || null,
      phone: input.phone?.trim() || null,
      current_location_city: input.current_location_city?.trim() || null,
      current_location_state:
        input.current_location_state?.trim().toUpperCase().slice(0, 2) || null,
      years_experience_dental:
        typeof input.years_experience_dental === "number"
          ? input.years_experience_dental
          : null,
      linkedin_url: input.linkedin_url?.trim() || null,
    })
    .eq("id", ctx.candidateId);

  if (error) {
    console.error("[profile/upsertIdentity]", error);
    return { ok: false, error: "Couldn't save identity changes." };
  }
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Role & Specialty
// ─────────────────────────────────────────────────────────────────────

export async function upsertRolePreferences(input: {
  desired_roles: string[];
  desired_specialty: string[];
  temp_or_perm?: "temp" | "perm" | "either" | null;
}): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      desired_roles: dedupe(input.desired_roles),
      desired_specialty: dedupe(input.desired_specialty),
      temp_or_perm: input.temp_or_perm ?? null,
    })
    .eq("id", ctx.candidateId);

  if (error) {
    console.error("[profile/upsertRolePreferences]", error);
    return { ok: false, error: "Couldn't save role preferences." };
  }
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Skills & Languages
// ─────────────────────────────────────────────────────────────────────

export async function upsertSkillsLanguages(input: {
  skills: string[];
  languages: string[];
  pms_systems: string[];
}): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      skills: dedupe(input.skills),
      languages: dedupe(input.languages),
      pms_systems: dedupe(input.pms_systems),
    })
    .eq("id", ctx.candidateId);

  if (error) {
    console.error("[profile/upsertSkillsLanguages]", error);
    return { ok: false, error: "Couldn't save skills + languages." };
  }
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Job Preferences
// ─────────────────────────────────────────────────────────────────────

export interface JobPreferencesInput {
  desired_locations: string[]; // free-text city/state strings (4.3.c will refine)
  min_salary?: number | null;
  salary_unit?: "hourly" | "yearly" | "per_visit" | "per_day" | null;
  schedule_preferences: SchedulePreferences;
  cv_visibility: "hidden" | "recruiters_only" | "open_to_work";
  availability?: string | null;
}

export async function upsertJobPreferences(
  input: JobPreferencesInput
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      desired_locations: dedupe(input.desired_locations),
      min_salary:
        typeof input.min_salary === "number" ? input.min_salary : null,
      salary_unit: input.salary_unit ?? null,
      schedule_preferences: input.schedule_preferences ?? {},
      cv_visibility: input.cv_visibility,
      availability: input.availability || null,
    })
    .eq("id", ctx.candidateId);

  if (error) {
    console.error("[profile/upsertJobPreferences]", error);
    return { ok: false, error: "Couldn't save job preferences." };
  }
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Work history
// ─────────────────────────────────────────────────────────────────────

export interface WorkHistoryInput {
  id?: string; // present on edit, absent on insert
  title: string;
  company_name: string;
  is_dso: boolean | null;
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  pms_systems_used: string[];
  procedures_performed: string[];
  auto_blocklisted: boolean;
}

export async function upsertWorkHistoryEntry(
  input: WorkHistoryInput
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  if (!input.title.trim() || !input.company_name.trim()) {
    return { ok: false, error: "Title and company name are required." };
  }

  const payload = {
    candidate_id: ctx.candidateId,
    title: input.title.trim(),
    company_name: input.company_name.trim(),
    is_dso: input.is_dso,
    start_date: normalizeDate(input.start_date),
    end_date: input.is_current ? null : normalizeDate(input.end_date),
    is_current: input.is_current,
    description: input.description?.trim() || null,
    pms_systems_used: dedupe(input.pms_systems_used),
    procedures_performed: dedupe(input.procedures_performed),
    auto_blocklisted: input.auto_blocklisted,
  };

  if (input.id) {
    const { error } = await ctx.supabase
      .from("candidate_work_history")
      .update(payload)
      .eq("id", input.id)
      .eq("candidate_id", ctx.candidateId); // belt-and-suspenders against drift
    if (error) {
      console.error("[profile/upsertWorkHistoryEntry] update", error);
      return { ok: false, error: "Couldn't save work history entry." };
    }
  } else {
    const { error } = await ctx.supabase
      .from("candidate_work_history")
      .insert(payload);
    if (error) {
      console.error("[profile/upsertWorkHistoryEntry] insert", error);
      return { ok: false, error: "Couldn't add work history entry." };
    }
  }

  revalidatePath("/candidate/profile");
  return { ok: true };
}

export async function deleteWorkHistoryEntry(id: string): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase
    .from("candidate_work_history")
    .delete()
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);
  if (error) return { ok: false, error: "Couldn't remove that entry." };
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Education
// ─────────────────────────────────────────────────────────────────────

export interface EducationInput {
  id?: string;
  school_name: string;
  degree: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
}

export async function upsertEducationEntry(
  input: EducationInput
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;
  if (!input.school_name.trim()) {
    return { ok: false, error: "School name is required." };
  }

  const payload = {
    candidate_id: ctx.candidateId,
    school_name: input.school_name.trim(),
    degree: input.degree?.trim() || null,
    field_of_study: input.field_of_study?.trim() || null,
    start_year: input.start_year ?? null,
    end_year: input.end_year ?? null,
    description: input.description?.trim() || null,
  };

  if (input.id) {
    const { error } = await ctx.supabase
      .from("candidate_education")
      .update(payload)
      .eq("id", input.id)
      .eq("candidate_id", ctx.candidateId);
    if (error) return { ok: false, error: "Couldn't save education entry." };
  } else {
    const { error } = await ctx.supabase
      .from("candidate_education")
      .insert(payload);
    if (error) return { ok: false, error: "Couldn't add education entry." };
  }

  revalidatePath("/candidate/profile");
  return { ok: true };
}

export async function deleteEducationEntry(id: string): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase
    .from("candidate_education")
    .delete()
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);
  if (error) return { ok: false, error: "Couldn't remove that entry." };
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Licenses
// ─────────────────────────────────────────────────────────────────────

export interface LicenseInput {
  id?: string;
  license_type: string;
  license_number: string | null;
  state: string | null;
  issued_date: string | null;
  expires_date: string | null;
  display_number: boolean;
}

export async function upsertLicenseEntry(
  input: LicenseInput
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;
  if (!input.license_type.trim()) {
    return { ok: false, error: "License type is required." };
  }

  const payload = {
    candidate_id: ctx.candidateId,
    license_type: input.license_type.trim(),
    license_number: input.license_number?.trim() || null,
    state:
      input.state?.trim().toUpperCase().slice(0, 2) || null,
    issued_date: normalizeDate(input.issued_date),
    expires_date: normalizeDate(input.expires_date),
    display_number: input.display_number,
  };

  if (input.id) {
    const { error } = await ctx.supabase
      .from("candidate_licenses")
      .update(payload)
      .eq("id", input.id)
      .eq("candidate_id", ctx.candidateId);
    if (error) return { ok: false, error: "Couldn't save license entry." };
  } else {
    const { error } = await ctx.supabase
      .from("candidate_licenses")
      .insert(payload);
    if (error) return { ok: false, error: "Couldn't add license entry." };
  }

  revalidatePath("/candidate/profile");
  return { ok: true };
}

export async function deleteLicenseEntry(id: string): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase
    .from("candidate_licenses")
    .delete()
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);
  if (error) return { ok: false, error: "Couldn't remove that license." };
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Certifications
// ─────────────────────────────────────────────────────────────────────

export interface CertificationInput {
  id?: string;
  kind: string;
  level: string | null;
  issued_date: string | null;
  expires_date: string | null;
}

export async function upsertCertificationEntry(
  input: CertificationInput
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;
  if (!input.kind.trim()) {
    return { ok: false, error: "Certification type is required." };
  }

  const payload = {
    candidate_id: ctx.candidateId,
    kind: input.kind.trim(),
    level: input.level?.trim() || null,
    issued_date: normalizeDate(input.issued_date),
    expires_date: normalizeDate(input.expires_date),
  };

  if (input.id) {
    const { error } = await ctx.supabase
      .from("candidate_certifications")
      .update(payload)
      .eq("id", input.id)
      .eq("candidate_id", ctx.candidateId);
    if (error)
      return { ok: false, error: "Couldn't save certification entry." };
  } else {
    const { error } = await ctx.supabase
      .from("candidate_certifications")
      .insert(payload);
    if (error)
      return { ok: false, error: "Couldn't add certification entry." };
  }

  revalidatePath("/candidate/profile");
  return { ok: true };
}

export async function deleteCertificationEntry(id: string): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;
  const { error } = await ctx.supabase
    .from("candidate_certifications")
    .delete()
    .eq("id", id)
    .eq("candidate_id", ctx.candidateId);
  if (error) return { ok: false, error: "Couldn't remove that entry." };
  revalidatePath("/candidate/profile");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of arr) {
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function normalizeDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  if (/^\d{4}$/.test(t)) return `${t}-01-01`;
  return null;
}
