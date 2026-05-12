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
  type PipelineStage,
} from "@/lib/applications/stages";
import { KanbanCard } from "./kanban-card";
import type { KanbanApplication } from "./kanban-board";

interface KanbanColumnProps {
  stage: PipelineStage;
  applications: KanbanApplication[];
  pendingApplicationIds: ReadonlySet<string>;
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
  const colors = colorTripleFor(stage.color_class, stage.kind);
  const { isOver, setNodeRef } = useDroppable({
    id: `column:${stage.id}`,
    data: { type: "column", stageId: stage.id },
  });

  return (
    <div className="w-[280px] flex-shrink-0 flex flex-col">
      <header
        className={`${colors.bg} px-4 py-3 border-t-2 border-current ${colors.text} flex items-center justify-between`}
      >
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase">
          {stage.label}
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
