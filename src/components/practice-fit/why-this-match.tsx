"use client";

/**
 * <WhyThisMatch /> — collapsible top-3-factors expander (Phase 5D).
 *
 * Drops below the PracticeFitChip on application detail pages and
 * candidate job detail pages. Click expands to show the top 3
 * dimension contributions with their label + detail string + a thin
 * progress bar showing how much they contributed to the overall score.
 *
 * Client component because the expand/collapse state is interactive.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { BUCKET_STYLES } from "@/lib/practice-fit/buckets";
import type {
  FitDimensionKey,
  FitResult,
} from "@/lib/practice-fit/types";

export interface WhyThisMatchProps {
  fit: FitResult;
  defaultOpen?: boolean;
}

export function WhyThisMatch({ fit, defaultOpen = false }: WhyThisMatchProps) {
  const [open, setOpen] = useState(defaultOpen);
  const style = BUCKET_STYLES[fit.bucket];

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
