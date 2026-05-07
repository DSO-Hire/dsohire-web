"use client";

/**
 * <WhyThisMatch /> — collapsible top-3-factors expander (Phase 5D v0)
 * with optional AI narrative on top (Phase 5D v1).
 *
 * Drops below the PracticeFitChip on application detail pages and
 * candidate job detail pages. Click expands to show:
 *   1. (v1) A 2-3 sentence audience-framed AI narrative — generated
 *      lazily on first expand, cached in practice_fit_scores. Skipped
 *      entirely when bucket='low' (the dimension breakdown is more
 *      useful at that bucket; warm prose reads as apologetic).
 *   2. (v0) Top 3 dimension contributions with progress bars.
 *
 * Audience prop drives which framing of the narrative renders. The
 * server action returns BOTH framings so the column doesn't double-call
 * Haiku when an employer + candidate hit the same pair.
 *
 * Client component because expand state + lazy fetch are interactive.
 */

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { BUCKET_STYLES } from "@/lib/practice-fit/buckets";
import type {
  FitDimensionKey,
  FitResult,
} from "@/lib/practice-fit/types";
import { generatePracticeFitNarrative } from "@/lib/practice-fit/narrative-action";
import type { PracticeFitNarrativeAudience } from "@/lib/practice-fit/narrative-types";

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
  status: "idle" | "loading" | "ready" | "skipped" | "error";
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
  const style = BUCKET_STYLES[fit.bucket];

  // Lazy fetch on first open. Re-running narrative requests on every
  // expand would waste tokens, so we bail if status !== "idle".
  useEffect(() => {
    if (!open) return;
    if (narrative.status !== "idle") return;
    if (!candidateId || !jobId) return;
    // bucket='low' bypass — surface the breakdown only.
    if (fit.bucket === "low") {
      setNarrative({
        status: "skipped",
        employer: null,
        candidate: null,
        errorMessage: null,
      });
      return;
    }

    let cancelled = false;
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
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          <span className="text-[11px] font-bold tracking-[1.5px] uppercase">
            Practice Fit
          </span>
          <span className="text-[14px] font-semibold">
            {style.label}
          </span>
          <span className="text-[12px] opacity-80">· {style.tagline}</span>
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
                {narrative.status === "loading" && <NarrativeSkeleton />}
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
          {fit.top_factors.map((key) => {
            const dim = fit.dimensions[key as FitDimensionKey];
            if (!dim) return null;
            const fillPct = Math.round(
              (dim.contribution / Math.max(dim.weight, 1)) * 100
            );
            return (
              <li key={key} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <p className="text-[13px] font-semibold text-ink">
                    {dim.label}
                  </p>
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
                  {dim.detail}
                </p>
              </li>
            );
          })}
          <li className="px-4 py-3 bg-slate-50/50">
            <p className="text-[11px] text-slate-meta leading-relaxed">
              Practice Fit is computed from your structured prefs against
              the job&apos;s posting + the DSO&apos;s size. We use 6
              weighted dimensions: role, compensation, location/license,
              skills, employment type, and DSO size. Score updates
              automatically when either side changes.
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
function NarrativeSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden>
      <div className="h-3 bg-slate-200/70 w-[92%] rounded-sm" />
      <div className="h-3 bg-slate-200/70 w-[88%] rounded-sm" />
      <div className="h-3 bg-slate-200/70 w-[60%] rounded-sm" />
    </div>
  );
}
