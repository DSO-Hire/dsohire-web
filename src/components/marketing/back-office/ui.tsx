/**
 * Back-office showcase — shared presentational atoms.
 *
 * These are drawn-UI twins of product components that are server-coupled in
 * the real app (Kanban card, stage columns). Labels/types come from the
 * source-of-truth modules via track.ts — only the markup is twinned here.
 * FrameChrome is carried over from the retired film-strip.
 */

import type { DemoCard } from "./track";

export function FrameChrome({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-ink-1000 border border-hero-foreground/15 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.55)]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hero-foreground/10">
        <span className="w-2 h-2 rounded-full bg-ivory/20" aria-hidden />
        <span className="w-2 h-2 rounded-full bg-ivory/20" aria-hidden />
        <span className="w-2 h-2 rounded-full bg-ivory/20" aria-hidden />
        <span className="ml-2 text-2xs tracking-[0.6px] text-hero-foreground/45 bg-hero-foreground/5 px-2.5 py-0.5">
          {url}
        </span>
      </div>
      <div className="relative bg-ivory text-ink min-h-[420px] p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function SceneHead({
  title,
  pill,
  pulsing,
}: {
  title: string;
  pill: string;
  pulsing?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3.5">
      <div className="text-sm font-extrabold tracking-[-0.2px]">{title}</div>
      <span
        className="inline-flex items-center gap-1.5 text-2xs font-extrabold tracking-[1.2px] uppercase px-2 py-1 text-heritage-deep whitespace-nowrap"
        style={{ background: "rgba(77,122,96,0.12)" }}
      >
        {pulsing !== undefined && (
          <span
            aria-hidden
            className={`w-[7px] h-[7px] rounded-full bg-heritage ${pulsing ? "bo-rt" : ""}`}
          />
        )}
        {pill}
      </span>
    </div>
  );
}

export function FitChip({ fit }: { fit: number }) {
  return (
    <span
      className="inline-block text-2xs font-bold px-1.5 py-0.5 text-heritage-deep"
      style={{ background: "rgba(77,122,96,0.12)" }}
    >
      Fit {fit}
    </span>
  );
}

export function DemoKbCard({
  card,
  highlight,
  children,
}: {
  card: DemoCard;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`bg-card border p-2.5 mb-2 transition-shadow duration-300 ${
        highlight
          ? "border-heritage-bright shadow-[0_0_0_2px_rgba(141,184,163,0.45)]"
          : "border-[var(--rule)]"
      }`}
    >
      <div
        className={`text-xs font-bold ${card.masked ? "italic text-slate-body" : ""}`}
      >
        {card.name}
      </div>
      <div className="text-2xs text-slate-meta mt-0.5 mb-1.5">
        {card.role}
        {card.masked && (
          <>
            {" · "}
            <span className="text-heritage-deep font-semibold">anonymous</span>
          </>
        )}
      </div>
      <FitChip fit={card.fit} />
      {children}
    </div>
  );
}
