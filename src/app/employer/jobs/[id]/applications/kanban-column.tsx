/**
 * <KanbanColumn> — single pipeline stage column on the board.
 *
 * Track B: a column is now keyed by a `dso_pipeline_stages` row (id + kind +
 * label + color_class). The droppable id is `column:<stage_id>`. Visuals
 * resolve via `colorTripleFor(row.color_class, row.kind)` so DSO-customized
 * colors land here automatically.
 */

"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  colorTripleFor,
  daysInStage,
  type PipelineStage,
} from "@/lib/applications/stages";
import { KanbanCard } from "./kanban-card";
import type { KanbanApplication } from "./kanban-board";

/* Lane 5 — column health (Model 04). Tones compare the column's CURRENT
 * median days-in-stage against the DSO's OWN trailing-90 completed-dwell
 * norm — not arbitrary thresholds. No norm (thin history) → neutral. */
const HEALTH_TONES = {
  ok: { bar: "bg-heritage", text: "text-heritage-deep" },
  warn: { bar: "bg-amber-500", text: "text-amber-700" },
  hot: { bar: "bg-[#b3543f]", text: "text-[#b3543f]" },
  neutral: { bar: "bg-slate-300", text: "text-slate-meta" },
} as const;

interface KanbanColumnProps {
  stage: PipelineStage;
  applications: KanbanApplication[];
  pendingApplicationIds: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
  /** stage kind → median completed dwell (days) over the DSO's trailing
   * 90 days. Absent kind = not enough history = neutral header. */
  dwellNorms?: Record<string, number>;
  /** Lane 5 swimlanes — when set, cards group under dashed labels by
   * this accessor's value (e.g. job title on Pipeline HQ). Purely
   * visual: the droppable stays the whole column, drag is untouched. */
  laneLabel?: (app: KanbanApplication) => string;
  /** Lane 5 quick-actions — board-supplied advance action per card
   * (rides runMove). Presence also turns the hover action row on. */
  quickAdvanceFor?: (
    app: KanbanApplication
  ) => { run: () => void; title: string } | null;
}

export function KanbanColumn({
  stage,
  applications,
  pendingApplicationIds,
  selectedIds,
  onToggleSelect,
  dwellNorms,
  laneLabel,
  quickAdvanceFor,
}: KanbanColumnProps) {
  const colors = colorTripleFor(stage.color_class, stage.kind);
  const { isOver, setNodeRef } = useDroppable({
    id: `column:${stage.id}`,
    data: { type: "column", stageId: stage.id },
  });

  // Current median days-in-stage across the cards sitting here now.
  const dwells = applications
    .map((a) => daysInStage(a.stage_entered_at))
    .sort((a, b) => a - b);
  const currentMedian =
    dwells.length > 0 ? dwells[Math.floor(dwells.length / 2)] : null;
  const norm = dwellNorms?.[stage.kind] ?? null;
  const ratio =
    currentMedian !== null && norm !== null && norm > 0
      ? currentMedian / norm
      : null;
  const tone =
    ratio === null
      ? "neutral"
      : ratio >= 2
        ? "hot"
        : ratio >= 1.3
          ? "warn"
          : "ok";
  const toneClasses = HEALTH_TONES[tone];

  // Lane grouping (visual only). Cards keep their column order inside
  // each lane; lanes order by first appearance so the column's overall
  // rhythm stays stable when toggling.
  const lanes =
    laneLabel !== undefined && applications.length > 0
      ? (() => {
          const order: string[] = [];
          const grouped = new Map<string, KanbanApplication[]>();
          for (const app of applications) {
            const label = laneLabel(app);
            if (!grouped.has(label)) {
              order.push(label);
              grouped.set(label, []);
            }
            grouped.get(label)!.push(app);
          }
          return order.map((label) => ({
            label,
            apps: grouped.get(label)!,
          }));
        })()
      : null;

  return (
    <div className="kb-col w-[280px] flex-shrink-0 flex flex-col">
      <header
        className={`${colors.bg} px-4 py-3 border-t-2 border-current ${colors.text}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
            {stage.label}
          </span>
          <span className="text-[10px] font-bold tabular-nums">
            {applications.length}
          </span>
        </div>
        {currentMedian !== null && (
          <div
            className="mt-1.5 flex items-center gap-2"
            title={
              norm !== null
                ? `Median ${currentMedian}d in stage right now vs your 90-day norm of ${norm}d`
                : `Median ${currentMedian}d in stage right now — not enough history yet for a norm`
            }
          >
            <span className="relative h-1 flex-1 bg-black/10 overflow-hidden">
              {ratio !== null && (
                <span
                  className={`absolute inset-y-0 left-0 ${toneClasses.bar}`}
                  style={{ width: `${Math.min(100, ratio * 50)}%` }}
                  aria-hidden
                />
              )}
            </span>
            <span
              className={`text-[9px] font-semibold tabular-nums whitespace-nowrap ${toneClasses.text}`}
            >
              median {currentMedian}d
              {ratio !== null && ratio >= 1.3
                ? ` — ${ratio.toFixed(1)}× norm`
                : ""}
            </span>
          </div>
        )}
      </header>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 min-h-[200px] transition-colors ${
          isOver
            ? "bg-heritage/10 ring-2 ring-inset ring-heritage/40"
            : "bg-cream/40"
        }`}
        aria-label={`${stage.label} column drop target`}
      >
        {applications.length === 0 ? (
          <div
            className={`text-[13px] italic px-3 py-6 text-center border border-dashed bg-cream/60 ${
              isOver
                ? "border-heritage/50 text-heritage-deep"
                : "border-[var(--rule)] text-slate-meta"
            }`}
          >
            {isOver
              ? "Drop to move here"
              : `No candidates in ${stage.label} yet`}
          </div>
        ) : lanes ? (
          lanes.map((lane, idx) => (
            <div key={lane.label} className="space-y-2">
              <div
                className={`text-[8.5px] font-extrabold tracking-[1px] uppercase text-slate-meta ${
                  idx === 0
                    ? ""
                    : "pt-1.5 border-t border-dashed border-[var(--rule-strong)]"
                }`}
              >
                {lane.label} · {lane.apps.length}
              </div>
              {lane.apps.map((app) => (
                <KanbanCard
                  key={app.id}
                  application={app}
                  pending={pendingApplicationIds.has(app.id)}
                  selected={selectedIds.has(app.id)}
                  onToggleSelect={onToggleSelect}
                  showQuickActions={quickAdvanceFor !== undefined}
                  quickAdvance={quickAdvanceFor?.(app) ?? null}
                />
              ))}
            </div>
          ))
        ) : (
          applications.map((app) => (
            <KanbanCard
              key={app.id}
              application={app}
              pending={pendingApplicationIds.has(app.id)}
              selected={selectedIds.has(app.id)}
              onToggleSelect={onToggleSelect}
              showQuickActions={quickAdvanceFor !== undefined}
              quickAdvance={quickAdvanceFor?.(app) ?? null}
            />
          ))
        )}
      </div>
    </div>
  );
}
