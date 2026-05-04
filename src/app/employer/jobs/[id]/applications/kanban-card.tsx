/**
 * <KanbanCard> — single application card on the pipeline board.
 *
 * Day 3: draggable via @dnd-kit. The card itself is a `<button>` (not a
 * <Link>) so that `useDraggable` can attach without nesting interactive
 * elements; on a non-drag click we navigate via the router. The full-card
 * link target is `/employer/applications/[id]`.
 *
 * Day 5: selection checkbox (top-right). Click toggles selection without
 * triggering the card click or initiating a drag (pointer events on the
 * checkbox are stopped before they reach the draggable). Shift-click extends
 * the selection range (the parent column owns the id-order array). Selected
 * cards get a heritage-tinted ring + a subtle scale lift.
 *
 * Visual state:
 *  - default: cursor-grab
 *  - dragging: cursor-grabbing + dimmed in place (the visible card lives in
 *    the <DragOverlay> rendered by the parent board)
 *  - selected: heritage ring + scale-[1.02]
 *  - focus-visible: heritage ring (only when keyboard-focused, not on click)
 */

"use client";

import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import type { CSSProperties, MouseEvent, PointerEvent } from "react";
import {
  daysInStage,
  stageHeatLevel,
  STAGE_HEAT_CLASSES,
} from "@/lib/applications/stages";
import type { KanbanApplication } from "./kanban-board";

interface KanbanCardProps {
  application: KanbanApplication;
  /**
   * When true the card is the source of an active drag — render dimmed in
   * place. The visible drag artifact is the <DragOverlay> on the board.
   */
  isOverlay?: boolean;
  /**
   * Disable drag/click interactions while a drag transition is pending. Used
   * for both the card-being-dragged (so users can't navigate mid-drag) and
   * any other card while we're awaiting server confirmation.
   */
  pending?: boolean;
  /**
   * Day 5 selection state. When `selected` is true, the card renders with a
   * heritage ring + a slight raise. Click on the checkbox calls
   * `onToggleSelect` (with shiftKey passed through for range select). When
   * `selectable` is false (e.g., withdrawn rows in the closed lane) the
   * checkbox is omitted entirely.
   */
  selected?: boolean;
  selectable?: boolean;
  onToggleSelect?: (id: string, shiftKey: boolean) => void;
}

export function KanbanCard({
  application,
  isOverlay = false,
  pending = false,
  selected = false,
  selectable = true,
  onToggleSelect,
}: KanbanCardProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: application.id,
    data: { type: "application", status: application.status },
    disabled: pending && !isOverlay,
  });

  const days = daysInStage(application.stage_entered_at);
  const heat = stageHeatLevel(days);
  const heatClasses = STAGE_HEAT_CLASSES[heat];
  const cand = application.candidate;

  const baseClasses =
    "relative block w-full text-left bg-white border p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2";
  const borderClass = selected
    ? "border-heritage ring-2 ring-heritage/40"
    : "border-[var(--rule)]";
  const interactiveClasses = isOverlay
    ? "cursor-grabbing shadow-2xl border-[var(--rule-strong)]"
    : isDragging
      ? "opacity-30 cursor-grabbing"
      : `cursor-grab hover:border-[var(--rule-strong)] hover:bg-ivory ${
          selected ? "scale-[1.02]" : ""
        }`;

  // Apply rotate only on the overlay copy so the moving card looks lifted.
  // The in-place card stays put — the visible drag artifact is the
  // <DragOverlay> rendered on the board.
  const style: CSSProperties | undefined = isOverlay
    ? { transform: "rotate(2deg)" }
    : undefined;

  function stopFromDrag(e: PointerEvent<HTMLInputElement>) {
    // Prevent the dnd-kit pointer sensor from kicking in on checkbox press.
    e.stopPropagation();
  }
  function onCheckboxClick(e: MouseEvent<HTMLInputElement>) {
    e.stopPropagation();
    if (!onToggleSelect) return;
    onToggleSelect(application.id, e.shiftKey);
  }

  return (
    <button
      type="button"
      ref={isOverlay ? undefined : setNodeRef}
      style={style}
      {...(isOverlay ? {} : listeners)}
      {...(isOverlay ? {} : attributes)}
      className={`${baseClasses} ${borderClass} ${interactiveClasses}`}
      aria-roledescription="Draggable application card"
      aria-label={`${cand?.full_name ?? "Anonymous candidate"} — ${days} days in stage`}
      onClick={(e) => {
        // Don't navigate if this click is the tail of a drag attempt — dnd-kit's
        // 5px activation distance means real clicks still come through here.
        if (isDragging || isOverlay) return;
        e.preventDefault();
        router.push(`/employer/applications/${application.id}`);
      }}
    >
      {selectable && !isOverlay && (
        <span
          className="absolute right-2 top-2 inline-flex items-center justify-center"
          // Pointer events stopped here too so a click that hits the wrapper
          // (not the input itself) doesn't initiate a drag.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onPointerDown={stopFromDrag}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={() => {
              /* state advanced via onClick to capture shiftKey */
            }}
            onClick={onCheckboxClick}
            aria-label={`Select ${cand?.full_name ?? "candidate"}`}
            className="h-4 w-4 cursor-pointer accent-heritage focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-1"
          />
        </span>
      )}
      <div className="text-[13px] font-bold text-ink truncate mb-1 pr-6">
        {cand?.full_name ?? "Anonymous candidate"}
      </div>
      <div className="text-[11px] text-slate-body truncate mb-2">
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
    </button>
  );
}
