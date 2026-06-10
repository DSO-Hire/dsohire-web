/**
 * #87a — Résumé data layer.
 *
 * The résumé is a RENDER of the canonical profile, never a 4th data silo
 * (see TASKS.md #87). This module pulls the candidate's profile + the four
 * structured child tables (work history / education / licenses / certs) into
 * one normalized `ResumeData` shape the template components consume. No new
 * storage, no parsing — the data already lives on the profile.
 *
 * Label maps reuse the canonical option lists so the résumé prints
 * "Dental Assistant" / "CPR/BLS", not the raw slugs.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  ROLE_CATEGORIES,
  SPECIALTIES,
  LICENSE_TYPES,
  CERTIFICATION_KINDS,
} from "@/lib/candidate/canonical-lists";

type CanonOpt = { value: string; label: string };

function prettify(v: string): string {
  return v.replace(/[_-]+/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function makeLookup(
  list: ReadonlyArray<CanonOpt>
): (v: string | null | undefined) => string {
  const m = new Map(list.map((o) => [o.value, o.label]));
  return (v) => (v ? m.get(v) ?? prettify(v) : "");
}

export const roleLabel = makeLookup(ROLE_CATEGORIES);
export const specialtyLabel = makeLookup(SPECIALTIES);
export const licenseTypeLabel = makeLookup(LICENSE_TYPES);
export const certKindLabel = makeLookup(CERTIFICATION_KINDS);

export type ResumeWork = {
  id: string;
  title: string;
  company: string;
  isDso: boolean;
  start: string | null;
  end: string | null;
  isCurrent: boolean;
  description: string | null;
};

export type ResumeEducation = {
  id: string;
  school: string;
  degree: string | null;
  field: string | null;
  startYear: number | null;
  endYear: number | null;
  description: string | null;
};

export type ResumeLicense = {
  id: string;
  type: string;
  state: string | null;
  number: string | null;
  displayNumber: boolean;
  expires: string | null;
};

export type ResumeCert = {
  id: string;
  kind: string;
  level: string | null;
  expires: string | null;
};

export type ResumeData = {
  name: string;
  headline: string | null;
  summary: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  linkedinUrl: string | null;
  yearsExperience: number | null;
  desiredRoles: string[];
  specialties: string[];
  skills: string[];
  languages: string[];
  pmsSystems: string[];
  work: ResumeWork[];
  education: ResumeEducation[];
  licenses: ResumeLicense[];
  certifications: ResumeCert[];
};

/** Does this résumé have any real body content beyond the header? */
export function resumeHasContent(d: ResumeData): boolean {
  return (
    d.work.length > 0 ||
    d.education.length > 0 ||
    d.licenses.length > 0 ||
    d.certifications.length > 0 ||
    d.skills.length > 0 ||
    Boolean(d.summary && d.summary.trim())
  );
}

const arr = (v: unknown): string[] => ((v as string[] | null) ?? []) as string[];

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
