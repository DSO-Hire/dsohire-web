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

import { useEffect, useState } from "react";
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
}: WhyThisMatchProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [narrative, setNarrative] = useState<NarrativeState>({
    status: "idle",
    employer: null,
    candidate: null,
    errorMessage: null,
  });
  const style = bucketStyle(fit.bucket, fit.product);

  // Lazy fetch on first open. Re-running narrative requests on every
  // expand would waste tokens, so we bail if status !== "idle".
  useEffect(() => {
    if (!open) return;
    if (narrative.status !== "idle") return;
    if (!candidateId || !jobId) return;
    // bucket='low' bypass — surface the breakdown only. Leaving
    // status='idle' is functionally equivalent to the prior 'skipped'
    // sentinel since the render path only displays the narrative panel
    // for status in {loading, ready, error}. Keeps setState out of the
    // effect body (was tripping react-hooks/set-state-in-effect).
    if (fit.bucket === "low") return;

    let cancelled = false;
    // Sync "loading" before async fetch — canonical pattern for showing
    // a skeleton while the network request is in flight. The
    // set-state-in-effect rule fires here but the alternative (deriving
    // loading from a separate hook) buys nothing for a one-shot fetch
    // gated on `narrative.status !== "idle"`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNarrative((s) => ({ ...s, status: "loading" }));
    generatePracticeFitNarrative({
      candidateId,
      jobId,
      audience,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
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
  }, [open, candidateId, jobId, audience, fit.bucket, narrative.status]);

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
      className={`border ${style.borderClass} bg-white overflow-hidden`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${style.bgClass} ${style.textClass} hover:opacity-95`}
      >
        <span className="inline-flex items-center gap-2 flex-wrap">
          <FitWordmark product={fit.product} surface="inherit" className="text-[15px]" />
          <span className="text-[14px] font-semibold">
            {style.label}
          </span>
          <span className="text-[12px] opacity-80">· {style.tagline}</span>
          {partialCoverage && (
            <span className="text-[11px] opacity-70 font-medium">
              · {fit.coverage.scored_count} of {fit.coverage.total_count} dims
            </span>
          )}
        </span>
        <span className="inline-flex items-center gap-1 text-[12px] font-medium">
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
          {/* v1 narrative band — only renders when we have ids + the
              bucket isn't 'low' AND we have something to show.
              Skipped/idle don't render a band to avoid empty whitespace. */}
          {candidateId &&
            jobId &&
            fit.bucket !== "low" &&
            (narrative.status === "loading" ||
              narrative.status === "ready" ||
              narrative.status === "error") && (
              <li className="px-4 py-3 bg-[#FAF7F1]">
                {narrative.status === "loading" && (
                  <NarrativeSkeleton product={fit.product} />
                )}
                {narrative.status === "ready" && narrativeText && (
                  <p className="text-[13px] leading-relaxed text-ink">
                    {narrativeText}
                  </p>
                )}
                {narrative.status === "error" && (
                  <p className="text-[12px] text-slate-meta italic">
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
          <li className="px-4 py-3 bg-slate-50/50">
            <p className="text-[11px] text-slate-meta leading-relaxed">
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
      <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
        <FitMark product={product} className="h-3 w-3" />
        Summarizing the match…
      </div>
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-slate-200/70 w-[92%] rounded-sm" />
        <div className="h-3 bg-slate-200/70 w-[88%] rounded-sm" />
        <div className="h-3 bg-slate-200/70 w-[60%] rounded-sm" />
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
        <p className="text-[13px] font-semibold text-ink">{dim.label}</p>
        <span className="text-[11px] font-mono text-slate-meta">
          +{Math.round(dim.contribution)} of {dim.weight}
        </span>
      </div>
      <div className="h-1 bg-slate-100 overflow-hidden">
        <div
          className="h-full bg-heritage transition-all"
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <p className="mt-2 text-[12px] text-slate-body leading-snug">
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
    <li className="px-4 py-3 bg-slate-50/40">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p className="text-[13px] font-semibold text-slate-meta">
          {dim.label}
        </p>
        <span className="text-[11px] font-mono text-slate-meta opacity-70">
          not scored
        </span>
      </div>
      <p className="text-[12px] text-slate-body leading-snug">
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
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-heritage-deep hover:underline"
        >
          <Plus className="h-3 w-3" aria-hidden />
          {dim.cta_label}
        </Link>
      )}
    </li>
  );
}
