/**
 * PipelineFunnel — full-width funnel visualization showing where the
 * pipeline converts and where it leaks across five canonical stages.
 *
 *   Submitted → Reviewed → Interview → Offer → Hired
 *
 * Each stage shows:
 *   - Absolute count for the window
 *   - A bar whose width is the stage's count relative to the total
 *     submitted count (so the funnel actually narrows)
 *   - Stage label
 *   - Conversion % from the previous stage (skipped on the leftmost
 *     "Submitted" stage since there's no prior stage to compare to)
 *
 * Footer summary surfaces three meta-stats:
 *   - Application → Hire end-to-end conversion %
 *   - The biggest single-step drop (flagged in red so it pops)
 *   - Median time to hire (TODO: requires status-event timing query;
 *     stubs to "—" when not provided)
 *
 * The whole widget is wrapped in a Link so click-through goes to the
 * full analytics surface (when that surface exists; for now, points
 * to the applications inbox as a sensible fallback).
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface PipelineFunnelProps {
  /** Absolute counts per stage. Order: submitted, reviewed, interview, offer, hired. */
  stageCounts: {
    submitted: number;
    reviewed: number;
    interview: number;
    offer: number;
    hired: number;
  };
  /** Total candidates that touched the pipeline in the window. Used as the
   * bar-width baseline so "Submitted" reads as 100%. Defaults to stageCounts.submitted. */
  baseline?: number;
  /** Window label shown in the subtitle (e.g. "Last 30 days"). */
  windowLabel?: string;
  /** Optional median time-to-hire; renders "—" when undefined. */
  medianTimeToHireDays?: number | null;
  /** Click-through destination. */
  href?: string;
}

const STAGES: Array<{
  key: keyof PipelineFunnelProps["stageCounts"];
  label: string;
  showConv: boolean;
}> = [
  { key: "submitted", label: "Submitted", showConv: false },
  { key: "reviewed", label: "Reviewed", showConv: true },
  { key: "interview", label: "Interview", showConv: true },
  { key: "offer", label: "Offer", showConv: true },
  { key: "hired", label: "Hired", showConv: true },
];

export function PipelineFunnel({
  stageCounts,
  baseline,
  windowLabel = "Last 30 days",
  medianTimeToHireDays,
  href = "/employer/applications",
}: PipelineFunnelProps) {
  const max = baseline ?? stageCounts.submitted;
  const safeMax = max > 0 ? max : 1;

  // Calculate conversion % from prev stage for each subsequent stage.
  const conversions: Array<number | null> = STAGES.map((stage, i) => {
    if (i === 0) return null;
    const prevKey = STAGES[i - 1].key;
    const prev = stageCounts[prevKey];
    if (prev === 0) return 0;
    return Math.round((stageCounts[stage.key] / prev) * 100);
  });

  // Find the biggest drop (lowest conversion %) for the "biggest leak" callout.
  let worstIdx = -1;
  let worstPct = 101;
  conversions.forEach((c, i) => {
    if (c !== null && c < worstPct) {
      worstPct = c;
      worstIdx = i;
    }
  });

  // End-to-end Application → Hire %.
  const e2ePct =
    stageCounts.submitted > 0
      ? Math.round((stageCounts.hired / stageCounts.submitted) * 1000) / 10
      : 0;

  return (
    <Link
      href={href}
      className="group block bg-white border border-[var(--rule)] p-6 sm:p-8 hover:bg-cream/30 transition-colors"
    >
      <header className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h2 className="text-[11px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
            Pipeline Funnel
          </h2>
          <div className="text-[12px] text-slate-meta mt-1">
            {windowLabel} · Where your pipeline leaks and where it converts.
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold tracking-[1.5px] uppercase text-heritage group-hover:text-heritage-deep transition-colors">
          Open analytics
          <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
        </span>
      </header>

      {/* Funnel bars */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {STAGES.map((stage, i) => {
          const count = stageCounts[stage.key];
          const pct = (count / safeMax) * 100;
          const conv = conversions[i];
          const isWorst = i === worstIdx && conv !== null && conv < 100;
          return (
            <div key={stage.key} className="flex flex-col">
              <div className="text-[28px] sm:text-[32px] font-black tracking-[-1.2px] leading-none text-ink mb-2">
                {count}
              </div>
              <div className="h-3 bg-cream relative mb-2.5">
                <span
                  className="absolute top-0 left-0 bottom-0"
                  style={{
                    width: `${Math.max(pct, count > 0 ? 4 : 0)}%`,
                    background:
                      "linear-gradient(to right, var(--heritage), rgba(141,184,163,1))",
                  }}
                />
              </div>
              <div className="text-[10px] font-extrabold tracking-[1.6px] uppercase text-heritage-deep mb-0.5">
                {stage.label}
              </div>
              <div className="text-[11px] text-slate-meta">
                {stage.showConv && conv !== null ? (
                  <>
                    <strong className="text-ink font-bold">{conv}%</strong>{" "}
                    from prev{isWorst && (
                      <span className="text-red-700"> · biggest drop</span>
                    )}
                  </>
                ) : (
                  "Total inbound"
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="mt-6 pt-5 border-t border-[var(--rule)] flex flex-wrap items-baseline gap-x-7 gap-y-2 text-[12px] text-slate-body">
        <div className="flex gap-1.5 items-baseline">
          Application → Hire{" "}
          <strong className="text-ink font-extrabold text-[14px] tracking-[-0.3px]">
            {e2ePct}%
          </strong>
        </div>
        {worstIdx >= 0 && conversions[worstIdx] !== null && (
          <div className="flex gap-1.5 items-baseline">
            {STAGES[worstIdx - 1].label} → {STAGES[worstIdx].label}{" "}
            <strong className="text-ink font-extrabold text-[14px] tracking-[-0.3px]">
              {conversions[worstIdx]}%
            </strong>{" "}
            <span className="text-red-700">↘ biggest drop</span>
          </div>
        )}
        <div className="flex gap-1.5 items-baseline">
          Median time to hire{" "}
          <strong className="text-ink font-extrabold text-[14px] tracking-[-0.3px]">
            {medianTimeToHireDays != null
              ? `${medianTimeToHireDays} day${medianTimeToHireDays === 1 ? "" : "s"}`
              : "—"}
          </strong>
        </div>
      </div>
    </Link>
  );
}
