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
import { ScrollToHash } from "@/components/scroll-to-hash";
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
      "id, practice_fit_consent, desired_roles, desired_specialty, license_states, dso_size_preference, desired_locations, schedule_preferences, temp_or_perm, availability, min_salary, salary_unit, assessment_completed_at"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidateRow) redirect("/candidate/dashboard");

  const c = candidateRow as Record<string, unknown>;
  const candidateId = c.id as string;
  const consent =
    (c.practice_fit_consent as "off" | "results_only" | "full" | null) ?? "off";
  const consentOn = consent !== "off";
  const assessmentDone = c.assessment_completed_at != null;

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
      {/* #103 — deep-link CTA (#preferences) scrolls to that section. */}
      <ScrollToHash />
      <header className="mb-8">
        <div className="mb-3">
          <PracticeFitWordmark
            surface="light"
            tm
            className="text-3xl sm:text-4xl"
          />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] leading-tight text-ink">
          Roles ranked for you.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          PracticeFit scores how well every open role fits what you&apos;re
          looking for — your roles, locations, pay, schedule, and dental
          experience. Tune what you want below and your matches update.
        </p>
      </header>

      {/* Assessment CTA — the single biggest thing a candidate can do to
          sharpen matches. Prominent when not yet taken; a quiet update link
          once complete. */}
      {!assessmentDone ? (
        <a
          href="/candidate/assessment"
          className="group mb-8 block border-l-4 border-heritage bg-cream/50 p-6 sm:p-7 transition-colors hover:bg-cream"
        >
          <div className="mb-1.5 text-[10px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
            Take the PracticeFit Assessment · about 5 min
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold tracking-[-0.4px] text-ink">
            Answer a few questions and your matches get a lot sharper.
          </h2>
          <p className="mt-2 text-[14px] text-slate-body max-w-[560px]">
            Pace, autonomy, the procedures you love, the kind of team you thrive
            on — the things no résumé captures. Mostly taps, and you can stop
            anytime.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep group-hover:gap-2.5 transition-all">
            Start now →
          </span>
        </a>
      ) : (
        <div className="mb-6 flex items-center justify-between gap-3 border border-[var(--rule)] bg-white px-4 py-3">
          <span className="text-[13px] text-slate-body">
            Your PracticeFit Assessment is complete — it&apos;s powering your
            matches.
          </span>
          <a
            href="/candidate/assessment"
            className="flex-shrink-0 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep hover:text-heritage underline underline-offset-2"
          >
            Update
          </a>
        </div>
      )}

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
          . DSO / corporate candidate?{" "}
          <a
            href="/candidate/dsofit"
            className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            Explore DSOFit
          </a>{" "}
          or{" "}
          <a
            href="/candidate/track-chooser?change=1"
            className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            switch your primary track
          </a>
          .
        </p>
      </section>
    </CandidateShell>
  );
}
