"use client";

/**
 * <WhyThisMatch /> — PracticeFit expander (Phase 5D v1.1).
 *
 * Drops below the PracticeFitChip on application detail pages and
 * candidate job detail pages. Click expands to show:
 *   1. (v1)   2-3 sentence audience-framed AI narrative, lazy-fetched
 *             on first open. Skipped for bucket='low' or when ids are
 *             missing. Cached on the practice_fit_scores row.
 *   2. (v1.1) ALL active dimensions sorted by contribution desc, with
 *             progress bars. Replaces v0's top-3 slice — readers want
 *             to see the whole picture.
 *   3. (v1.1) Excluded dimensions ("Add specialty to factor this in")
 *             rendered as muted rows with a profile-completion CTA.
 *             Encouragement, not penalty — they don't drag the score.
 *   4. (v1.1) Coverage chip in the header ("· 6 of 7 dims") when the
 *             score is based on partial data. Hidden at full coverage.
 *
 * Audience prop drives which narrative framing renders. The server
 * action returns BOTH framings so a candidate + employer viewing the
 * same pair don't double-call Haiku.
 *
 * Client component because expand state + lazy fetch are interactive.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { FitWordmark, FitMark } from "@/components/practice-fit/brand/fit-wordmark";
import { bucketStyle } from "@/lib/practice-fit/buckets";
import type {
  FitDimension,
  FitDimensionKey,
  FitResult,
} from "@/lib/practice-fit/types";
import { generatePracticeFitNarrative } from "@/lib/practice-fit/narrative-action";
import type { PracticeFitNarrativeAudience } from "@/lib/practice-fit/narrative-types";
import { InlineDimEditor } from "@/components/practice-fit/inline-dim-editor";
import { ScoreRing } from "@/components/practice-fit/score-ring";
import { Eyebrow } from "@/components/brand/eyebrow";

export interface WhyThisMatchProps {
  fit: FitResult;
  /**
   * Identifiers needed to fetch the AI narrative on first expand. When
   * either is missing the component falls back to v0 behavior — no
   * narrative, just the dimension breakdown.
   */
  candidateId?: string;
  jobId?: string;
  /** Drives which narrative framing renders. Defaults to "employer". */
  audience?: PracticeFitNarrativeAudience;
  defaultOpen?: boolean;
  /**
   * 2026-07-17 cost-conscious summary — cached narratives read
   * server-side (getCachedPracticeFitNarrative) so the summary renders
   * instantly with zero tokens. On first expand we still call the
   * action once: it hash-checks and only regenerates on input drift,
   * which is token-free on the common cache-hit path. While that
   * revalidation is in flight the cached text stays visible (no
   * skeleton), and on failure the cached text survives.
   */
  initialNarrativeEmployer?: string | null;
  initialNarrativeCandidate?: string | null;
}

interface NarrativeState {
  status: "idle" | "loading" | "ready" | "error";
  employer: string | null;
  candidate: string | null;
  errorMessage: string | null;
}

