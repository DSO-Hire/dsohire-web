"use client";

import { useRef } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { useCursor, On } from "../engine";
import { useBeats, animateCount } from "../use-player";
import { Panel, Kicker, FauxButton, SceneTitle, Avatar } from "../atoms";
import { HERO, FIT_PAIRS, FIT_DIMS, FIT_DIMS_MORE, FIT_WHY, FIT_HONESTY } from "../story";
import type { SceneProps } from "./types";

const R = 46;
const C = 2 * Math.PI * R;

export function MatchScene({ active, enhanced, nonce }: SceneProps) {
  const cursor = useCursor();
  const numRef = useRef<HTMLSpanElement>(null);

  const s = useBeats(active, enhanced, nonce, (at) => {
    at(80, null, () => {
      cursor.show();
      cursor.to("match-pairs", { ms: 800, at: [0.5, 0.2] });
    });
    FIT_PAIRS.forEach((_, i) => at(500 + i * 520, i + 1));
    at(2700, 5, () => animateCount(numRef.current, HERO.fit, { duration: 1300 }));
    at(3300, null, () => cursor.to("match-dial", { ms: 700 }));
    at(4100, 6);
    at(5600, null, () => cursor.to("match-advance"));
    at(6350, 7, () => cursor.click());
  });

  const filled = s >= 5;

  return (
    <div className="relative">
      <SceneTitle
        title={
          <span className="inline-flex items-center gap-2.5">
            <Avatar initials={HERO.initials} tone="heritage" size={30} />
            {HERO.name}
          </span>
        }
        sub={`${HERO.role} · ${HERO.city} · applied via Talent Pool`}
        right={
          <FauxButton cur="match-advance" variant="primary" pressed={s >= 7}>
            {s >= 7 ? "Opening pipeline…" : "Move to Interview"}
            <ArrowRight className="size-3.5" />
          </FauxButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        {/* Two sides of data */}
        <Panel className="p-4" data-cur="match-pairs">
          <div className="hidden sm:grid grid-cols-[1fr_auto_1fr] gap-x-3 mb-2">
            <Kicker>Her assessment</Kicker>
            <span />
            <Kicker className="text-right">Your practice profile</Kicker>
          </div>
          <div className="grid gap-1.5">
            {FIT_PAIRS.map((p, i) => {
              const on = s >= i + 1;
              return (
                <div key={p.dim} className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
                  <On on={on} className="bx-from-left border border-[var(--rule)] bg-ivory/70 px-2.5 py-2 text-xs font-semibold text-ink sm:truncate">
                    {p.candidate}
                  </On>
                  <div className="relative col-span-2 order-first sm:order-none sm:col-span-1 flex flex-col items-start sm:items-center sm:w-[92px]">
                    <span className="text-2xs font-bold uppercase tracking-[0.9px] text-slate-meta whitespace-nowrap">
                      {p.dim}
                    </span>
                    <span className="relative mt-1 h-[2px] w-full bg-ink/10 overflow-hidden hidden sm:block">
                      <span
                        className={cn(
                          "absolute inset-y-0 left-1/2 bg-heritage transition-[width,left] duration-500 ease-out",
                          on ? "left-0 w-full" : "w-0"
                        )}
                        style={{ transitionDelay: on ? "220ms" : "0ms" }}
                      />
                    </span>
                    <span
                      className={cn(
                        "absolute right-0 top-0 sm:right-auto sm:top-auto sm:-bottom-2 grid place-items-center size-4 bg-heritage text-ivory transition-transform duration-300",
                        on ? "scale-100" : "scale-0"
                      )}
                      style={{ transitionDelay: on ? "560ms" : "0ms", transitionTimingFunction: "var(--spring)" }}
                    >
                      <Check className="size-2.5" strokeWidth={4} />
                    </span>
                  </div>
                  <On on={on} delay={120} className="bx-from-right border border-[var(--rule)] bg-ivory/70 px-2.5 py-2 text-xs font-semibold text-ink text-right sm:truncate">
                    {p.practice}
                  </On>
                </div>
              );
            })}
          </div>
          <div className="mt-4 text-2xs text-slate-meta">{FIT_HONESTY}</div>
        </Panel>

        {/* The score */}
        <Panel className="p-4 flex flex-col" data-cur="match-dial">
          <div className="flex items-center gap-4">
            <div className="relative size-[112px] shrink-0">
              <svg viewBox="0 0 112 112" className="size-full -rotate-90">
                <circle cx="56" cy="56" r={R} fill="none" strokeWidth="9" className="stroke-ink/[0.08]" />
                <circle
                  cx="56"
                  cy="56"
                  r={R}
                  fill="none"
                  strokeWidth="9"
                  strokeLinecap="butt"
                  className="stroke-heritage bx-dial"
                  style={{
                    strokeDasharray: C,
                    strokeDashoffset: filled ? C * (1 - HERO.fit / 100) : C,
                  }}
                />
              </svg>
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <span ref={numRef} className={cn("block text-3xl font-extrabold tracking-[-0.04em] text-ink tabular transition-opacity", filled ? "opacity-100" : "opacity-20")}>
                    {HERO.fit}
                  </span>
                </div>
              </div>
            </div>
            <div className="min-w-0">
              <PracticeFitWordmark surface="light" tm className="text-sm" />
              <On on={s >= 5} delay={300} className="text-lg font-extrabold text-ink mt-1 leading-tight">
                Excellent fit
              </On>
              <On on={s >= 5} delay={420} className="text-2xs text-slate-body mt-1 leading-snug">
                {FIT_WHY}
              </On>
            </div>
          </div>
          <div className="mt-4 border-t border-[var(--rule)] pt-3">
            <Kicker className="mb-2">Weighted dimensions</Kicker>
            <div className="flex flex-wrap gap-1.5">
              {FIT_DIMS.map((d, i) => (
                <span
                  key={d.label}
                  className={cn(
                    "px-2 py-1 text-2xs font-bold border transition-all duration-300",
                    s >= 6 ? "border-heritage/50 bg-heritage/10 text-heritage-deep" : "border-[var(--rule)] text-slate-meta"
                  )}
                  style={{ transitionDelay: s >= 6 ? `${i * 90}ms` : "0ms" }}
                >
                  {d.label} · <span className="tabular">{d.weight}</span>
                </span>
              ))}
              <span className="px-1 py-1 text-2xs font-bold text-slate-meta">{FIT_DIMS_MORE}</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
