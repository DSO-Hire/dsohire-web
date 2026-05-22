/**
 * /candidate/profile/preview — "see your profile the way employers do."
 *
 * Renders the candidate's OWN data through the same <CandidateProfileView>
 * employers see, so the two can never diverge. Own-row RLS means everything
 * shows here (full work history, education, credentials). A banner explains
 * the privacy boundary: browse-only employers see the summary-level fields,
 * and the full history is shared with an employer once the candidate applies
 * to one of their roles.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CandidateProfileView,
  type CPVWorkEntry,
  type CPVEducation,
  type CPVLicense,
  type CPVCertification,
} from "@/components/candidate/candidate-profile-view";

export const metadata: Metadata = { title: "Preview · Your Profile" };

export default async function CandidateProfilePreviewPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in");

  const [
    { data: candidateRow },
    { data: workRows },
    { data: eduRows },
    { data: licenseRows },
    { data: certRows },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, headline, summary, current_title, years_experience, years_experience_dental, avatar_url, profile_accent_color, license_states, current_location_city, current_location_state, desired_roles, desired_locations, availability, skills, pms_systems, languages, schedule_preferences, linkedin_url, resume_url"
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
      .select(
        "id, school_name, degree, field_of_study, start_year, end_year, description"
      )
      .order("end_year", { ascending: false, nullsFirst: false }),
    supabase
      .from("candidate_licenses")
      .select(
        "id, license_type, state, display_number, expires_date, verification_status"
      )
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_certifications")
      .select("id, kind, level, expires_date, verification_status")
      .order("expires_date", { ascending: true, nullsFirst: false }),
  ]);

  if (!candidateRow) redirect("/candidate/profile");

  const c = candidateRow as Record<string, unknown>;
  const work = (workRows ?? []) as unknown as CPVWorkEntry[];
  const education = (eduRows ?? []) as unknown as CPVEducation[];
  const licenses = (licenseRows ?? []) as unknown as CPVLicense[];
  const certifications = (certRows ?? []) as unknown as CPVCertification[];

  // Profile-strength nudge — a gentle "add X to stand out" computed from what's
  // here. A CTA, never a shame state (mirrors the completeness meter's tone).
  const summaryText = (c.summary as string | null)?.trim() ?? "";
  const skillCount = ((c.skills as string[] | null) ?? []).length;
  const langCount = ((c.languages as string[] | null) ?? []).length;
  const missing: string[] = [];
  if (!c.avatar_url) missing.push("a profile photo");
  if (summaryText.length < 100) missing.push("an About summary");
  if (work.length === 0) missing.push("your work history");
  if (skillCount < 3) missing.push("a few more skills");
  if (langCount === 0) missing.push("a language");
  const topMissing = missing.slice(0, 3);

  return (
    <CandidateShell active="profile">
      <Link
        href="/candidate/profile"
        className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to editing
      </Link>

      {/* Preview banner — explains what this is + the visibility boundary. */}
      <div className="mb-6 flex items-start gap-3 border border-heritage/40 bg-heritage-tint px-4 py-3">
        <span
          className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-heritage/15"
          aria-hidden
        >
          <Eye className="h-3.5 w-3.5 text-heritage-deep" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-ink">
            This is how employers see you.
          </p>
          <p className="mt-0.5 text-[12.5px] text-slate-body leading-relaxed">
            Browsing employers see your headline, summary, skills, and the states
            you&apos;re licensed in. Your full work history, education, and
            credential details are shared with an employer once you apply to one
            of their roles.
          </p>
        </div>
      </div>

      {/* Profile-strength nudge — only when there's an easy win to point at. */}
      {topMissing.length > 0 && (
        <div className="mb-6 border border-[var(--rule-strong)] bg-cream/60 px-4 py-3">
          <p className="text-[13px] text-ink leading-relaxed">
            <span className="font-bold">Make a stronger first impression.</span>{" "}
            Profiles with more detail get more recruiter interest — consider
            adding {joinWithAnd(topMissing)}.{" "}
            <a
              href="/candidate/profile"
              className="font-bold text-heritage-deep underline underline-offset-2 hover:text-ink"
            >
              Edit your profile →
            </a>
          </p>
        </div>
      )}

      <CandidateProfileView
        viewer="candidate"
        data={{
          full_name: (c.full_name as string | null) ?? null,
          headline: (c.headline as string | null) ?? null,
          summary: (c.summary as string | null) ?? null,
          current_title: (c.current_title as string | null) ?? null,
          years_experience: (c.years_experience as number | null) ?? null,
          years_experience_dental:
            (c.years_experience_dental as number | null) ?? null,
          avatar_url: (c.avatar_url as string | null) ?? null,
          accent_color: (c.profile_accent_color as string | null) ?? null,
          license_states: (c.license_states as string[] | null) ?? null,
          current_location_city:
            (c.current_location_city as string | null) ?? null,
          current_location_state:
            (c.current_location_state as string | null) ?? null,
          desired_roles: (c.desired_roles as string[] | null) ?? null,
          desired_locations: (c.desired_locations as string[] | null) ?? null,
          availability: (c.availability as string | null) ?? null,
          skills: (c.skills as string[] | null) ?? null,
          pms_systems: (c.pms_systems as string[] | null) ?? null,
          languages: (c.languages as string[] | null) ?? null,
          schedule_preferences:
            (c.schedule_preferences as string[] | null) ?? null,
          linkedin_url: (c.linkedin_url as string | null) ?? null,
          resume_url: (c.resume_url as string | null) ?? null,
        }}
        work={work}
        education={education}
        licenses={licenses}
        certifications={certifications}
      />
    </CandidateShell>
  );
}

/** "a, b, and c" — used by the profile-strength nudge. */
function joinWithAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