export function WhyThisMatch({
  fit,
  candidateId,
  jobId,
  audience = "employer",
  defaultOpen = false,
  initialNarrativeEmployer = null,
  initialNarrativeCandidate = null,
}: WhyThisMatchProps) {
  const [open, setOpen] = useState(defaultOpen);
  const hasInitial = Boolean(
    audience === "candidate" ? initialNarrativeCandidate : initialNarrativeEmployer
  );
  const [narrative, setNarrative] = useState<NarrativeState>({
    status: hasInitial ? "ready" : "idle",
    employer: initialNarrativeEmployer,
    candidate: initialNarrativeCandidate,
    errorMessage: null,
  });
  // One action call per mount, max — tracked separately from status so
  // an SSR-cached narrative (status starts at "ready") still gets its
  // single revalidation pass on first expand.
  const requestedRef = useRef(false);
  const style = bucketStyle(fit.bucket, fit.product);

  // Lazy fetch on first open. Re-running narrative requests on every
  // expand would waste tokens, so requestedRef gates to one call.
  useEffect(() => {
    if (!open) return;
    if (requestedRef.current) return;
    if (!candidateId || !jobId) return;
    // bucket='low' bypass — surface the breakdown only. The render path
    // only displays the narrative panel for status in {loading, ready,
    // error}, so leaving status='idle' hides the band entirely.
    if (fit.bucket === "low") return;
    requestedRef.current = true;

    let cancelled = false;
    if (!hasInitial) {
      // Sync "loading" before async fetch — canonical pattern for showing
      // a skeleton while the network request is in flight. With an SSR
      // cached narrative we skip this: the cached text stays visible while
      // the revalidation runs silently.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNarrative((s) => ({ ...s, status: "loading" }));
    }
    generatePracticeFitNarrative({
      candidateId,
      jobId,
      audience,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          // Revalidation failure with a cached narrative on screen is a
          // silent no-op — stale-but-real beats an error banner.
          if (hasInitial) return;
          setNarrative({
            status: "error",
            employer: null,
            candidate: null,
            errorMessage: res.error,
          });
          return;
        }
        setNarrative({
          status: "ready",
          employer: res.narrative_employer,
          candidate: res.narrative_candidate,
          errorMessage: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (hasInitial) return;
        setNarrative({
          status: "error",
          employer: null,
          candidate: null,
          errorMessage:
            err instanceof Error ? err.message : "Couldn't load match notes.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, candidateId, jobId, audience, fit.bucket, hasInitial]);

  const narrativeText =
    audience === "candidate" ? narrative.candidate : narrative.employer;

  // v1.1 — sort dimensions: scored first (by contribution desc), then
  // excluded ones at the bottom (so the "to factor X in" rows don't
  // interrupt the scoring story).
  const orderedDims = (
    Object.entries(fit.dimensions) as Array<[FitDimensionKey, FitDimension]>
  ).sort((a, b) => {
    if (a[1].scored !== b[1].scored) return a[1].scored ? -1 : 1;
    if (b[1].contribution !== a[1].contribution) {
      return b[1].contribution - a[1].contribution;
    }
    if (b[1].weight !== a[1].weight) return b[1].weight - a[1].weight;
    return a[0].localeCompare(b[0]);
  });

  // v1.1 — coverage chip: only show when the score is based on partial
  // data. At full coverage (all dims scored) we hide it to keep the
  // header minimal.
  const partialCoverage =
    fit.coverage && fit.coverage.scored_count < fit.coverage.total_count;

  return (
    <section
      className={`border ${style.borderClass} bg-card overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${style.bgClass} ${style.textClass} hover:opacity-95`}
      >
        <span className="inline-flex items-center gap-2 flex-wrap">
          <FitWordmark product={fit.product} surface="inherit" className="text-sm" />
          <span className="text-sm font-semibold">
            {style.label}
          </span>
          <span className="text-xs opacity-80">· {style.tagline}</span>
          {partialCoverage && (
            <span className="text-2xs opacity-70 font-medium tabular">
              · {fit.coverage.scored_count} of {fit.coverage.total_count} dims
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium">
          {open ? "Hide details" : "Why this match"}
          {open ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {open && (
        <ul className="list-none divide-y divide-[var(--rule)]">
          {/* 5c signature moment — the score reveals itself when the
              panel opens: ring sweep + count-up on the brand curve.
              currentColor rides the bucket's text ramp (navy PracticeFit
              / heritage DSOFit, dark-adaptive). Static under reduced
              motion; always the exact stored score (fit-honesty). */}
          <li className={`flex items-center gap-4 px-4 py-4 ${style.textClass}`}>
            <ScoreRing score={fit.score} />
            <span className="text-xs leading-relaxed text-slate-body">
              <span className="block font-bold text-ink">
                {fit.score} out of 100 · {style.label}
              </span>
              {fit.coverage
                ? `Scored on ${fit.coverage.scored_count} of ${fit.coverage.total_count} factors from both sides' declared data.`
                : "Scored from both sides' declared data."}
            </span>
          </li>
          {/* v1 narrative band — only renders when we have ids + the
              bucket isn't 'low' AND we have something to show.
              Skipped/idle don't render a band to avoid empty whitespace. */}
          {candidateId &&
            jobId &&
            fit.bucket !== "low" &&
            (narrative.status === "loading" ||
              narrative.status === "ready" ||
              narrative.status === "error") && (
              <li className="px-4 py-3 bg-muted">
                {narrative.status === "loading" && (
                  <NarrativeSkeleton product={fit.product} />
                )}
                {narrative.status === "ready" && narrativeText && (
                  <p className="text-xs leading-relaxed text-ink">
                    {narrativeText}
                  </p>
                )}
                {narrative.status === "error" && (
                  <p className="text-xs text-slate-meta italic">
                    Match notes couldn&apos;t load right now — the
                    dimension breakdown below covers the same ground.
                  </p>
                )}
              </li>
            )}
          {orderedDims.map(([key, dim]) =>
            dim.scored ? (
              <ScoredDimRow key={key} dim={dim} audience={audience} />
            ) : (
              <UnscoredDimRow
                key={key}
                dimKey={key}
                dim={dim}
                audience={audience}
              />
            )
          )}
          <li className="px-4 py-3 bg-muted/50">
            <p className="text-2xs text-slate-meta leading-relaxed">
              {fit.product === "dsofit" ? (
                <>
                  DSOFit weighs function, seniority and scope, multi-site
                  experience, dental-domain depth, leadership scope,
                  compensation, work mode and travel — normalized over the
                  dimensions we have data on, so missing fields don&apos;t drag
                  the score down. An unrelated function gets no chip at all, and
                  a gap like seniority caps the score (informational only —
                  never an auto-screen). Score updates automatically when either
                  side changes.
                </>
              ) : (
                <>
                  PracticeFit weighs role, real commute distance, PMS fluency,
                  state licensure, compensation, specialty, skills, years of
                  experience, employment type, DSO size, and schedule overlap —
                  normalized over the dimensions we have data on, so missing
                  fields don&apos;t drag the score down. An unrelated role gets
                  no chip at all, and a hard requirement like out-of-state
                  licensure caps the score (informational only — never an
                  auto-screen). Score updates automatically when either side
                  changes.
                </>
              )}
            </p>
          </li>
        </ul>
      )}
    </section>
  );
}

/**
 * 3-line shimmer for the narrative band while Haiku generates. Matches
 * the prose's typical 30-90 word footprint at the rendered font size
 * so the band doesn't visibly grow when the response lands.
 */
function NarrativeSkeleton({ product }: { product?: "practicefit" | "dsofit" }) {
  return (
    <div aria-hidden>
      <Eyebrow className="flex items-center gap-1.5 mb-2">
        <FitMark product={product} className="h-3 w-3" />
        Summarizing the match…
      </Eyebrow>
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-muted-foreground/20 w-[92%] rounded-sm" />
        <div className="h-3 bg-muted-foreground/20 w-[88%] rounded-sm" />
        <div className="h-3 bg-muted-foreground/20 w-[60%] rounded-sm" />
      </div>
    </div>
  );
}

/**
 * Standard dimension row — used for SCORED dims. Progress bar fill is
 * proportional to raw (0-100), not contribution-of-total — that way a
 * 100% match on a 5-weight dim and a 100% match on a 25-weight dim both
 * visually fill the bar.
 */
function ScoredDimRow({
  dim,
  audience,
}: {
  dim: FitDimension;
  audience: PracticeFitNarrativeAudience;
}) {
  const fillPct = Math.max(0, Math.min(100, dim.raw));
  const detail = audience === "employer" ? dim.detail_employer : dim.detail;
  return (
    <li className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-xs font-semibold text-ink">{dim.label}</p>
        <span className="text-2xs tabular text-slate-meta">
          +{Math.round(dim.contribution)} of {dim.weight}
        </span>
      </div>
      <div className="h-1 bg-muted overflow-hidden">
        <div
          className="h-full bg-heritage transition-all"
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-body leading-snug">
        {detail}
      </p>
    </li>
  );
}

/**
 * Excluded-dimension row — muted styling, no progress bar. Shows the
 * detail text + an optional profile-completion CTA.
 *
 * The CTA renders only on the candidate side (the candidate is the one
 * who can fill the gap; the employer would just be told "candidate
 * hasn't set their salary preference," which isn't actionable for them).
 */
function UnscoredDimRow({
  dimKey,
  dim,
  audience,
}: {
  dimKey: FitDimensionKey;
  dim: FitDimension;
  audience: PracticeFitNarrativeAudience;
}) {
  const isCandidate = audience === "candidate";
  const detail = isCandidate ? dim.detail : dim.detail_employer;
  return (
    <li className="px-4 py-3 bg-muted/40">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-xs font-semibold text-slate-meta">
          {dim.label}
        </p>
        <span className="text-2xs tabular text-slate-meta opacity-70">
          not scored
        </span>
      </div>
      <p className="text-xs text-slate-body leading-snug">
        {detail}
      </p>
      {/*
        v1.3 — candidate-side action surface. Inline editor (cta_inline=true)
        for simple single-value dims; profile link for multi-select dims.
        Employer side never gets an action surface — they can't edit a
        candidate's preferences.
      */}
      {isCandidate && dim.cta_inline && (
        <InlineDimEditor dimKey={dimKey} />
      )}
      {isCandidate && !dim.cta_inline && dim.cta_href && dim.cta_label && (
        <Link
          href={dim.cta_href}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-heritage-deep hover:underline"
        >
          <Plus className="h-3 w-3" aria-hidden />
          {dim.cta_label}
        </Link>
      )}
    </li>
  );
}
