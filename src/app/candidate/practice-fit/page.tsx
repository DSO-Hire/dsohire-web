/**
 * /candidate/practice-fit — the dedicated PracticeFit surface (IA reorg,
 * 2026-06-04).
 *
 * PracticeFit is the spine of the candidate experience, not a dashboard widget.
 * This page OWNS matching end-to-end:
 *   1. Your matches — open roles ranked by PracticeFit (role-gated feed).
 *   2. What you're looking for — the matching-preferences editor (moved here
 *      from Settings → Job preferences, which now redirects here).
 *   3. PracticeFit on/off consent — surfaced here AND in Privacy (Cam: both is
 *      fine; the privacy model stays canonical in Privacy, this is a convenience
 *      mirror).
 *
 * Profile = who you are (identity, experience, credentials). PracticeFit =
 * what fits you. Every "what I'm looking for" preference lives here so a
 * candidate never has to hunt across three settings pages.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTopFitJobsForCandidate } from "@/lib/practice-fit/roles-that-fit";
import { RolesThatFitCard } from "@/components/practice-fit/roles-that-fit-card";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { JobPreferencesForm } from "@/app/candidate/settings/job-preferences/job-preferences-form";
import { PracticeFitSection } from "@/app/candidate/settings/privacy/privacy-form";
import type { SchedulePreferences } from "@/lib/candidate/canonical-lists";

export const metadata: Metadata = { title: "PracticeFit" };

export default async function CandidatePracticeFitPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/practice-fit");

  const { data: candidateRow } = await supabase
    .from("candidates")
    .select(
      "id, practice_fit_consent, desired_roles, desired_specialty, license_states, dso_size_preference, desired_locations, schedule_preferences, temp_or_perm, availability, min_salary, salary_unit"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidateRow) redirect("/candidate/dashboard");

  const c = candidateRow as Record<string, unknown>;
  const candidateId = c.id as string;
  const consent =
    (c.practice_fit_consent as "off" | "results_only" | "full" | null) ?? "off";
  const consentOn = consent !== "off";

  const matches = consentOn
    ? await getTopFitJobsForCandidate(candidateId, 12)
    : [];

  const initial = {
    desired_roles: ((c.desired_roles as string[] | null) ?? []) as string[],
    desired_specialty: ((c.desired_specialty as string[] | null) ?? []) as string[],
    license_states: ((c.license_states as string[] | null) ?? []) as string[],
    dso_size_preference:
      (c.dso_size_preference as "small" | "mid" | "large" | "any" | null) ?? null,
    desired_locations: ((c.desired_locations as string[] | null) ?? []) as string[],
    schedule_preferences:
      (c.schedule_preferences as SchedulePreferences | null) ?? {},
    temp_or_perm: (c.temp_or_perm as "temp" | "perm" | "either" | null) ?? null,
    availability: (c.availability as string | null) ?? null,
    min_salary: (c.min_salary as number | null) ?? null,
    salary_unit:
      (c.salary_unit as "hourly" | "yearly" | "per_visit" | "per_day" | null) ??
      null,
  };

  return (
    <CandidateShell active="practice-fit">
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-extrabold tracking-[3px] uppercase text-heritage-deep">
            Your matches
          </span>
          <span className="text-heritage-deep">·</span>
          <PracticeFitWordmark surface="inherit" className="text-[15px]" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1px] leading-[1.1] text-ink">
          Roles ranked for you.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          PracticeFit scores how well every open role fits what you&apos;re
          looking for — your roles, locations, pay, schedule, and dental
          experience. Tune what you want below and your matches update.
        </p>
      </header>

      {!consentOn ? (
        <section className="mb-8 p-7 sm:p-8 bg-ink text-ivory border-l-4 border-heritage">
          <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-heritage-light mb-2">
            PracticeFit is off
          </div>
          <h2 className="text-2xl font-extrabold tracking-[-0.6px] leading-tight mb-3">
            Turn on PracticeFit to see roles matched to you.
          </h2>
          <p className="text-[14px] text-ivory/70 leading-relaxed max-w-[560px] mb-2">
            It&apos;s our dental-specific matching engine — it ranks open roles
            by how well they fit your profile and lets DSOs find you by fit.
            Flip it on below; you can change it anytime.
          </p>
        </section>
      ) : matches.length > 0 ? (
        <div className="mb-8">
          <RolesThatFitCard roles={matches} />
        </div>
      ) : (
        <section className="mb-8">
          <div className="flex items-center gap-2 text-heritage-deep mb-3">
            <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
              Roles that fit you
            </span>
          </div>
          <div className="border border-[var(--rule)] bg-cream/40 p-6 text-[14px] text-slate-body leading-relaxed">
            No open roles fit you just yet. Widen your preferences below — or
            we&apos;ll email you the moment a fitting role posts.
          </div>
        </section>
      )}

      {/* What you're looking for — the matching-preferences editor. */}
      <section id="preferences" className="mb-10 scroll-mt-24">
        <div className="mb-4">
          <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink">
            What you&apos;re looking for
          </h2>
          <p className="mt-1 text-[14px] text-slate-body max-w-[640px]">
            These drive your PracticeFit matches and let DSOs find you by fit.
            Each section saves on its own. What employers see on your profile is
            set on{" "}
            <a
              href="/candidate/profile"
              className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              your profile
            </a>
            .
          </p>
        </div>
        <JobPreferencesForm initial={initial} />
      </section>

      {/* PracticeFit on/off — mirrored from Privacy for convenience. */}
      <section className="mb-6">
        <PracticeFitSection initial={consent} />
        <p className="mt-2 text-[12px] text-slate-meta">
          Manage all privacy and visibility controls in{" "}
          <a
            href="/candidate/settings/privacy"
            className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            Privacy &amp; visibility
          </a>
          .
        </p>
      </section>
    </CandidateShell>
  );
}
