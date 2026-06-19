"use client";

/**
 * <PipelineHqBoard> — the Pipeline HQ client layer (#115 FOH-10, Day 32).
 *
 * Thin by design: header + job chips + minimum-fit filter, then hands the
 * (filtered) applications to the battle-tested per-job <KanbanBoard>. The
 * board reseeds itself whenever the filtered array changes; realtime stays
 * subscribed to ALL the DSO's jobs via `realtimeJobIds`, so moves made by
 * teammates land even while a chip filter is active (events for cards not
 * currently seeded are simply ignored — they reconcile on the next
 * visibility refetch).
 */

import { useMemo, useState } from "react";
import { Lock, SquareKanban } from "lucide-react";
import type { PipelineStage } from "@/lib/applications/stages";
import {
  KanbanBoard,
  type KanbanApplication,
} from "../jobs/[id]/applications/kanban-board";

export interface PipelineJobChip {
  id: string;
  title: string;
  status: string;
  confidential: boolean;
  count: number;
}

const MIN_FIT_OPTIONS = [
  { value: 0, label: "Any fit" },
  { value: 70, label: "Fit 70+" },
  { value: 85, label: "Fit 85+" },
] as const;

export function PipelineHqBoard({
  applications,
  stages,
  jobs,
  jobIds,
  aiSuggesterAvailable,
  aiSuggesterContextByAppId,
  canBulkAct,
  truncated,
  dwellNorms,
}: {
  applications: KanbanApplication[];
  stages: PipelineStage[];
  jobs: PipelineJobChip[];
  jobIds: string[];
  aiSuggesterAvailable: boolean;
  aiSuggesterContextByAppId: Record<string, boolean>;
  canBulkAct: boolean;
  truncated: boolean;
  /** Lane 5 — DSO trailing-90 dwell norms, pass-through to column health. */
  dwellNorms?: Record<string, number>;
}) {
  const [activeJob, setActiveJob] = useState<string>("all");
  const [minFit, setMinFit] = useState<number>(0);

  const filtered = useMemo(() => {
    return applications.filter((a) => {
      if (activeJob !== "all" && a.job_id !== activeJob) return false;
      if (minFit > 0) {
        const score = a.practiceFit?.score ?? null;
        if (score === null || score < minFit) return false;
      }
      return true;
    });
  }, [applications, activeJob, minFit]);

  const chips = useMemo(
    () => [...jobs].sort((a, b) => b.count - a.count),
    [jobs]
  );

  return (
    <div>
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.5px] text-ink">
            <SquareKanban className="h-5 w-5 text-heritage" aria-hidden />
            Pipeline HQ
          </h1>
          <p className="text-[13px] text-slate-body mt-0.5">
            Every practice. Every role. One pipeline.
            {truncated && (
              <span className="text-slate-meta">
                {" "}
                · Showing the newest 500 applications — use the Applications
                list for the full archive.
              </span>
            )}
          </p>
        </div>
        {/* min-fit filter */}
        <div className="flex items-center gap-1.5" role="group" aria-label="Minimum fit filter">
          {MIN_FIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMinFit(opt.value)}
              className={`px-3 py-1.5 text-[11px] font-bold border transition-colors ${
                minFit === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-slate-body border-[var(--rule-strong)] hover:border-ink"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {minFit > 0 && (
            <span className="ml-1 text-[10px] text-slate-meta">scored only</span>
          )}
        </div>
      </div>

      {/* job chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        <JobChip
          label={`All roles (${applications.length})`}
          active={activeJob === "all"}
          onClick={() => setActiveJob("all")}
        />
        {chips.map((j) => (
          <JobChip
            key={j.id}
            label={`${j.title} (${j.count})`}
            confidential={j.confidential}
            paused={j.status === "paused"}
            active={activeJob === j.id}
            onClick={() => setActiveJob(activeJob === j.id ? "all" : j.id)}
          />
        ))}
      </div>

      <KanbanBoard
        applications={filtered}
        stages={stages}
        aiSuggesterAvailable={aiSuggesterAvailable}
        aiSuggesterContextByAppId={aiSuggesterContextByAppId}
        canBulkAct={canBulkAct}
        realtimeJobIds={jobIds}
        dwellNorms={dwellNorms}
        laneAccessor={(a) => a.jobTitle}
      />
    </div>
  );
}

function JobChip({
  label,
  active,
  confidential,
  paused,
  onClick,
}: {
  label: string;
  active: boolean;
  confidential?: boolean;
  paused?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-bold border transition-colors max-w-[280px] ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-slate-body border-[var(--rule-strong)] hover:border-ink hover:text-ink"
      }`}
    >
      {confidential && <Lock className="h-3 w-3 shrink-0 text-warning" aria-label="Confidential search" />}
      <span className="truncate">{label}</span>
      {paused && (
        <span className="text-[8px] font-extrabold tracking-[0.8px] uppercase opacity-60">
          paused
        </span>
      )}
    </button>
  );
}
