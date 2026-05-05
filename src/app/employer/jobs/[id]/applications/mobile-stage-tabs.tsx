/**
 * <MobileStageTabs> — mobile fallback for the per-job applications board.
 *
 * Below md: shows a horizontal tab bar with the 5 open stages plus a Closed
 * tab. One stage selected at a time; cards render below. Tab choice persists
 * to localStorage. Day 6 will add long-press → action sheet for stage moves.
 */

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  KANBAN_STAGES,
  CLOSED_STAGES,
  STAGE_LABELS,
  STAGE_COLORS,
  STAGE_HEAT_CLASSES,
  daysInStage,
  stageHeatLevel,
  type ApplicationStatus,
  type KanbanStage,
} from "@/lib/applications/stages";
import type { KanbanApplication } from "./kanban-board";

type TabValue = KanbanStage | "closed";

interface MobileStageTabsProps {
  applications: KanbanApplication[];
  jobId: string;
}

const TABS: TabValue[] = [...KANBAN_STAGES, "closed"];

const TAB_STORAGE_PREFIX = "dsohire.applications.mobileTab.";

export function MobileStageTabs({ applications, jobId }: MobileStageTabsProps) {
  const [active, setActive] = useState<TabValue>("new");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `${TAB_STORAGE_PREFIX}${jobId}`;
    const stored = window.localStorage.getItem(key);
    if (stored && (TABS as string[]).includes(stored)) {
      setActive(stored as TabValue);
    }
  }, [jobId]);

  function selectTab(tab: TabValue) {
    setActive(tab);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`${TAB_STORAGE_PREFIX}${jobId}`, tab);
    }
  }

  const counts = new Map<TabValue, number>();
  for (const t of TABS) counts.set(t, 0);
  for (const app of applications) {
    if ((CLOSED_STAGES as readonly ApplicationStatus[]).includes(app.status)) {
      counts.set("closed", (counts.get("closed") ?? 0) + 1);
    } else {
      counts.set(
        app.status as KanbanStage,
        (counts.get(app.status as KanbanStage) ?? 0) + 1
      );
    }
  }

  const visible: KanbanApplication[] =
    active === "closed"
      ? applications.filter((a) =>
          (CLOSED_STAGES as readonly ApplicationStatus[]).includes(a.status)
        )
      : applications.filter((a) => a.status === active);

  visible.sort((a, b) => {
    const ap = a.pipeline_position ?? Number.POSITIVE_INFINITY;
    const bp = b.pipeline_position ?? Number.POSITIVE_INFINITY;
    if (ap !== bp) return ap - bp;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div>
      <div className="overflow-x-auto -mx-4 px-4 mb-4">
        <div className="flex gap-2 min-w-max" role="tablist">
          {TABS.map((tab) => {
            const isActive = tab === active;
            const label =
              tab === "closed" ? "Closed" : STAGE_LABELS[tab as KanbanStage];
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectTab(tab)}
                className={`px-3 py-2 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors border ${
                  isActive
                    ? "bg-ink text-ivory border-ink"
                    : "bg-white text-ink border-[var(--rule)] hover:bg-cream"
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

      <MobileTabContent tab={active} applications={visible} />
    </div>
  );
}

function MobileTabContent({
  tab,
  applications,
}: {
  tab: TabValue;
  applications: KanbanApplication[];
}) {
  if (applications.length === 0) {
    const stageLabel =
      tab === "closed" ? "Closed" : STAGE_LABELS[tab as KanbanStage];
    return (
      <div className="border border-dashed border-[var(--rule)] bg-cream/60 p-8 text-center">
        <p className="text-[14px] text-slate-meta italic">
          No candidates in {stageLabel} yet
        </p>
      </div>
    );
  }

  if (tab === "closed") {
    return (
      <div className="border border-[var(--rule)] bg-white divide-y divide-[var(--rule)]">
        {applications.map((app) => (
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
                {STAGE_LABELS[app.status]} ·{" "}
                {new Date(app.created_at).toLocaleDateString()}
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-slate-meta flex-shrink-0" />
          </Link>
        ))}
      </div>
    );
  }

  const colors = STAGE_COLORS[tab];

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
            className={`block bg-white border border-[var(--rule)] border-t-2 ${colors.text} p-3 hover:border-[var(--rule-strong)] transition-colors`}
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
