"use client";

/**
 * CH1 — Pipeline → Automation (the causal hero).
 *
 * One gesture shows the section's whole thesis: drag Dr. Sarah Chen
 * (Fit 94) Screening → Interview and the cascade fires — counts tick,
 * the Realtime pill pulses, the masked neighbor STAYS masked, and the
 * automation toast lands ("stage → Interview ⇒ interview-prep email +
 * calendar link, practice-masked sender"). That toast maps to the LIVE
 * application.stage_changed → email_candidate path (automations Phase 1).
 *
 * Interactions (all equivalent):
 *   • real pointer/touch drag (@dnd-kit, 4px activation)
 *   • the "Advance →" button on the card (keyboard/click + autoplay path,
 *     with a WAAPI flight animation)
 *   • autoplay fires the same flight after ~2.6s if the visitor doesn't
 *
 * SSR/no-JS/reduced-motion: renders the FINAL state (Sarah in Interview,
 * toast visible) — full content, no motion, no layout shift.
 */

import { useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Eyebrow } from "@/components/brand/eyebrow";
import { SceneHead, DemoKbCard, FitChip } from "../ui";
import { KANBAN_COLUMNS, AUTOMATION_TOAST, type DemoCard } from "../track";
import { useCue } from "../use-player";

const SARAH = KANBAN_COLUMNS[1].cards[0];

type Phase = "rest" | "moved" | "toast";

