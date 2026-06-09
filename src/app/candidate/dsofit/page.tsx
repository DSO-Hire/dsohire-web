/**
 * /candidate/dsofit — the DSOFit surface, the corporate-side parallel of
 * /candidate/practice-fit (#55). Owns DSO/corporate matching for candidates on
 * the DSOFit track: their corporate matches, the DSOFit assessment (where the
 * corporate preferences live — function, level, scale, domain, work mode), and
 * a pointer to the shared matching-consent control. Heritage-branded.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTopFitJobsForCandidate } from "@/lib/practice-fit/roles-that-fit";
import { RolesThatFitCard } from "@/components/practice-fit/roles-that-fit-card";
import { DsoFitWordmark } from "@/components/practice-fit/brand/dsofit-wordmark";

export const metadata: Metadata = { title: "DSOFit" };

export default async function CandidateDsoFitPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in?next=/candidate/dsofit");

  const { data: candidateRow } = await supabase
    .from("candidates")
    .select(
      "id, practice_fit_consent, dsofit_assessment_completed_at, dsofit_function_targets"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!candidateRow) redirect("/candidate/dashboard");

  const c = candidateRow as Record<string, unknown>;
  const candidateId = c.id as string;
  const consent =
    (c.practice_fit_consent as "off" | "results_only" | "full" | null) ?? "off";
  const consentOn = consent !== "off";
  const assessmentDone = c.dsofit_assessment_completed_at != null;

  const matches = consentOn
    ? await getTopFitJobsForCandidate(candidateId, 12)
    : [];

  return (
    <CandidateShell active="practice-fit">
      <header className="mb-8">
        <div className="mb-3">
          <DsoFitWordmark tm className="text-3xl sm:text-4xl" />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-[-0.4px] leading-tight text-ink">
          DSO &amp; corporate roles, ranked for you.
        </h1>
        <p className="mt-3 text-base text-slate-body max-w-[640px]">
          DSOFit scores how well every open DSO and corporate role fits your
          function, level, multi-site experience, domain, and how you want to
          work — the things a résumé can&apos;t show. Take the assessment and
          your matches sharpen.
        </p>
      </header>

      {/* DSOFit assessment — the corporate preferences live here. */}
      {!assessmentDone ? (
        <a
          href="/candidate/dsofit-assessment"
          className="group mb-8 block border-l-4 border-heritage bg-cream/50 p-6 sm:p-7 transition-colors hover:bg-cream"
        >
          <div className="mb-1.5 text-[10px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
            Take the DSOFit Assessment · about 5 min
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold tracking-[-0.4px] text-ink">
            Tell us your function, level, and scale — your matches get a lot sharper.
          </h2>
          <p className="mt-2 text-[14px] text-slate-body max-w-[560px]">
            Which DSO functions you&apos;re targeting, the level you operate at,
            the largest organization you&apos;ve run, your domain and work-mode —
            mostly taps, and you can stop anytime.
          </p>
          <span className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep group-hover:gap-2.5 transition-all">
            Start now →
          </span>
        </a>
      ) : (
        <div className="mb-6 flex items-center justify-between gap-3 border border-[var(--rule)] bg-white px-4 py-3">
          <span className="text-[13px] text-slate-body">
            Your DSOFit Assessment is complete — it&apos;s powering your matches.
          </span>
          <a
            href="/candidate/dsofit-assessment"
            className="flex-shrink-0 text-[12px] font-bold uppercase tracking-[1.5px] text-heritage-deep hover:text-heritage underline underline-offset-2"
          >
            Update
          </a>
        </div>
      )}

      {!consentOn ? (
        <section className="mb-8 p-7 sm:p-8 bg-ink text-ivory border-l-4 border-heritage">
          <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-heritage-light mb-2">
            Matching is off
          </div>
          <h2 className="text-2xl font-extrabold tracking-[-0.6px] leading-tight mb-3">
            Turn on matching to see DSO roles matched to you.
          </h2>
          <p className="text-[14px] text-ivory/70 leading-relaxed max-w-[560px] mb-3">
            It ranks open DSO/corporate roles by how well they fit you and lets
            DSOs find you by fit. Flip it on in{" "}
            <a
              href="/candidate/settings/privacy#practice-fit"
              className="font-semibold text-heritage-light underline underline-offset-2"
            >
              Privacy &amp; visibility
            </a>
            ; you can change it anytime.
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
              DSO roles that fit you
            </span>
          </div>
          <div className="border border-[var(--rule)] bg-cream/40 p-6 text-[14px] text-slate-body leading-relaxed">
            No open DSO/corporate roles fit you just yet. Take or update your
            assessment above — or we&apos;ll surface roles as they post.
          </div>
        </section>
      )}

      <p className="mt-2 text-[12px] text-slate-meta">
        Practice-level candidate too? Explore{" "}
        <a
          href="/candidate/practice-fit"
          className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
        >
          PracticeFit
        </a>{" "}
        ·{" "}
        <a
          href="/candidate/track-chooser?change=1"
          className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
        >
          switch your primary track
        </a>
        . Manage matching + visibility in{" "}
        <a
          href="/candidate/settings/privacy"
          className="font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
        >
          Privacy &amp; visibility
        </a>
        .
      </p>
    </CandidateShell>
  );
}
