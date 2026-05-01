/**
 * /candidate/profile — edit candidate profile.
 */

import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CandidateProfileForm, type ProfileInitial } from "./profile-form";
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
      "full_name, phone, headline, summary, current_title, years_experience, desired_roles, desired_locations, availability, linkedin_url, resume_url, is_searchable"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidate) return null;

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

      <div className="border border-[var(--rule)] bg-white p-7 sm:p-10 max-w-[820px]">
        <CandidateProfileForm initial={initial} />
      </div>
    </CandidateShell>
  );
}
