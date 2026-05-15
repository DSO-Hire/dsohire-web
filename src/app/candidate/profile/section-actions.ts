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
import { parseSalutation } from "@/lib/candidate/name";

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
  first_name: string;
  last_name: string;
  salutation?: string | null;
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

  const firstName = input.first_name.trim();
  const lastName = input.last_name.trim();
  if (!firstName || !lastName) {
    return { ok: false, error: "First and last name are required." };
  }

  const { error } = await ctx.supabase
    .from("candidates")
    .update({
      first_name: firstName,
      last_name: lastName,
      salutation: parseSalutation(input.salutation),
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

  // Defense in depth — DSO Hire intentionally does not collect DEA
  // registrations (memory: feedback_legal_shield_default_posture.md +
  // privacy policy disclaimer). DEA format is 2 letters + 7 digits.
  // Reject the input rather than silently storing a fraud-enabling ID
  // even if a candidate ignores the field label + helper text.
  if (input.license_number) {
    const candidate = input.license_number
      .toUpperCase()
      .replace(/[\s-]/g, "");
    if (/^[A-Z]{2}\d{7}$/.test(candidate)) {
      return {
        ok: false,
        error:
          "That looks like a DEA number — please enter your state board license number instead. DSO Hire doesn't collect DEA registrations.",
      };
    }
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

// ─────────────────────────────────────────────────────────────────────
// Credential file uploads (Phase 5B v1)
//
// Both candidate_licenses and candidate_certifications carry a
// `document_path text` column. We host the PDF/image attachment in the
// `candidate-credentials` private storage bucket, keyed by auth.uid()/
// rowId/timestamp-filename so each candidate is namespaced and old
// versions are recoverable until the row is deleted.
//
// Three actions, parameterized by `kind`:
//   • uploadCredentialFile          — multipart FormData → bucket upload
//                                      + row.document_path patch
//   • removeCredentialFile          — clears document_path + drops object
//   • getCredentialFileSignedUrl    — mints a 60s signed URL for download
//
// Pattern mirrors src/app/candidate/settings/credentials/ce-actions.ts.
// ─────────────────────────────────────────────────────────────────────

const CREDENTIAL_BUCKET = "candidate-credentials";
const CREDENTIAL_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);
const CREDENTIAL_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export type CredentialKind = "license" | "certification";

function credentialTable(kind: CredentialKind): string {
  return kind === "license" ? "candidate_licenses" : "candidate_certifications";
}

export async function uploadCredentialFile(
  kind: CredentialKind,
  rowId: string,
  formData: FormData
): Promise<{ ok: true; filePath: string } | { ok: false; error: string }> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file provided." };
  }
  if (!CREDENTIAL_MIME.has(file.type)) {
    return {
      ok: false,
      error: "Only PDF, PNG, JPEG, or WebP files are allowed.",
    };
  }
  if (file.size > CREDENTIAL_MAX_BYTES) {
    return { ok: false, error: "File is over the 10MB cap." };
  }

  const table = credentialTable(kind);

  // Verify the row belongs to the candidate before writing storage.
  const { data: row } = await ctx.supabase
    .from(table)
    .select("id, document_path")
    .eq("id", rowId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!row) {
    return { ok: false, error: "Credential entry not found." };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${ctx.user.id}/${kind}/${rowId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await ctx.supabase.storage
    .from(CREDENTIAL_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    console.error("[credentials] uploadCredentialFile storage", uploadError);
    return { ok: false, error: "Couldn't upload the file." };
  }

  // Best-effort cleanup of the previous attachment.
  const oldPath = (row as Record<string, unknown>).document_path as
    | string
    | null;
  if (oldPath && oldPath !== path) {
    await ctx.supabase.storage.from(CREDENTIAL_BUCKET).remove([oldPath]);
  }

  const { error: rowError } = await ctx.supabase
    .from(table)
    .update({ document_path: path })
    .eq("id", rowId)
    .eq("candidate_id", ctx.candidateId);
  if (rowError) {
    console.error("[credentials] uploadCredentialFile row", rowError);
    // Orphan cleanup so the bucket doesn't accumulate unreferenced blobs.
    await ctx.supabase.storage.from(CREDENTIAL_BUCKET).remove([path]);
    return {
      ok: false,
      error: "Couldn't link the file to your credential.",
    };
  }

  revalidatePath("/candidate/profile");
  return { ok: true, filePath: path };
}

export async function removeCredentialFile(
  kind: CredentialKind,
  rowId: string
): Promise<Result> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const table = credentialTable(kind);
  const { data: row } = await ctx.supabase
    .from(table)
    .select("document_path")
    .eq("id", rowId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Credential entry not found." };

  const path = (row as Record<string, unknown>).document_path as
    | string
    | null;
  if (path) {
    await ctx.supabase.storage.from(CREDENTIAL_BUCKET).remove([path]);
  }

  const { error } = await ctx.supabase
    .from(table)
    .update({ document_path: null })
    .eq("id", rowId)
    .eq("candidate_id", ctx.candidateId);

  if (error) {
    console.error("[credentials] removeCredentialFile", error);
    return { ok: false, error: "Couldn't clear the file." };
  }
  revalidatePath("/candidate/profile");
  return { ok: true };
}

export async function getCredentialFileSignedUrl(
  kind: CredentialKind,
  rowId: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await getCandidateContext();
  if (!ctx.ok) return ctx;

  const table = credentialTable(kind);
  const { data: row } = await ctx.supabase
    .from(table)
    .select("document_path")
    .eq("id", rowId)
    .eq("candidate_id", ctx.candidateId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Credential entry not found." };

  const path = (row as Record<string, unknown>).document_path as
    | string
    | null;
  if (!path) return { ok: false, error: "No file attached." };

  const { data, error } = await ctx.supabase.storage
    .from(CREDENTIAL_BUCKET)
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    console.error("[credentials] getCredentialFileSignedUrl", error);
    return { ok: false, error: "Couldn't generate a download link." };
  }
  return { ok: true, url: data.signedUrl };
}
