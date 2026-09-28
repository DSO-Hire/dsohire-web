"use client";

import { useRef } from "react";
import { CalendarCheck, Zap, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCursor } from "../engine";
import { useBeats } from "../use-player";
import { Toast, SceneTitle, Avatar, FitBadge, LivePill } from "../atoms";
import { KANBAN, AUTOMATION, BOOKED, type KbCard } from "../story";
import type { SceneProps } from "./types";

const DRAG_MS = 920;
const GLIDE = "cubic-bezier(0.45, 0.05, 0.2, 1.04)";

export function PipelineScene({ active, enhanced, nonce }: SceneProps) {
  const cursor = useCursor();
  const dragRef = useRef<HTMLDivElement>(null);

  const s = useBeats(active, enhanced, nonce, (at) => {
    at(0, null, () => {
      // A mid-drag jump away and back must not leave the card offset.
      if (dragRef.current) {
        dragRef.current.style.transition = "";
        dragRef.current.style.transform = "";
      }
    });
    at(80, null, () => {
      cursor.show();
      cursor.to("kb-hero", { ms: 750 });
    });
    at(900, 1);
    at(1350, 2, () => cursor.down());
    at(1750, 3, () => {
      const root = cursor.root();
      const card = dragRef.current;
      const drop = root?.querySelector<HTMLElement>('[data-cur="kb-drop"]');
      if (!card || !drop) return;
      const a = card.getBoundingClientRect();
      const b = drop.getBoundingClientRect();
      card.style.transition = `transform ${DRAG_MS}ms ${GLIDE}`;
      card.style.transform = `translate3d(${b.left - a.left}px, ${b.top - a.top}px, 0) rotate(-2.5deg) scale(1.04)`;
      cursor.to("kb-drop", { ms: DRAG_MS });
    });
    at(1750 + DRAG_MS + 40, 4, () => cursor.up());
    at(3200, null, () => cursor.to("kb-head", { ms: 900, at: [0.85, 0.5] }));
    at(3400, 5);
    at(5000, 6);
  });

  const moved = s >= 4;

  const columns = KANBAN.map((col) => {
    let cards = col.cards;
    let count = col.count;
    if (col.key === "screen" && moved) {
      cards = cards.filter((c) => c.id !== "hero");
      count -= 1;
    }
    if (col.key === "interview" && moved) {
      const hero = KANBAN[1].cards.find((c) => c.id === "hero")!;
      cards = [hero, ...cards];
      count += 1;
    }
    return { ...col, cards, count };
  });

  return (
    <div className="relative">
      <SceneTitle
        title="Pipeline HQ"
        sub="Every practice, every role · realtime"
        right={
          <div data-cur="kb-head" className="flex items-center gap-2">
            <div className="flex -space-x-1.5">
              <Avatar initials="MA" tone="slate" size={24} />
              <Avatar initials="JR" tone="ink" size={24} />
            </div>
            <LivePill>2 teammates live</LivePill>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              "min-w-0 bg-ink/[0.035] border border-[var(--rule)] p-2 min-h-[300px]",
              (col.key === "open" || col.key === "offer") && "hidden sm:block"
            )}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-2xs font-extrabold uppercase tracking-[1.2px] text-ink">
                {col.label}
              </span>
              <span
                key={col.count}
                className={cn(
                  "bx-count px-1.5 text-2xs font-bold tabular bg-card border border-[var(--rule)] text-slate-body",
                  moved && (col.key === "screen" || col.key === "interview") && "is-tick"
                )}
              >
                {col.count}
              </span>
            </div>

            <div className="grid gap-2">
              {col.key === "interview" && s >= 2 && s < 4 && (
                <div
                  data-cur="kb-drop"
                  className="bx-drop h-[74px] border-2 border-dashed border-heritage/60 bg-heritage/[0.06]"
                />
              )}
              {col.cards.map((card) => {
                const isHero = card.id === "hero";
                const inScreen = col.key === "screen";
                return (
                  <KanbanCard
                    key={`${col.key}-${card.id}`}
                    card={card}
                    ref={isHero && inScreen ? dragRef : undefined}
                    cur={isHero && inScreen ? "kb-hero" : undefined}
                    hover={isHero && inScreen && s === 1}
                    lifted={isHero && inScreen && (s === 2 || s === 3)}
                    landed={isHero && !inScreen && enhanced}
                    booked={isHero && !inScreen && s >= 6}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <Toast
        on={s >= 5}
        className="right-3 bottom-3"
        icon={<Zap className="size-4" />}
        kicker={AUTOMATION.kicker}
        title={AUTOMATION.title}
        sub={AUTOMATION.sub}
      />
    </div>
  );
}

function KanbanCard({
  card,
  ref,
  cur,
  hover,
  lifted,
  landed,
  booked,
}: {
  card: KbCard;
  ref?: React.Ref<HTMLDivElement>;
  cur?: string;
  hover?: boolean;
  lifted?: boolean;
  landed?: boolean;
  booked?: boolean;
}) {
  const isHero = card.id === "hero";
  return (
    <div
      ref={ref}
      data-cur={cur}
      className={cn(
        "relative bg-card border p-2.5 will-change-transform",
        isHero ? "border-heritage/60" : "border-[var(--rule)]",
        hover && "shadow-[0_0_0_3px_rgba(77,122,96,0.2)]",
        lifted && "bx-lifted z-20",
        landed && "bx-landed"
      )}
    >
      <div className="min-w-0">
        <div className={cn("text-xs font-bold truncate", card.masked ? "italic text-slate-body" : "text-ink")}>
          {card.name}
        </div>
        <div className="text-2xs text-slate-meta truncate">{card.role}</div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-2xs text-slate-meta">
        <FitBadge fit={card.fit} strong={isHero} />
        <span className="tabular">{card.days}d</span>
        {isHero && (
          <span className="inline-flex items-center gap-0.5">
            <MessageSquare className="size-3" /> 2
          </span>
        )}
        {card.masked && <span className="hidden sm:inline font-semibold text-heritage-deep">anonymous</span>}
      </div>
      {booked && (
        <div className="bx-chip-in mt-2 inline-flex max-w-full items-start gap-1 bg-heritage px-1.5 py-1 text-2xs font-bold text-ivory">
          <CalendarCheck className="size-3" /> {BOOKED}
        </div>
      )}
    </div>
  );
}
