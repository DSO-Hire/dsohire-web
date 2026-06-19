/**
 * <MobileStageTabs> — mobile fallback for the per-job applications board.
 *
 * Below md: shows a horizontal tab bar with one tab per visible kanban
 * stage plus a Closed tab. One stage selected at a time; cards render
 * below. Tab choice persists to localStorage.
 *
 * Post-Track-B: stage list is per-DSO, sourced from dso_pipeline_stages.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  KIND_DEFAULT_LABELS,
  STAGE_HEAT_CLASSES,
  colorTripleFor,
  daysInStage,
  isTerminalKind,
  partitionStagesForKanban,
  stageHeatLevel,
  type PipelineStage,
} from "@/lib/applications/stages";
import type { KanbanApplication } from "./kanban-board";

const CLOSED_TAB = "__closed";
type TabValue = string; // stage_id, or CLOSED_TAB

interface MobileStageTabsProps {
  applications: KanbanApplication[];
  /** DSO pipeline stages, in sort order. */
  stages: PipelineStage[];
  jobId: string;
}

const TAB_STORAGE_PREFIX = "dsohire.applications.mobileTab.";

export function MobileStageTabs({
  applications,
  stages,
  jobId,
}: MobileStageTabsProps) {
  const { kanban: kanbanStages, terminal: terminalStages } =
    partitionStagesForKanban(stages);
  const tabIds: TabValue[] = [...kanbanStages.map((s) => s.id), CLOSED_TAB];
  const defaultTab: TabValue = kanbanStages[0]?.id ?? CLOSED_TAB;

  const [active, setActive] = useState<TabValue>(defaultTab);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${TAB_STORAGE_PREFIX}${jobId}`;
    const stored = window.localStorage.getItem(key);
    if (stored && tabIds.includes(stored)) {
      setActive(stored);
    }
  }, [jobId, tabIds]);

  function selectTab(tab: TabValue) {
    setActive(tab);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${TAB_STORAGE_PREFIX}${jobId}`, tab);
    }
  }

  const labelForTab = (tab: TabValue): string => {
    if (tab === CLOSED_TAB) return "Closed";
    const row = stages.find((s) => s.id === tab);
    return row?.label ?? "Stage";
  };

  // Bucket counts.
  const counts = new Map<TabValue, number>();
  for (const t of tabIds) counts.set(t, 0);
  for (const app of applications) {
    if (isTerminalKind(app.kind)) {
      counts.set(CLOSED_TAB, (counts.get(CLOSED_TAB) ?? 0) + 1);
    } else {
      // For kanban-kind apps, bucket by their stage_id if that stage
      // is in the visible kanban list; otherwise drop them into the
      // first kanban tab as a defensive fallback.
      const present = kanbanStages.some((s) => s.id === app.stage_id);
      const tab = present ? app.stage_id : defaultTab;
      counts.set(tab, (counts.get(tab) ?? 0) + 1);
    }
  }

  const visible: KanbanApplication[] =
    active === CLOSED_TAB
      ? applications.filter((a) => isTerminalKind(a.kind))
      : applications.filter((a) => a.stage_id === active);

  visible.sort((a, b) => {
    const ap = a.pipeline_position ?? Number.POSITIVE_INFINITY;
    const bp = b.pipeline_position ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const activeStage =
    active === CLOSED_TAB
      ? null
      : kanbanStages.find((s) => s.id === active) ?? null;

  return (
    <div>
      <div className="overflow-x-auto -mx-4 px-4 mb-4">
        <div className="flex gap-2 min-w-max" role="tablist">
          {tabIds.map((tab) => {
            const isActive = tab === active;
            const label = labelForTab(tab);
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(tab)}
                className={`px-3 py-2 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors border ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-ink border-[var(--rule)] hover:bg-cream"
                }`}
              >
                {label}
                <span className="ml-2 tabular-nums opacity-80">
                  {counts.get(tab) ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <MobileTabContent
        applications={visible}
        active={active}
        activeStage={activeStage}
        terminalStages={terminalStages}
      />
    </div>
  );
}

function MobileTabContent({
  applications,
  active,
  activeStage,
  terminalStages,
}: {
  applications: KanbanApplication[];
  active: TabValue;
  activeStage: PipelineStage | null;
  terminalStages: PipelineStage[];
}) {
  if (applications.length === 0) {
    const label = active === CLOSED_TAB ? "Closed" : activeStage?.label ?? "Stage";
    return (
      <div className="border border-dashed border-[var(--rule)] bg-cream/60 p-8 text-center">
        <p className="text-[14px] text-slate-meta italic">
          No candidates in {label} yet
        </p>
      </div>
    );
  }

  if (active === CLOSED_TAB) {
    // Resolve each row's terminal stage label (rejected/withdrawn pile
    // typically; honor the per-DSO label per row).
    const terminalById = new Map(terminalStages.map((s) => [s.id, s]));
    return (
      <div className="border border-[var(--rule)] bg-card divide-y divide-[var(--rule)]">
        {applications.map((app) => {
          const stage = terminalById.get(app.stage_id);
          const stageLabel = stage?.label ?? KIND_DEFAULT_LABELS[app.kind];
          return (
            <Link
              key={app.id}
              href={`/employer/applications/${app.id}`}
              className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-cream transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-ink truncate">
                  {app.candidate?.full_name ?? "Anonymous candidate"}
                </div>
                <div className="text-[12px] text-slate-meta truncate">
                  {stageLabel} ·{" "}
                  {new Date(app.created_at).toLocaleDateString()}
                </div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-meta flex-shrink-0" />
            </Link>
          );
        })}
      </div>
    );
  }

  const colors = activeStage
    ? colorTripleFor(activeStage.color_class, activeStage.kind)
    : null;

  return (
    <div className="space-y-2">
      {applications.map((app) => {
        const days = daysInStage(app.stage_entered_at);
        const heat = stageHeatLevel(days);
        const heatClasses = STAGE_HEAT_CLASSES[heat];
        const cand = app.candidate;
        return (
          <Link
            key={app.id}
            href={`/employer/applications/${app.id}`}
            className={`block bg-card border border-[var(--rule)] border-t-2 ${colors?.text ?? ""} p-3 hover:border-[var(--rule-strong)] transition-colors`}
          >
            <div className="text-[14px] font-bold text-ink truncate mb-1">
              {cand?.full_name ?? "Anonymous candidate"}
            </div>
            <div className="text-[13px] text-slate-body truncate mb-2">
              {cand?.current_title || cand?.headline || "Profile minimal"}
            </div>
            <div className="flex items-center justify-between">
              <span
                className={`text-[9px] font-bold tracking-[1px] uppercase px-1.5 py-0.5 ${heatClasses}`}
              >
                {days}d in stage
              </span>
              {cand?.years_experience !== null &&
                cand?.years_experience !== undefined && (
                  <span className="text-[10px] text-slate-meta tabular-nums">
                    {cand.years_experience}y
                  </span>
                )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
