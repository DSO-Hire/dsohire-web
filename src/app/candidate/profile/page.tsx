/**
 * /candidate/profile — section-card profile editor (Phase 4.2.b).
 *
 * Replaces the old single-form scroll with a LinkedIn-style stack of
 * section cards. Each card has a pencil-edit affordance that opens a
 * modal sheet with structured inputs (combobox/chip wherever a typo
 * could silently exclude the candidate from search). Photo upload sits
 * above the sections, resume-import CTA above the photo.
 *
 * Server component fetches everything in one round trip; the client
 * orchestrator (`profile-sections.tsx`) handles modal state. Each save
 * server action calls `revalidatePath("/candidate/profile")` so the
 * next render reflects the new state immediately.
 */

import type { Metadata } from "next";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CandidateAvatarUpload } from "./avatar-upload";
import {
  ProfileSections,
  type ProfileData,
} from "./profile-sections";

export const metadata: Metadata = { title: "Your Profile" };

export default async function CandidateProfilePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [
    { data: candidateRow },
    { data: workHistory },
    { data: education },
    { data: licenses },
    { data: certifications },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select(
        "id, full_name, first_name, last_name, salutation, phone, headline, summary, current_title, years_experience, years_experience_dental, pronouns, current_location_city, current_location_state, desired_roles, desired_locations, availability, linkedin_url, resume_url, is_searchable, avatar_url, desired_specialty, pms_systems, skills, languages, temp_or_perm, schedule_preferences, min_salary, salary_unit, cv_visibility, last_parsed_at"
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
      .select("id, license_type, license_number, state, issued_date, expires_date, display_number, document_path, verification_status")
      .order("expires_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("candidate_certifications")
      .select("id, kind, level, issued_date, expires_date, document_path, verification_status")
      .order("expires_date", { ascending: true, nullsFirst: false }),
  ]);

  if (!candidateRow) return null;

  // Cast helper — the database types regen would type this for free,
  // but `npm run types` isn't wired yet (memory: feedback_verify_npm_versions.md
  // companion).
  const c = candidateRow as Record<string, unknown>;

  // v1.3 — collapse the resume-import CTA to a thin "Re-import" link
  // once the candidate has used the parser before. last_parsed_at is
  // the source-of-truth signal: it's set by the parse-and-confirm
  // action when the candidate goes through /candidate/profile/import.
  const hasImportedResume = c.last_parsed_at !== null && c.last_parsed_at !== undefined;

  const data: ProfileData = {
    identity: {
      first_name: (c.first_name as string | null) ?? "",
      last_name: (c.last_name as string | null) ?? "",
      salutation: (c.salutation as string | null) ?? null,
      pronouns: (c.pronouns as string | null) ?? null,
      headline: (c.headline as string | null) ?? null,
      summary: (c.summary as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      current_location_city: (c.current_location_city as string | null) ?? null,
      current_location_state:
        (c.current_location_state as string | null) ?? null,
      // Prefer dental-specific column; fall back to the generic legacy column
      // until 4.2.b form refactors writes (this page IS that refactor — but
      // existing rows may still only have years_experience populated).
      years_experience_dental:
        (c.years_experience_dental as number | null) ??
        (c.years_experience as number | null) ??
        null,
      linkedin_url: (c.linkedin_url as string | null) ?? null,
    },
    rolePreferences: {
      desired_roles: ((c.desired_roles as string[] | null) ?? []),
      desired_specialty: ((c.desired_specialty as string[] | null) ?? []),
      temp_or_perm: (c.temp_or_perm as ProfileData["rolePreferences"]["temp_or_perm"]) ?? null,
    },
    skillsLanguages: {
      skills: ((c.skills as string[] | null) ?? []),
      languages: ((c.languages as string[] | null) ?? []),
      pms_systems: ((c.pms_systems as string[] | null) ?? []),
    },
    jobPreferences: {
      desired_locations: ((c.desired_locations as string[] | null) ?? []),
      min_salary: (c.min_salary as number | null) ?? null,
      salary_unit:
        (c.salary_unit as ProfileData["jobPreferences"]["salary_unit"]) ?? null,
      schedule_preferences:
        (c.schedule_preferences as ProfileData["jobPreferences"]["schedule_preferences"]) ??
        {},
      cv_visibility:
        (c.cv_visibility as ProfileData["jobPreferences"]["cv_visibility"]) ??
        "recruiters_only",
      availability: (c.availability as string | null) ?? null,
    },
    workHistory: ((workHistory ?? []) as ProfileData["workHistory"]),
    education: ((education ?? []) as ProfileData["education"]),
    licenses: ((licenses ?? []) as ProfileData["licenses"]),
    certifications: ((certifications ?? []) as ProfileData["certifications"]),
  };

  const avatarUrl = (c.avatar_url as string | null) ?? null;

  return (
    <CandidateShell active="profile">
      <header className="mb-10 max-w-[760px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Your Profile
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-4">
          The version of you employers see.
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed">
          Edit any section below. Saved changes show up immediately — no
          publish button to remember.
        </p>
      </header>

      {/* Resume import CTA — first-time hero panel for candidates who
          haven't imported yet; thin "Re-import" link once they have.
          Signal: `last_parsed_at` is set by the parse-and-confirm action. */}
      {hasImportedResume ? (
        <div className="mb-6 flex max-w-[820px] items-center justify-between gap-4 border border-[var(--rule)] bg-white px-4 py-2.5">
          <p className="text-[12px] text-slate-body leading-snug">
            <span className="font-semibold text-ink">Resume on file.</span>{" "}
            Edit any section below to update — or re-import if you have a
            newer resume.
          </p>
          <a
            href="/candidate/profile/import"
            className="shrink-0 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:underline"
          >
            Re-import →
          </a>
        </div>
      ) : (
        // 2026-05-18 — bold solid-heritage panel after Erica's testing
        // pass: the previous heritage-deep/30 border on ivory blended
        // into the page background and got scrolled past. High-contrast
        // solid fill ensures candidates SEE the CTA on first load.
        <a
          href="/candidate/profile/import"
          className="mb-6 flex max-w-[820px] items-start gap-4 rounded-lg bg-heritage-deep p-5 text-ivory shadow-sm transition hover:bg-[#2A5346] sm:items-center"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ivory/20">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ivory"
              aria-hidden="true"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
              <path d="m9 18 3-3 3 3" />
              <path d="M12 12v6" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-display text-base font-semibold text-ivory">
              Import from your resume
            </p>
            <p className="mt-0.5 text-sm text-ivory/85">
              Upload a PDF or DOCX — we&apos;ll fill in every section below in
              seconds. You review before anything saves.
            </p>
          </div>
          <span className="hidden text-sm font-semibold text-ivory sm:block">
            Start →
          </span>
        </a>
      )}

      {/* Profile photo (anchored — completeness meter scrolls here on the
          "Add a photo" quick-win CTA) */}
      <div
        id="profile-photo"
        className="mb-6 max-w-[820px] scroll-mt-24 border border-[var(--rule)] bg-white p-7 transition-shadow sm:p-10"
      >
        <h2 className="mb-1 font-display text-lg font-bold text-ink">
          Profile photo
        </h2>
        <p className="mb-5 text-sm text-slate-body">
          Optional, but DSO recruiters tell us photos make a real difference.
        </p>
        <CandidateAvatarUpload initialUrl={avatarUrl} />
      </div>

      {/* Section cards (Completeness meter renders inside, before the
          first section card, so it shares modal-open state with the
          section editors.) */}
      <ProfileSections data={data} photoUrl={avatarUrl} />
    </CandidateShell>
  );
}
