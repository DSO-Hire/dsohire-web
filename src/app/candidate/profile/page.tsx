/**
 * /candidate/profile — edit candidate profile.
 */

import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CandidateProfileForm, type ProfileInitial } from "./profile-form";
import { CandidateAvatarUpload } from "./avatar-upload";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your Profile" };

export default async function CandidateProfilePage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // shell handles redirect

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "full_name, phone, headline, summary, current_title, years_experience, desired_roles, desired_locations, availability, linkedin_url, resume_url, is_searchable, avatar_url"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return null;

  const avatarUrl = (candidate.avatar_url as string | null) ?? null;

  const resumePath = (candidate.resume_url as string | null) ?? null;
  const initial: ProfileInitial = {
    full_name: (candidate.full_name as string | null) ?? "",
    phone: (candidate.phone as string | null) ?? "",
    headline: (candidate.headline as string | null) ?? "",
    summary: (candidate.summary as string | null) ?? "",
    current_title: (candidate.current_title as string | null) ?? "",
    years_experience:
      candidate.years_experience !== null && candidate.years_experience !== undefined
        ? String(candidate.years_experience)
        : "",
    desired_roles: ((candidate.desired_roles as string[] | null) ?? []).join(", "),
    desired_locations: ((candidate.desired_locations as string[] | null) ?? []).join(", "),
    availability: (candidate.availability as string | null) ?? "",
    linkedin_url: (candidate.linkedin_url as string | null) ?? "",
    is_searchable: Boolean(candidate.is_searchable),
    has_resume: Boolean(resumePath),
    resume_filename: resumePath
      ? resumePath.split("/").pop()?.replace(/^\d+-/, "") ?? null
      : null,
  };

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
          Fill out once — every future application autofills from this. Your
          resume, headline, and target roles all carry job to job.
        </p>
      </header>

      {/* Resume import CTA (Phase 4.1.c) — drop-zone-above-the-fold for
          new candidates. Hides once the candidate has filled in core
          fields manually so the surface doesn't nag returning users. */}
      <a
        href="/candidate/profile/import"
        className="mb-8 flex max-w-[820px] items-start gap-4 rounded-lg border border-heritage-deep/30 bg-[#F7F4ED] p-5 transition hover:border-heritage-deep hover:bg-[#F7F4ED]/70 sm:items-center"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-heritage-deep/10">
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
            className="text-heritage-deep"
            aria-hidden="true"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="m9 18 3-3 3 3" />
            <path d="M12 12v6" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="font-display text-base font-semibold text-ink">
            Import from your resume
          </p>
          <p className="mt-0.5 text-sm text-slate-body">
            Upload a PDF or DOCX — we&apos;ll fill out your profile in
            seconds. You review every field before saving.
          </p>
        </div>
        <span className="hidden text-sm font-medium text-heritage-deep sm:block">
          Start →
        </span>
      </a>

      {/* Profile photo (Phase 4.1.a) — independent of the form below;
          uploads + persists immediately so a saved photo doesn't depend
          on submitting the rest of the form. */}
      <div className="mb-6 max-w-[820px] border border-[var(--rule)] bg-white p-7 sm:p-10">
        <h2 className="mb-1 font-display text-lg font-bold text-ink">
          Profile photo
        </h2>
        <p className="mb-5 text-sm text-slate-body">
          Optional, but DSO recruiters tell us photos make a real
          difference. We don&apos;t require one.
        </p>
        <CandidateAvatarUpload initialUrl={avatarUrl} />
      </div>

      <div className="border border-[var(--rule)] bg-white p-7 sm:p-10 max-w-[820px]">
        <CandidateProfileForm initial={initial} />
      </div>
    </CandidateShell>
  );
}