export function PipelineChapter({
  active,
  enhanced,
  nonce,
}: {
  active: boolean;
  enhanced: boolean;
  nonce: number;
}) {
  // SSR + reduced-motion resting state = the cascade's END state.
  const [phase, setPhase] = useState<Phase>("toast");
  const [bumped, setBumped] = useState(false);
  const firedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sarahRef = useRef<HTMLDivElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);

  const moved = phase !== "rest";

  /** Commit the move + run the downstream cascade (counts/pill/toast). */
  const commit = () => {
    setPhase("moved");
    setBumped(true);
    window.setTimeout(() => setBumped(false), 450);
    window.setTimeout(() => setPhase("toast"), 600);
  };

  /** Animated path (click/keyboard/autoplay): fly a clone, then commit. */
  const fly = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    const src = sarahRef.current;
    const dst = dropRef.current;
    const host = stageRef.current;
    if (!src || !dst || !host) {
      commit();
      return;
    }
    const s = src.getBoundingClientRect();
    const d = dst.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    const clone = src.cloneNode(true) as HTMLElement;
    clone.style.cssText = `position:absolute;z-index:20;margin:0;left:${s.left - h.left}px;top:${s.top - h.top}px;width:${s.width}px;pointer-events:none;`;
    host.appendChild(clone);
    src.style.visibility = "hidden";
    clone.animate(
      [
        { transform: "translate(0,0) rotate(0deg)" },
        {
          transform: `translate(${d.left - s.left}px, ${d.top - s.top}px) rotate(-1.5deg)`,
        },
      ],
      { duration: 750, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }
    ).finished.then(() => {
      clone.remove();
      commit();
    });
  };

  /** Real-drag path: dnd-kit already moved it visually — commit directly. */
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over?.id === "interview" && !firedRef.current) {
      firedRef.current = true;
      commit();
    }
  };

  useCue(active && enhanced, nonce, (cue) => {
    // Reset to the start state, then auto-fire if the visitor doesn't.
    firedRef.current = false;
    setPhase("rest");
    setBumped(false);
    if (sarahRef.current) sarahRef.current.style.visibility = "";
    cue(2600, fly);
  });

  const screenCol = KANBAN_COLUMNS[1];
  const interviewCol = KANBAN_COLUMNS[2];

  return (
    <div ref={stageRef} className="relative">
      <SceneHead
        title="Pipeline — every practice, every role"
        pill="Realtime"
        pulsing={phase !== "rest"}
      />
      <DndContext
        sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* New */}
          <Column label={KANBAN_COLUMNS[0].label} count={KANBAN_COLUMNS[0].count}>
            {KANBAN_COLUMNS[0].cards.map((c) => (
              <DemoKbCard key={c.id} card={c} />
            ))}
          </Column>

          {/* Screening */}
          <Column
            label={screenCol.label}
            count={moved ? screenCol.count - 1 : screenCol.count}
            bumped={bumped}
          >
            {!moved && (
              <DraggableSarah cardRef={sarahRef} draggable={active && enhanced} onAdvance={fly} />
            )}
            <DemoKbCard card={screenCol.cards[1]} />
          </Column>

          {/* Interview */}
          <InterviewColumn
            label={interviewCol.label}
            count={moved ? interviewCol.count + 1 : interviewCol.count}
            bumped={bumped}
            dropEnabled={active && enhanced && !moved}
          >
            {interviewCol.cards.map((c) => (
              <DemoKbCard key={c.id} card={c} />
            ))}
            {/* Landing slot — flight target + where Sarah renders once moved. */}
            <div ref={dropRef}>
              {moved && <DemoKbCard card={SARAH} highlight />}
            </div>
          </InterviewColumn>

          {/* Offer */}
          <Column label={KANBAN_COLUMNS[3].label} count={KANBAN_COLUMNS[3].count}>
            {KANBAN_COLUMNS[3].cards.map((c) => (
              <DemoKbCard key={c.id} card={c} />
            ))}
          </Column>
        </div>
      </DndContext>

      {/* Automation toast — maps to the LIVE stage_changed → email_candidate
          rule. In-flow below the board on phones (an overlay covers cards at
          2-col width — Cam's mobile review); floats bottom-right at sm+. */}
      <div
        role="status"
        className={`mt-3 w-full sm:mt-0 sm:w-[290px] sm:max-w-[85%] sm:absolute sm:right-3 sm:bottom-2 bg-hero text-hero-foreground border-l-[3px] border-l-heritage-bright px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.35)] transition-all duration-500 z-10 ${
          phase === "toast"
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-[18px] pointer-events-none max-sm:hidden"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" }}
      >
        <div className="flex items-center gap-1.5 text-2xs font-extrabold tracking-[1.4px] uppercase text-heritage-bright mb-1">
          <span aria-hidden className={phase === "toast" ? "bo-spark inline-block" : ""}>
            ⚡
          </span>
          {AUTOMATION_TOAST.kicker}
        </div>
        <div className="text-xs font-bold leading-snug">{AUTOMATION_TOAST.title}</div>
        <div className="text-2xs text-hero-foreground/70 mt-1">{AUTOMATION_TOAST.sub}</div>
      </div>
    </div>
  );
}

function Column({
  label,
  count,
  bumped,
  children,
}: {
  label: string;
  count: number;
  bumped?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <ColHead label={label} count={count} bumped={bumped} />
      {children}
    </div>
  );
}

function InterviewColumn({
  label,
  count,
  bumped,
  dropEnabled,
  children,
}: {
  label: string;
  count: number;
  bumped?: boolean;
  dropEnabled: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "interview", disabled: !dropEnabled });
  return (
    <div
      ref={setNodeRef}
      className={`transition-colors duration-200 ${
        isOver ? "bg-heritage/[0.07] outline outline-1 outline-heritage-bright/60" : ""
      }`}
    >
      <ColHead label={label} count={count} bumped={bumped} />
      {children}
    </div>
  );
}

function ColHead({
  label,
  count,
  bumped,
}: {
  label: string;
  count: number;
  bumped?: boolean;
}) {
  return (
    <Eyebrow className="flex items-center justify-between text-2xs tracking-[1.2px] mb-2">
      <span>{label}</span>
      <span
        className={`tabular px-1.5 py-px transition-all duration-300 ${
          bumped ? "bg-heritage-bright text-hero scale-[1.18]" : "bg-ivory-deep text-slate-body"
        }`}
      >
        {count}
      </span>
    </Eyebrow>
  );
}

function DraggableSarah({
  cardRef,
  draggable,
  onAdvance,
}: {
  cardRef: React.MutableRefObject<HTMLDivElement | null>;
  draggable: boolean;
  onAdvance: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: "sarah",
    disabled: !draggable,
  });
  const card: DemoCard = SARAH;
  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        cardRef.current = el;
      }}
      {...listeners}
      {...attributes}
      className={`bg-card border border-heritage-bright shadow-[0_0_0_2px_rgba(141,184,163,0.5)] p-2.5 mb-2 touch-none ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "z-30 relative shadow-xl" : ""}`}
      style={
        transform
          ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
          : undefined
      }
    >
      <div className="text-xs font-bold">{card.name}</div>
      <div className="text-2xs text-slate-meta mt-0.5 mb-1.5">{card.role}</div>
      <div className="flex items-center justify-between gap-1.5">
        <FitChip fit={card.fit} />
        <button
          type="button"
          onClick={onAdvance}
          className="text-2xs font-bold tracking-[0.6px] uppercase text-heritage-deep hover:text-heritage transition-colors"
          aria-label="Advance Dr. Sarah Chen to Interview"
        >
          Advance →
        </button>
      </div>
    </div>
  );
}
