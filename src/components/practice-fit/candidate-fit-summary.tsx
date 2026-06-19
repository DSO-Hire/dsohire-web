/**
 * <CandidateFitSummary /> — dashboard widget (Phase 5D v1.2).
 *
 * Inspired by ZipRecruiter's "Great Match" + LinkedIn's profile-
 * completion nudges (per the v1.2 competitor research synthesis).
 * Renders a compact tile showing:
 *   • Best PracticeFit across the candidate's active applications
 *     (the headline they care about: "where am I doing well?")
 *   • A "complete your profile" CTA when any dimension is excluded
 *     across multiple apps — indicates a profile gap that, if filled,
 *     would lift fit on every application at once.
 *
 * Server component. Pure rendering. Caller passes in pre-computed fits
 * + candidate's resolvedness signals. We DO NOT show this when the
 * candidate has zero active apps — PracticeFit only makes sense in
 * the context of jobs they've actually engaged with.
 *
 * The role-as-filter philosophy means a null fit on an app just
 * means "this app got role-filtered out" — those apps are excluded
 * from the summary entirely (the score reflects fit at the DSO/job,
 * not at the application). When there are zero scored fits but the
 * candidate has active apps, we render a soft "your applications
 * are mid-compute or your privacy setting is keeping fit private"
 * empty state.
 */

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { FitWordmark, FitMark } from "@/components/practice-fit/brand/fit-wordmark";
import { bucketStyle } from "@/lib/practice-fit/buckets";
import type { FitDimensionKey, FitResult } from "@/lib/practice-fit/types";

export interface CandidateFitSummaryProps {
  /** Map of application_id → FitResult (or null when role-filtered/consent-off). */
  fitsByAppId: Map<string, FitResult | null>;
  /** Total active apps the candidate has, scored or otherwise. */
  totalActiveApps: number;
  /**
   * Dimensions the candidate has ALREADY filled on their profile. A gap is only
   * worth nudging when the candidate's OWN data is missing — never when a
   * dimension is unscored for a job-side reason (e.g. the posting lists pay as
   * "DOE"). Without this guard the card tells a candidate to "add" data they
   * already provided (the Sarah-Chen "Add experience" bug).
   */
  filledDims?: Set<FitDimensionKey>;
  /**
   * Day 35 — suppress the "Take the assessment" lift nudge once the
   * candidate has actually completed it. Without this, a single skipped
   * optional assessment dimension re-adds the CTA even though the
   * candidate already finished the assessment (Sarah-Chen case).
   */
  pfAssessmentDone?: boolean;
  dsofitAssessmentDone?: boolean;
}

interface CommonGap {
  key: FitDimensionKey;
  label: string;
  count: number;
  cta_label: string | null;
  cta_href: string | null;
}

