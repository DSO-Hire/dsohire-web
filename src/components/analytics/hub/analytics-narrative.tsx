"use client";

/**
 * AnalyticsNarrative — on-demand AI "what changed and why" summary (Phase 4).
 * Sits atop the Overview; the operator clicks Generate (so we don't pay for a
 * model call on every page load). Calls summarizeAnalytics, which recomputes
 * the bundle server-side and returns grounded prose.
 */

import { useState, useTransition } from "react";
import { Sparkles, Loader2, RefreshCcw } from "lucide-react";
import { summarizeAnalytics } from "@/app/employer/(app)/analytics/narrative-action";

export function AnalyticsNarrative({
  windowDays,
  loc,
}: {
  windowDays: number;
  loc: string | null;
}) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () => {
    setError(null);
    start(async () => {
      const r = await summarizeAnalytics(windowDays, loc);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setText(r.text);
    });
  };

  return (
    <section className="mb-6 border border-heritage/40 bg-heritage/[0.04] p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center bg-heritage/15 text-heritage-deep flex-shrink-0">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
              AI summary
            </div>
            <button
              type="button"
              onClick={run}
              disabled={pending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60"
            >
              {pending ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Reading the numbers…
                </>
              ) : text ? (
                <>
                  <RefreshCcw className="h-3 w-3" />
                  Regenerate
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3" />
                  Generate summary
                </>
              )}
            </button>
          </div>
          {text ? (
            <p className="mt-2 text-[14px] text-ink leading-relaxed">{text}</p>
          ) : (
            <p className="mt-2 text-[13px] text-slate-body leading-relaxed">
              Get a plain-English read on what stands out in this view and what
              to act on — generated from your live numbers.
            </p>
          )}
          {error && (
            <p className="mt-2 text-[12px] text-red-700">{error}</p>
          )}
        </div>
      </div>
    </section>
  );
}
