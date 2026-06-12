"use client";

/**
 * <BoardInsights> — Lane 5 (Kanban 2.0, Model 04): the per-job funnel
 * moved next to the work, plus dwell-vs-norm narratives. Button +
 * slide-in right drawer, owned by the per-job ApplicationsBoard header.
 *
 * Every sentence is DERIVED from the same numbers the board renders:
 *   • funnel = the page's existing getJobFunnel result (ever-reached
 *     counts + step conversion) — no new queries;
 *   • bottleneck / working-well = current median days-in-stage per
 *     column vs the DSO's trailing-90 norms (same inputs as the column
 *     health headers; ≥2 cards + a norm required before we say anything);
 *   • "quiet" = cards sitting ≥7 days, counted from stage_entered_at.
 * No qualifying stage → we say so honestly instead of inventing one.
 */

import { useEffect, useMemo, useState } from "react";
import { BarChart3, X as XIcon } from "lucide-react";
import {
  daysInStage,
  partitionStagesForKanban,
  type PipelineStage,
} from "@/lib/applications/stages";
import type { JobFunnel } from "@/lib/analytics/metrics";
import type { KanbanApplication } from "./kanban-board";

const QUIET_DAYS = 7;

interface StageRead {
  label: string;
  count: number;
  median: number;
  norm: number;
  ratio: number;
  quiet: number;
}

export function BoardInsights({
  jobTitle,
  stages,
  applications,
  dwellNorms,
  funnel,
}: {
  jobTitle: string;
  stages: PipelineStage[];
  applications: KanbanApplication[];
  dwellNorms?: Record<string, number>;
  funnel: JobFunnel;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const { bottleneck, workingWell, hasNorms } = useMemo(() => {
    const { kanban } = partitionStagesForKanban(stages);
    const reads: StageRead[] = [];
    let anyNorm = false;
    for (const s of kanban) {
      const cards = applications.filter((a) => a.stage_id === s.id);
      const norm = dwellNorms?.[s.kind];
      if (norm !== undefined) anyNorm = true;
      if (cards.length < 2 || norm === undefined || norm <= 0) continue;
      const dwells = cards
        .map((a) => daysInStage(a.stage_entered_at))
        .sort((a, b) => a - b);
      const median = dwells[Math.floor(dwells.length / 2)];
      reads.push({
        label: s.label,
        count: cards.length,
        median,
        norm,
        ratio: median / norm,
        quiet: dwells.filter((d) => d >= QUIET_DAYS).length,
      });
    }
    const worst = reads
      .filter((r) => r.ratio >= 1.3)
      .sort((a, b) => b.ratio - a.ratio)[0];
    const best = reads
      .filter((r) => r.ratio <= 0.7 && r !== worst)
      .sort((a, b) => a.ratio - b.ratio)[0];
    return {
      bottleneck: worst ?? null,
      workingWell: best ?? null,
      hasNorms: anyNorm,
    };
  }, [stages, applications, dwellNorms]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] bg-white text-ink hover:bg-cream transition-colors"
      >
        <BarChart3 className="h-3.5 w-3.5 text-heritage" aria-hidden />
        Board insights
      </button>

      {open && (
        <>
          {/* Backdrop — z-[55] clears the chat launcher; toasts (z-60)
              stay above the drawer. */}
          <div
            className="fixed inset-0 z-[55] bg-ink/20"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Drawer */}
          <aside
            role="dialog"
            aria-label="Board insights"
            className="fixed inset-y-0 right-0 z-[56] w-full max-w-[380px] bg-white border-l border-[var(--rule-strong)] shadow-[-18px_0_40px_-20px_rgba(7,15,28,0.35)] flex flex-col"
          >
            <header className="shrink-0 flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--rule)]">
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[2px] uppercase text-heritage-deep">
                  Board insights
                </p>
                <p className="text-[14px] font-bold text-ink truncate">
                  {jobTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close insights"
                className="p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
              {/* Funnel — ever-reached counts + step conversion */}
              <section>
                <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-2">
                  Funnel · ever reached
                </p>
                <ol className="space-y-1.5">
                  {funnel.rows.map((row, i) => {
                    const first = funnel.rows[0]?.count ?? 0;
                    const widthPct =
                      first > 0 ? Math.max(4, (row.count / first) * 100) : 0;
                    return (
                      <li key={row.stage} className="text-[12px]">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-ink">
                            {row.label}
                          </span>
                          <span className="text-slate-meta tabular-nums">
                            {row.count}
                            {i > 0 && row.count > 0
                              ? ` · ${Math.round(row.conversion_from_prev * 100)}%`
                              : ""}
                          </span>
                        </div>
                        <div className="mt-0.5 h-1 bg-ivory-deep">
                          <div
                            className="h-full bg-heritage/60"
                            style={{ width: `${widthPct}%` }}
                            aria-hidden
                          />
                        </div>
                      </li>
                    );
                  })}
                </ol>
                {(funnel.rejected > 0 || funnel.withdrawn > 0) && (
                  <p className="mt-2 text-[11px] text-slate-meta">
                    {funnel.rejected} rejected · {funnel.withdrawn} withdrawn
                  </p>
                )}
              </section>

              {/* Narratives — derived only */}
              {bottleneck ? (
                <section className="border-l-2 border-[#b3543f] bg-amber-50/50 px-3 py-2.5">
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#b3543f] mb-1">
                    Bottleneck · {bottleneck.label}
                  </p>
                  <p className="text-[12px] leading-relaxed text-ink">
                    Median dwell here is{" "}
                    <span className="font-bold">{bottleneck.median}d</span> vs
                    your 90-day norm of{" "}
                    <span className="font-bold">{bottleneck.norm}d</span>.
                    {bottleneck.quiet > 0 && (
                      <>
                        {" "}
                        {bottleneck.quiet} of {bottleneck.count} candidates
                        here {bottleneck.quiet === 1 ? "has" : "have"} sat{" "}
                        {QUIET_DAYS}+ days — a decision pass would clear it.
                      </>
                    )}
                  </p>
                </section>
              ) : (
                <section className="border-l-2 border-heritage/50 bg-cream/50 px-3 py-2.5">
                  <p className="text-[12px] leading-relaxed text-slate-body">
                    {hasNorms
                      ? "No bottlenecks flagged — every stage with enough candidates is at or near your usual pace."
                      : "Not enough stage history yet to compute your norms — insights sharpen as candidates move through the pipeline."}
                  </p>
                </section>
              )}

              {workingWell && (
                <section className="border-l-2 border-heritage bg-cream/50 px-3 py-2.5">
                  <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-1">
                    Working well · {workingWell.label}
                  </p>
                  <p className="text-[12px] leading-relaxed text-ink">
                    Median dwell{" "}
                    <span className="font-bold">{workingWell.median}d</span> vs
                    your norm of{" "}
                    <span className="font-bold">{workingWell.norm}d</span> —
                    this stage is moving faster than usual.
                  </p>
                </section>
              )}

              <p className="text-[10px] text-slate-meta leading-relaxed">
                Norms are medians of completed stage durations across your
                organization, trailing 90 days. Stages need a norm and at
                least two current candidates before they're called out.
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
