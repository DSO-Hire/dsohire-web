/**
 * <KanbanColumn> — single pipeline stage column on the board.
 *
 * Day 3: droppable via `useDroppable`. Highlights when a draggable card is
 * over it. Renders header (label + count) and a stack of <KanbanCard>s.
 *
 * Day 5: forwards selection state + the column's id-order array to each card
 * so shift-click can extend a range over the visible column order.
 *
 * Two visual variants:
 *  - regular stage column (KANBAN_STAGES) — full-width column
 *  - closed lane droppable (used by the parent for the rejected drop target)
 *    — handled in the board file, not here.
 */

"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  STAGE_COLORS,
  STAGE_LABELS,
  type KanbanStage,
} from "@/lib/applications/stages";
import { KanbanCard } from "./kanban-card";
import type { KanbanApplication } from "./kanban-board";

interface KanbanColumnProps {
  stage: KanbanStage;
  applications: KanbanApplication[];
  pendingApplicationIds: ReadonlySet<string>;
  /**
   * Day 5: selection wiring. The board owns the selection set + the global
   * id-order array (column-major); the column just forwards toggle calls. The
   * shift-range resolution lives in the board (one source of order).
   */
  selectedIds: ReadonlySet<string>;
  onToggleSelect: (id: string, shiftKey: boolean) => void;
}

export function KanbanColumn({
  stage,
  applications,
  pendingApplicationIds,
  selectedIds,
  onToggleSelect,
}: KanbanColumnProps) {
  const colors = STAGE_COLORS[stage];
  const { isOver, setNodeRef } = useDroppable({
    id: `column:${stage}`,
    data: { type: "column", status: stage },
  });

  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col">
      <header
        className={`${colors.bg} px-4 py-3 border-t-2 border-current ${colors.text} flex items-center justify-between`}
      >
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
          {STAGE_LABELS[stage]}
        </span>
        <span className="text-[10px] font-bold tabular-nums">
          {applications.length}
        </span>
      </header>
      <div
        ref={setNodeRef}
        className={`flex-1 p-2 space-y-2 min-h-[200px] transition-colors ${
          isOver
            ? "bg-heritage/10 ring-2 ring-inset ring-heritage/40"
            : "bg-cream/40"
        }`}
        aria-label={`${STAGE_LABELS[stage]} column drop target`}
      >
        {applications.length === 0 ? (
          <div
            className={`text-[12px] italic px-3 py-6 text-center border border-dashed bg-cream/60 ${
              isOver
                ? "border-heritage/50 text-heritage-deep"
                : "border-[var(--rule)] text-slate-meta"
            }`}
          >
            {isOver
              ? "Drop to move here"
              : `No candidates in ${STAGE_LABELS[stage]} yet`}
          </div>
        ) : (
          applications.map((app) => (
            <KanbanCard
              key={app.id}
              application={app}
              pending={pendingApplicationIds.has(app.id)}
              selected={selectedIds.has(app.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
