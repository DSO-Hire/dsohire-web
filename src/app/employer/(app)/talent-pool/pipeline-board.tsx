"use client";

/**
 * Prospect pipeline board (Sourcing CRM — Phase 1) — kanban-lite.
 *
 * Deliberately lighter than the applications kanban (no bulk-select, heat pills,
 * or realtime — per the UI-density finding): columns by stage, masked-aware
 * cards, drag to move. Applied prospects are terminal ("Converted") and not
 * draggable. Moves persist optimistically via moveProspectStage.
 */

import { useMemo, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Lock, StickyNote, CheckCircle2 } from "lucide-react";
import {
  PROSPECT_BOARD_STAGES,
  PROSPECT_STAGE_LABELS,
  PROSPECT_STAGE_ACCENT,
  type ProspectCard,
  type ProspectStage,
} from "@/lib/sourcing/pipeline";
import { moveProspectStage } from "./pipeline-actions";

export function PipelineBoard({ initial }: { initial: ProspectCard[] }) {
  const [cards, setCards] = useState<ProspectCard[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const byStage = useMemo(() => {
    const map = new Map<ProspectStage, ProspectCard[]>();
    for (const s of PROSPECT_BOARD_STAGES) map.set(s, []);
    for (const c of cards) {
      if (!map.has(c.stage)) continue; // archived → off-board
      map.get(c.stage)!.push(c);
    }
    return map;
  }, [cards]);

  const activeCard = activeId
    ? cards.find((c) => c.entryId === activeId) ?? null
    : null;

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const entryId = String(active.id);
    const toStage = String(over.id) as ProspectStage;
    const card = cards.find((c) => c.entryId === entryId);
    if (!card || card.stage === toStage || card.applied) return;

    const prevStage = card.stage;
    setError(null);
    setCards((prev) =>
      prev.map((c) => (c.entryId === entryId ? { ...c, stage: toStage } : c)),
    );
    startTransition(async () => {
      const res = await moveProspectStage(entryId, toStage);
      if (!res.ok) {
        setCards((prev) =>
          prev.map((c) =>
            c.entryId === entryId ? { ...c, stage: prevStage } : c,
          ),
        );
        setError(res.error ?? "Couldn't move the prospect.");
      }
    });
  }

  return (
    <div>
      {error && (
        <div className="mb-3 text-[12px] text-danger">{error}</div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {PROSPECT_BOARD_STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              cards={byStage.get(stage) ?? []}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? <Card card={activeCard} overlay /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  stage,
  cards,
}: {
  stage: ProspectStage;
  cards: ProspectCard[];
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={
        "rounded-lg border bg-cream/30 p-2 min-h-[120px] transition-colors " +
        (isOver ? "border-heritage-deep bg-cream/60" : "border-[var(--rule)]")
      }
    >
      <div className="flex items-center justify-between px-1 py-1.5 mb-1">
        <span
          className={
            "text-[10px] font-bold tracking-[1.5px] uppercase " +
            PROSPECT_STAGE_ACCENT[stage]
          }
        >
          {PROSPECT_STAGE_LABELS[stage]}
        </span>
        <span className="text-[11px] text-slate-meta">{cards.length}</span>
      </div>
      <div className="space-y-2">
        {cards.map((c) => (
          <DraggableCard key={c.entryId} card={c} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ card }: { card: ProspectCard }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.entryId,
    disabled: card.applied,
  });
  return (
    <div
      ref={setNodeRef}
      {...(card.applied ? {} : listeners)}
      {...attributes}
      className={isDragging ? "opacity-30" : ""}
    >
      <Card card={card} />
    </div>
  );
}

function Card({ card, overlay }: { card: ProspectCard; overlay?: boolean }) {
  return (
    <div
      className={
        "rounded-md border border-[var(--rule)] bg-card p-3 text-left " +
        (card.applied ? "cursor-default" : "cursor-grab active:cursor-grabbing") +
        (overlay ? " shadow-lg" : "")
      }
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[13px] font-semibold text-ink truncate">
              {card.displayName}
            </p>
            {card.masked && (
              <Lock
                className="h-3 w-3 text-slate-meta flex-shrink-0"
                aria-label="Anonymous candidate"
              />
            )}
          </div>
          {(card.currentTitle || card.headline) && (
            <p className="text-[11px] text-slate-body truncate mt-0.5">
              {card.currentTitle ?? card.headline}
            </p>
          )}
          <p className="text-[11px] text-slate-meta mt-0.5">
            {[
              card.location,
              card.yearsExperience != null
                ? `${card.yearsExperience} yrs`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {card.applied && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <CheckCircle2 className="h-3 w-3" /> Applied
          </span>
        )}
        {card.hasNotes && (
          <StickyNote className="h-3 w-3 text-slate-meta" aria-label="Has notes" />
        )}
        {card.tags?.slice(0, 2).map((t) => (
          <span
            key={t}
            className="rounded-full bg-cream px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.5px] text-slate-body"
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
