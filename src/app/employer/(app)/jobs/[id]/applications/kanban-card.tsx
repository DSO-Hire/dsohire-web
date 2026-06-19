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

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDraggable } from "@dnd-kit/core";
import { ArrowRight, MessageCircle, Star } from "lucide-react";
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
} from "react";
import {
  daysInStage,
  stageHeatLevel,
  STAGE_HEAT_CLASSES,
  STAGE_AGE_EDGE_CLASSES,
} from "@/lib/applications/stages";
import { PracticeFitChip } from "@/components/practice-fit/practice-fit-chip";
import { TAG_COLOR_CLASSES } from "@/lib/applications/tags";
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
  /**
   * Lane 5 — hover quick-actions (Message / Scorecards / Advance).
   * `showQuickActions` gates the whole row (closed-lane cards + the
   * drag overlay never get it). `quickAdvance` is the board-supplied
   * move-to-next-stage action riding the SAME runMove path as drag —
   * null when the card already sits in the last forward stage.
   */
  showQuickActions?: boolean;
  quickAdvance?: { run: () => void; title: string } | null;
}

export function KanbanCard({
  application,
  isOverlay = false,
  pending = false,
  selected = false,
  selectable = true,
  onToggleSelect,
  showQuickActions = false,
  quickAdvance,
}: KanbanCardProps) {
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({
    id: application.id,
    data: { type: "application", stageId: application.stage_id, kind: application.kind },
    disabled: pending && !isOverlay,
  });

  // #115 FOH-9 — drop "settle": when `pending` flips true→false the move
  // just confirmed, so the card plays a 400ms scale-down + heritage-ring
  // fade right where it landed. Self-contained (no board threading);
  // reduced-motion users see nothing extra (CSS-gated).
  const wasPendingRef = useRef(false);
  const [settling, setSettling] = useState(false);
  useEffect(() => {
    const was = wasPendingRef.current;
    wasPendingRef.current = pending;
    if (was && !pending && !isOverlay) {
      setSettling(true);
      const t = setTimeout(() => setSettling(false), 450);
      return () => clearTimeout(t);
    }
  }, [pending, isOverlay]);

  const days = daysInStage(application.stage_entered_at);
  const heat = stageHeatLevel(days);
  const heatClasses = STAGE_HEAT_CLASSES[heat];
  // Lane 5 — aging edge: the card's left border warms as it sits
  // (heritage → amber → rust), same level source as the pill below.
  const ageEdgeClass = STAGE_AGE_EDGE_CLASSES[heat];
  const cand = application.candidate;

  // kb-card / kb-card-headline are styling hooks for the Lane 5 board
  // modes (globals.css: .kb-compact tightens padding + hides headlines).
  // `group` powers the hover quick-actions reveal.
  const baseClasses =
    "kb-card group relative block w-full text-left bg-card border p-3 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2";
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
      className={`${baseClasses} ${borderClass} ${ageEdgeClass} ${interactiveClasses} ${
        settling ? "kb-settle" : ""
      }`}
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
      {/* Lane 5 — hover quick-actions. role="button" spans (NOT nested
          <button>s — the HTML parser auto-closes nested buttons, which
          would break SSR hydration; the selection checkbox precedent
          uses the same stopPropagation pattern to stay drag-safe). */}
      {showQuickActions && !isOverlay && !pending && (
        <span
          className="absolute right-8 top-1.5 z-10 flex gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <QuickAction
            title="Message candidate"
            onAct={() =>
              router.push(`/employer/inbox?app=${application.id}`)
            }
          >
            <MessageCircle className="h-3 w-3" />
          </QuickAction>
          <QuickAction
            title="Scorecards"
            onAct={() =>
              router.push(
                `/employer/applications/${application.id}#scorecards`
              )
            }
          >
            <Star className="h-3 w-3" />
          </QuickAction>
          {quickAdvance && (
            <QuickAction title={quickAdvance.title} onAct={quickAdvance.run}>
              <ArrowRight className="h-3 w-3" />
            </QuickAction>
          )}
        </span>
      )}
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
      <div className="text-[14px] font-bold text-ink truncate mb-1 pr-6">
        {cand?.full_name ?? "Anonymous candidate"}
      </div>
      <div className="kb-card-headline text-[12px] text-slate-body truncate mb-2">
        {cand?.current_title || cand?.headline || "Profile minimal"}
      </div>
      {application.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {application.tags.map((tag) => (
            <span
              key={tag.id}
              className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold border ${TAG_COLOR_CLASSES[tag.color]}`}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}
      {application.practiceFit && (
        <div className="mb-2">
          <PracticeFitChip fit={application.practiceFit} size="sm" />
        </div>
      )}
      {/* E2.10 — soft-knockout chip(s). Renders the first 2 failed
          questions truncated; "+N more" overflow when more than 2.
          Amber tint signals "needs review" without screaming reject. */}
      {(application.knockoutFailedQuestions ?? []).length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {(application.knockoutFailedQuestions ?? [])
            .slice(0, 2)
            .map((prompt, idx) => (
              <span
                key={idx}
                title={`Knockout failed: ${prompt}`}
                aria-label={`Knockout failed: ${prompt}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold border border-warning bg-warning-bg text-warning max-w-full"
              >
                <span className="flex-shrink-0">⚠</span>
                <span className="truncate">
                  {prompt.length > 32 ? prompt.slice(0, 30) + "…" : prompt}
                </span>
              </span>
            ))}
          {(application.knockoutFailedQuestions ?? []).length > 2 && (
            <span
              className="text-[10px] font-semibold text-warning/70 tracking-[0.3px]"
              title={`${(application.knockoutFailedQuestions ?? []).length - 2} more knockout failures — see application detail`}
            >
              +{(application.knockoutFailedQuestions ?? []).length - 2} more
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[9px] font-bold tracking-[1px] uppercase px-1.5 py-0.5 ${heatClasses}`}
        >
          {days}d in stage
        </span>
        <div className="flex items-center gap-2">
          {application.scorecard_reviewer_count > 0 &&
            application.scorecard_avg !== null && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] text-heritage-deep font-semibold tabular-nums"
                title={`Average ${application.scorecard_avg.toFixed(1)} across ${application.scorecard_reviewer_count} reviewer${application.scorecard_reviewer_count === 1 ? "" : "s"}`}
                aria-label={`Average score ${application.scorecard_avg.toFixed(1)} across ${application.scorecard_reviewer_count} reviewer${application.scorecard_reviewer_count === 1 ? "" : "s"}`}
              >
                <Star className="h-3 w-3 fill-current" />
                {application.scorecard_avg.toFixed(1)}
                <span className="text-slate-meta font-normal">
                  ({application.scorecard_reviewer_count})
                </span>
              </span>
            )}
          {application.comment_count > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-slate-meta tabular-nums"
              title={`${application.comment_count} team comment${application.comment_count === 1 ? "" : "s"}`}
              aria-label={`${application.comment_count} team comment${application.comment_count === 1 ? "" : "s"}`}
            >
              <MessageCircle className="h-3 w-3" />
              {application.comment_count}
            </span>
          )}
          {cand?.years_experience !== null &&
            cand?.years_experience !== undefined && (
              <span className="text-[10px] text-slate-meta tabular-nums">
                {cand.years_experience}y
              </span>
            )}
        </div>
      </div>
    </button>
  );
}

/**
 * Quick-action chip — a keyboard-operable span (role="button") because
 * real <button>s can't nest inside the draggable card button (HTML
 * parser auto-closes nested buttons → SSR hydration mismatch).
 */
function QuickAction({
  title,
  onAct,
  children,
}: {
  title: string;
  onAct: () => void;
  children: ReactNode;
}) {
  function handleKeyDown(e: KeyboardEvent<HTMLSpanElement>) {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    onAct();
  }
  return (
    <span
      role="button"
      tabIndex={0}
      title={title}
      aria-label={title}
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        e.stopPropagation();
        onAct();
      }}
      className="inline-flex h-[22px] w-[22px] cursor-pointer items-center justify-center border border-[var(--rule-strong)] bg-cream text-slate-body hover:border-heritage hover:bg-heritage/10 hover:text-heritage-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage"
    >
      {children}
    </span>
  );
}