export function CandidateFitSummary({
  fitsByAppId,
  totalActiveApps,
  filledDims,
  pfAssessmentDone,
  dsofitAssessmentDone,
}: CandidateFitSummaryProps) {
  // No active apps → don't render. PracticeFit only makes sense in
  // the context of an application.
  if (totalActiveApps === 0) return null;

  // Collect scored fits.
  const scoredFits: FitResult[] = [];
  for (const f of fitsByAppId.values()) {
    if (f) scoredFits.push(f);
  }

  // No scored fits but candidate has active apps → empty-state
  // disclosure. Don't disappear the section silently; the candidate
  // should know PracticeFit exists and what's preventing it.
  //
  // Copy correction (focused-pass follow-up): the prior copy named
  // privacy as a possible cause, but `getPracticeFit` returns the
  // candidate's own scores regardless of consent (see comment in
  // get-or-compute.ts). On THIS surface, the only realistic causes
  // are role-as-filter (the candidate's desired_roles excludes every
  // active application's role_category) or compute hasn't populated
  // yet — neither of which is a privacy decision.
  if (scoredFits.length === 0) {
    return (
      <section className="mb-6">
        <SectionHeader />
        <div className="border border-[var(--rule)] bg-cream/40 p-5 text-[13px] text-slate-body leading-relaxed">
          PracticeFit isn&apos;t available on your active applications
          yet. This usually means your role preferences don&apos;t
          cover these postings, or compute hasn&apos;t finished. Update
          your preferred roles in{" "}
          <Link
            href="/candidate/profile#roles"
            className="font-semibold text-heritage-deep hover:underline"
          >
            your profile
          </Link>{" "}
          or check back in a moment.
        </div>
      </section>
    );
  }

  // Best fit headline — the brightest signal the candidate has.
  const best = scoredFits.reduce((acc, f) => (f.score > acc.score ? f : acc));
  const bestStyle = bucketStyle(best.bucket, best.product);

  // Average across scored apps — secondary signal.
  const avgScore = Math.round(
    scoredFits.reduce((acc, f) => acc + f.score, 0) / scoredFits.length
  );

  // Common gaps: which dimensions are excluded on >=2 apps? Those
  // are the highest-leverage profile-completion targets.
  // Keyed by cta_href (the actionable target) — NOT by dimension. Several
  // dimensions can share one CTA (e.g. work_pace / autonomy / mentorship /
  // practice_feel / ce_growth / work_life all point at "Take the assessment");
  // keying by the action collapses them into a single nudge instead of
  // repeating the same row three times (the Sarah-Chen "Take the assessment ×3"
  // bug).
  const gapAccumulator = new Map<string, CommonGap>();
  for (const fit of scoredFits) {
    for (const [keyRaw, dim] of Object.entries(fit.dimensions)) {
      if (dim.scored) continue;
      // Skip "job-side missing" gaps — the candidate can't act on those.
      if (!dim.cta_href || !dim.cta_label) continue;
      const key = keyRaw as FitDimensionKey;
      // Don't nudge "Take the assessment" once the candidate has done it —
      // a skipped optional assessment dim would otherwise re-add the CTA.
      if (
        dim.cta_href.includes("/candidate/dsofit-assessment") &&
        dsofitAssessmentDone
      ) {
        continue;
      }
      if (
        !dim.cta_href.includes("/candidate/dsofit-assessment") &&
        dim.cta_href.includes("/candidate/assessment") &&
        pfAssessmentDone
      ) {
        continue;
      }
      // Skip anything the candidate has already filled — the gap is on the
      // job's side, not theirs. Never tell someone to add data they have.
      if (filledDims?.has(key)) continue;
      const existing = gapAccumulator.get(dim.cta_href);
      if (existing) {
        existing.count += 1;
      } else {
        gapAccumulator.set(dim.cta_href, {
          key,
          label: dim.label,
          count: 1,
          cta_label: dim.cta_label,
          cta_href: dim.cta_href,
        });
      }
    }
  }
  const topGaps = [...gapAccumulator.values()]
    .filter((g) => g.count >= 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return (
    <section className="mb-6">
      <SectionHeader product={best.product} />
      <div className="border border-[var(--rule)] bg-card p-5">
        <div className="flex items-start gap-5 flex-wrap">
          {/* Best fit headline */}
          <div className="flex-1 min-w-[260px]">
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
              Best fit · jobs you&apos;ve applied to
            </p>
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase ${bestStyle.bgClass} ${bestStyle.textClass} ${bestStyle.borderClass}`}
              >
                <FitMark product={best.product} className="h-3 w-3" />
                {bestStyle.label}
              </span>
              <span className="text-[12px] font-mono text-slate-meta">
                {best.score}/100
              </span>
            </div>
            <p className="text-[12px] text-slate-body leading-snug">
              {bestStyle.tagline}
            </p>
          </div>

          {/* Average across active apps */}
          {scoredFits.length > 1 && (
            <div className="min-w-[140px]">
              <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
                Average across active apps
              </p>
              <p className="text-[28px] font-extrabold text-ink leading-none">
                {avgScore}
                <span className="text-[14px] font-mono text-slate-meta ml-1">
                  /100
                </span>
              </p>
              <p className="text-[11px] text-slate-meta mt-1">
                {scoredFits.length} of {totalActiveApps} apps scored
              </p>
            </div>
          )}
        </div>

        {/* Profile-completion nudges — LinkedIn-style "add this to lift
            your match" pattern. Only renders when there are common
            gaps the candidate can act on. */}
        {topGaps.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[var(--rule)]">
            <p className="text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-1">
              Lift your match
            </p>
            <p className="text-[12px] text-slate-meta mb-3">
              Each one sharpens your {best.product === "dsofit" ? "DSOFit" : "PracticeFit"} on
              every role you apply to.
            </p>
            <ul className="space-y-2">
              {topGaps.map((g) => (
                <li key={g.cta_href ?? g.key}>
                  <Link
                    href={g.cta_href ?? "#"}
                    className="group inline-flex items-center gap-2 text-[13px] text-ink hover:text-heritage-deep"
                  >
                    <Plus className="h-3.5 w-3.5 text-heritage-deep" />
                    <span className="font-semibold">{g.cta_label}</span>
                    <ArrowRight className="h-3 w-3 text-slate-meta group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function SectionHeader({ product }: { product?: "practicefit" | "dsofit" }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div className="text-heritage-deep">
        <FitWordmark product={product} surface="light" className="text-[14px]" />
      </div>
      <Link
        href="/candidate/settings/privacy"
        className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
      >
        Manage privacy
      </Link>
    </div>
  );
}
