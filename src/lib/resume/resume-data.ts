/**
 * #87a — Résumé data layer (server fetch).
 *
 * The résumé is a RENDER of the canonical profile, never a 4th data silo
 * (TASKS.md #87). This module pulls the candidate's profile + the four
 * structured child tables into one normalized `ResumeData`. Pure types +
 * formatting live in resume-format.ts (client-safe); this file adds the
 * server fetch and re-exports the rest for back-compat.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  type ResumeData,
  roleLabel,
  specialtyLabel,
  licenseTypeLabel,
  certKindLabel,
  monthYear,
  dateRange,
  resumeHasContent,
} from "@/lib/resume/resume-format";

export type {
  ResumeData,
  ResumeWork,
  ResumeEducation,
  ResumeLicense,
  ResumeCert,
} from "@/lib/resume/resume-format";
export {
  roleLabel,
  specialtyLabel,
  licenseTypeLabel,
  certKindLabel,
  monthYear,
  dateRange,
  resumeHasContent,
};

import {
  type ResumeTemplateId,
  DEFAULT_RESUME_TEMPLATE,
  getResumeTemplate,
} from "@/lib/resume/resume-templates";

const arr = (v: unknown): string[] => ((v as string[] | null) ?? []) as string[];

/** The candidate's saved résumé template id (normalized; default when unset). */
export async function getResumeTemplateId(): Promise<ResumeTemplateId> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_RESUME_TEMPLATE;
  const { data } = await supabase
    .from("candidates")
    .select("resume_template")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const id = (data as Record<string, unknown> | null)?.resume_template as
    | string
    | null;
  return getResumeTemplate(id).id;
}

/**
 * Fetch the signed-in candidate's résumé data. Returns null when there's no
 * authenticated candidate row. Child tables are RLS-scoped to the candidate
 * (same as the profile page), so no explicit candidate_id filter is needed.
 */
export async function getResumeData(): Promise<ResumeData | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: cRow },
    { data: work },
    { data: edu },
    { data: lic },
    { data: cert },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, first_name, last_name, headline, summary, phone, current_location_city, current_location_state, linkedin_url, years_experience, years_experience_dental, desired_roles, desired_specialty, skills, languages, pms_systems"
      )
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("candidate_work_history")
      .select(
        "id, title, company_name, is_dso, start_date, end_date, is_current, description"
      )
      .order("is_current", { ascending: false })
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("candidate_education")
      .select("id, school_name, degree, field_of_study, start_year, end_year, description")
      .order("end_year", { ascending: false, nullsFirst: false }),
    supabase
      .from("candidate_licenses")
      .select("id, license_type, license_number, state, expires_date, display_number")
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_certifications")
      .select("id, kind, level, expires_date")
      .order("expires_date", { ascending: true, nullsFirst: false }),
  ]);

  if (!cRow) return null;
  const c = cRow as Record<string, unknown>;

  const name =
    ((c.full_name as string | null) ?? "").trim() ||
    `${(c.first_name as string | null) ?? ""} ${
      (c.last_name as string | null) ?? ""
    }`.trim();

  return {
    name,
    headline: (c.headline as string | null) ?? null,
    summary: (c.summary as string | null) ?? null,
    phone: (c.phone as string | null) ?? null,
    email: user.email ?? null,
    city: (c.current_location_city as string | null) ?? null,
    state: (c.current_location_state as string | null) ?? null,
    linkedinUrl: (c.linkedin_url as string | null) ?? null,
    yearsExperience:
      (c.years_experience_dental as number | null) ??
      (c.years_experience as number | null) ??
      null,
    desiredRoles: arr(c.desired_roles),
    specialties: arr(c.desired_specialty),
    skills: arr(c.skills),
    languages: arr(c.languages),
    pmsSystems: arr(c.pms_systems),
    work: ((work ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      title: (r.title as string | null) ?? "",
      company: (r.company_name as string | null) ?? "",
      isDso: Boolean(r.is_dso),
      start: (r.start_date as string | null) ?? null,
      end: (r.end_date as string | null) ?? null,
      isCurrent: Boolean(r.is_current),
      description: (r.description as string | null) ?? null,
    })),
    education: ((edu ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      school: (r.school_name as string | null) ?? "",
      degree: (r.degree as string | null) ?? null,
      field: (r.field_of_study as string | null) ?? null,
      startYear: (r.start_year as number | null) ?? null,
      endYear: (r.end_year as number | null) ?? null,
      description: (r.description as string | null) ?? null,
    })),
    licenses: ((lic ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      type: (r.license_type as string | null) ?? "",
      state: (r.state as string | null) ?? null,
      number: (r.license_number as string | null) ?? null,
      displayNumber: Boolean(r.display_number),
      expires: (r.expires_date as string | null) ?? null,
    })),
    certifications: ((cert ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      kind: (r.kind as string | null) ?? "",
      level: (r.level as string | null) ?? null,
      expires: (r.expires_date as string | null) ?? null,
    })),
  };
}
