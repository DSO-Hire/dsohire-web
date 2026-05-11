/**
 * Time-in-stage card (Phase 5C / E6.6, shipped 2026-05-11).
 *
 * Renders on /employer/jobs/[id] below the funnel viz. Shows the average
 * number of days applications spend in each pipeline stage before moving
 * forward (Applied → Screening → Interview → Offered). Helps surface
 * bottleneck stages — e.g., if Screening averages 14 days, that's where
 * to focus.
 *
 * Empty-state copy when there aren't enough transitions to compute yet.
 */

import { Clock } from "lucide-react";
import type { StageDwellRow } from "@/lib/analytics/metrics";

interface StageDwellCardProps {
  rows: StageDwellRow[];
}

export function StageDwellCard({ rows }: StageDwellCardProps) {
  const hasAnyData = rows.some((r) => r.observed_transitions > 0);

  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-heritage-deep" aria-hidden />
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Time in stage
        </div>
      </div>

      {!hasAnyData ? (
        <p className="text-[13px] text-slate-meta italic leading-relaxed">
          Time-in-stage populates as candidates move through the
          pipeline. Once a few apps transition stages, you&apos;ll see
          the average days each stage holds candidates.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li
              key={row.stage}
              className="flex items-baseline justify-between gap-3 text-[13px]"
            >
              <span className="font-semibold text-ink">{row.label}</span>
              <span className="tabular-nums text-slate-body">
                {row.avg_days === null ? (
                  <span className="italic text-slate-meta">
                    no transitions yet
                  </span>
                ) : (
                  <>
                    <strong className="text-ink">
                      {row.avg_days.toFixed(1)}d
                    </strong>
                    <span className="ml-2 text-slate-meta text-[11px]">
                      avg · {row.observed_transitions}{" "}
                      {row.observed_transitions === 1
                        ? "transition"
                        : "transitions"}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
