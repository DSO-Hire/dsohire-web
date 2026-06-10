/**
 * /candidate/resume/build — #87b.2 guided résumé builder.
 *
 * Loads the FULL editable profile values (not just the render shape) so the
 * wizard can save complete payloads through the existing section-actions
 * without nulling fields it doesn't surface (e.g. a work entry's
 * pms_systems_used). Read-only sections (education / licenses / certs) are
 * passed through for the live preview; they're edited in the profile editor.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getResumeTemplate } from "@/lib/resume/resume-templates";
import { ResumeBuilder, type BuilderData } from "./resume-builder";

export const metadata: Metadata = { title: "Build your résumé" };

const arr = (v: unknown): string[] => ((v as string[] | null) ?? []) as string[];

export default async function ResumeBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ return?: string }>;
}) {
  // Only honor internal, relative return paths (no open redirect).
  const sp = await searchParams;
  const returnTo =
    typeof sp.return === "string" &&
    sp.return.startsWith("/") &&
    !sp.return.startsWith("//")
      ? sp.return
      : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/profile");

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
        "id, full_name, first_name, last_name, salutation, pronouns, headline, summary, phone, current_location_city, current_location_state, linkedin_url, years_experience, years_experience_dental, desired_roles, desired_specialty, skills, languages, pms_systems, resume_template"
      )
      .eq("auth_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("candidate_work_history")
      .select(
        "id, title, company_name, is_dso, start_date, end_date, is_current, description, pms_systems_used, procedures_performed, auto_blocklisted"
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

  if (!cRow) redirect("/candidate/profile");
  const c = cRow as Record<string, unknown>;

  const data: BuilderData = {
    identity: {
      first_name: (c.first_name as string | null) ?? "",
      last_name: (c.last_name as string | null) ?? "",
      salutation: (c.salutation as string | null) ?? null,
      pronouns: (c.pronouns as string | null) ?? null,
      headline: (c.headline as string | null) ?? null,
      summary: (c.summary as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      city: (c.current_location_city as string | null) ?? null,
      state: (c.current_location_state as string | null) ?? null,
      years_experience_dental:
        (c.years_experience_dental as number | null) ??
        (c.years_experience as number | null) ??
        null,
      linkedin_url: (c.linkedin_url as string | null) ?? null,
      email: user.email ?? null,
    },
    work: ((work ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      title: (r.title as string | null) ?? "",
      company_name: (r.company_name as string | null) ?? "",
      is_dso: Boolean(r.is_dso),
      start_date: (r.start_date as string | null) ?? null,
      end_date: (r.end_date as string | null) ?? null,
      is_current: Boolean(r.is_current),
      description: (r.description as string | null) ?? null,
      pms_systems_used: arr(r.pms_systems_used),
      procedures_performed: arr(r.procedures_performed),
      auto_blocklisted: Boolean(r.auto_blocklisted),
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
    skills: arr(c.skills),
    languages: arr(c.languages),
    pms_systems: arr(c.pms_systems),
    desiredRoles: arr(c.desired_roles),
    specialties: arr(c.desired_specialty),
    email: user.email ?? null,
  };

  const initialTemplate = getResumeTemplate(
    c.resume_template as string | null
  ).id;

  return (
    <div className="min-h-screen bg-ivory">
      <ResumeBuilder
        data={data}
        returnTo={returnTo}
        initialTemplate={initialTemplate}
      />
    </div>
  );
}
