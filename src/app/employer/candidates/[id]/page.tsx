/**
 * /employer/candidates/[id] — read-only candidate profile (Phase 5D; 2026-05-22
 * polished to a shared LinkedIn-style view).
 *
 * Reachable from the talent-pool result cards + saved-entry cards (whole card
 * is clickable). RLS gates the read: DSO members can see searchable candidates
 * OR candidates who've applied to one of their jobs.
 *
 * Email is intentionally hidden — outbound contact goes through the in-app
 * outreach flow. Resume download is gated to candidates who've opted into
 * searchability.
 *
 * Presentation lives in the shared <CandidateProfileView> so this page and the
 * candidate's own /candidate/profile/preview can never diverge. NOTE: the
 * structured Experience / Education / Licenses sections come from per-table
 * RLS that only grants DSO read for candidates who APPLIED to one of their
 * jobs — for browse-only searchable candidates those tables read empty and the
 * sections gracefully omit (deliberate privacy boundary; widening it to all
 * searchable candidates would be a separate, deliberate decision).
 */

import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { TalentPoolSaveButton } from "./talent-pool-save-button";
import { OutreachLauncher } from "./outreach-modal";
import {
  CandidateProfileView,
  type CPVWorkEntry,
  type CPVEducation,
  type CPVLicense,
  type CPVCertification,
} from "@/components/candidate/candidate-profile-view";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase
    .from("candidates")
    .select("full_name")
    .eq("id", id)
    .maybeSingle();
  return {
    title: c?.full_name ? `${c.full_name as string} · Candidate` : "Candidate",
  };
}

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/onboarding");

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, summary, current_title, years_experience, years_experience_dental, avatar_url, license_states, current_location_city, current_location_state, desired_roles, desired_locations, availability, skills, pms_systems, languages, schedule_preferences, linkedin_url, resume_url, is_searchable"
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!candidate) notFound();

  // Is this candidate in our DSO's pool already?
  const { data: poolEntry } = await supabase
    .from("dso_talent_pool_entries")
    .select("id")
    .eq("dso_id", dsoUser.dso_id as string)
    .eq("candidate_id", id)
    .maybeSingle();

  // Saved outreach templates for the picker in the modal.
  const { data: templateRows } = await supabase
    .from("dso_outreach_templates")
    .select("id, name, subject, body")
    .eq("dso_id", dsoUser.dso_id as string)
    .order("last_used_at", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });
  const outreachTemplates = (templateRows ?? []) as Array<{
    id: string;
    name: string;
    subject: string;
    body: string;
  }>;

  // Past outreach from this DSO to this candidate.
  const { data: outreachRows } = await supabase
    .from("dso_outreach_messages")
    .select("id, subject, body, sent_at, sent_by, dso_users(full_name)")
    .eq("dso_id", dsoUser.dso_id as string)
    .eq("candidate_id", id)
    .order("sent_at", { ascending: false })
    .limit(10);
  const outreachHistory = (
    (outreachRows ?? []) as unknown as Array<{
      id: string;
      subject: string;
      body: string;
      sent_at: string;
      sent_by: string | null;
      dso_users: Array<{ full_name: string | null }> | null;
    }>
  ).map((r) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    sent_at: r.sent_at,
    sender_name: r.dso_users?.[0]?.full_name ?? null,
  }));

  // Structured profile detail — Experience / Education / Licenses / Certs.
  // RLS only grants these for candidates who applied to one of our jobs; for
  // browse-only searchable candidates they read empty (sections omit). Errors
  // are swallowed to [] so a blocked read never breaks the page.
  const [
    { data: workRows },
    { data: eduRows },
    { data: licenseRows },
    { data: certRows },
  ] = await Promise.all([
    supabase
      .from("candidate_work_history")
      .select(
        "id, title, company_name, is_dso, start_date, end_date, is_current, description"
      )
      .eq("candidate_id", id)
      .order("is_current", { ascending: false })
      .order("start_date", { ascending: false, nullsFirst: false }),
    supabase
      .from("candidate_education")
      .select(
        "id, school_name, degree, field_of_study, start_year, end_year, description"
      )
      .eq("candidate_id", id)
      .order("end_year", { ascending: false, nullsFirst: false }),
    supabase
      .from("candidate_licenses")
      .select(
        "id, license_type, state, display_number, expires_date, verification_status"
      )
      .eq("candidate_id", id)
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_certifications")
      .select("id, kind, level, expires_date, verification_status")
      .eq("candidate_id", id)
      .order("expires_date", { ascending: true, nullsFirst: false }),
  ]);

  const work = (workRows ?? []) as unknown as CPVWorkEntry[];
  const education = (eduRows ?? []) as unknown as CPVEducation[];
  const licenses = (licenseRows ?? []) as unknown as CPVLicense[];
  const certifications = (certRows ?? []) as unknown as CPVCertification[];

  const c = candidate as {
    id: string;
    full_name: string | null;
    headline: string | null;
    summary: string | null;
    current_title: string | null;
    years_experience: number | null;
    years_experience_dental: number | null;
    avatar_url: string | null;
    license_states: string[] | null;
    current_location_city: string | null;
    current_location_state: string | null;
    desired_roles: string[] | null;
    desired_locations: string[] | null;
    availability: string | null;
    skills: string[] | null;
    pms_systems: string[] | null;
    languages: string[] | null;
    schedule_preferences: string[] | null;
    linkedin_url: string | null;
    resume_url: string | null;
    is_searchable: boolean;
  };

  return (
    <EmployerShell active="talent-pool">
      <Link
        href="/employer/talent-pool"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Talent Pool
      </Link>

      <CandidateProfileView
        viewer="employer"
        data={{
          full_name: c.full_name,
          headline: c.headline,
          summary: c.summary,
          current_title: c.current_title,
          years_experience: c.years_experience,
          years_experience_dental: c.years_experience_dental,
          avatar_url: c.avatar_url,
          license_states: c.license_states,
          current_location_city: c.current_location_city,
          current_location_state: c.current_location_state,
          desired_roles: c.desired_roles,
          desired_locations: c.desired_locations,
          availability: c.availability,
          skills: c.skills,
          pms_systems: c.pms_systems,
          languages: c.languages,
          schedule_preferences: c.schedule_preferences,
          linkedin_url: c.linkedin_url,
          resume_url: c.resume_url,
        }}
        work={work}
        education={education}
        licenses={licenses}
        certifications={certifications}
        headerActions={
          <>
            <OutreachLauncher
              candidateId={c.id}
              candidateName={c.full_name}
              templates={outreachTemplates}
            />
            <TalentPoolSaveButton
              candidateId={c.id}
              initialEntryId={(poolEntry?.id as string | undefined) ?? null}
            />
          </>
        }
        footerSections={
          outreachHistory.length > 0 ? (
            <section>
              <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
                Outreach history ({outreachHistory.length})
              </div>
              <ul className="space-y-3">
                {outreachHistory.map((m) => (
                  <li
                    key={m.id}
                    className="border border-[var(--rule)] bg-white p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-[13px] font-bold text-ink">
                        {m.subject}
                      </span>
                      <span className="text-[11px] text-slate-meta whitespace-nowrap">
                        {new Date(m.sent_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    {m.sender_name && (
                      <div className="text-[11px] text-slate-meta uppercase tracking-wide mb-2">
                        From {m.sender_name}
                      </div>
                    )}
                    <p className="text-[13px] text-slate-body leading-relaxed whitespace-pre-wrap">
                      {m.body.length > 280
                        ? `${m.body.slice(0, 280).trim()}…`
                        : m.body}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        }
      />
    </EmployerShell>
  );
}
