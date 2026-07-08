"use client";

/**
 * CH3 — PracticeFit™: one score, two sides of data (rebuilt 2026-07-08
 * after Cam's truthfulness review — the first cut showed two facing meters
 * "scoring each other," which is NOT how the product works).
 *
 * The real model (lib/practice-fit/compute.ts + track.ts): ONE engine
 * scores a candidate↔job pair from both sides' DECLARED data — the
 * candidate's PracticeFit assessment on the left, the practice's profile
 * on the right, pairing dimension by dimension into a single score.
 * Unanswered dimensions drop out of the denominator (nothing guessed).
 * DSOFit is the corporate track of the same engine (per-function weights),
 * shown as the closing band — practice-level and corporate roles never
 * cross-score.
 *
 * Uses the REAL trademarked lockups (PracticeFitWordmark / DsoFitWordmark).
 * Choreography: answer rows pair up one by one (both sides highlight),
 * the meter counts to 94, then the real v8 dimension-weight chips settle in.
 */

import { useRef, useState } from "react";
import { PracticeFitWordmark } from "@/components/practice-fit/brand/practice-fit-wordmark";
import { DsoFitWordmark } from "@/components/practice-fit/brand/dsofit-wordmark";
import {
  FIT_PAIRS,
  FIT_SCORE,
  FIT_DIM_CHIPS,
  FIT_DIM_MORE,
  FIT_HONESTY_NOTE,
  DSOFIT_NOTE,
} from "../track";
import { useCue, animateCount } from "../use-player";

const EASE = { transitionTimingFunction: "cubic-bezier(0.22,1,0.36,1)" };

export function TwoSidedChapter({
  active,
  enhanced,
  nonce,
}: {
  active: boolean;
  enhanced: boolean;
  nonce: number;
}) {
  // SSR / reduced-motion final state: everything paired + settled.
  const [paired, setPaired] = useState(FIT_PAIRS.length);
  const [scored, setScored] = useState(true);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const numRef = useRef<HTMLSpanElement | null>(null);

  useCue(active && enhanced, nonce, (cue) => {
    setPaired(0);
    setScored(false);
    meterRef.current?.style.setProperty("--deg", "0deg");
    if (numRef.current) numRef.current.textContent = "0";
    const cancels: Array<() => void> = [];
    FIT_PAIRS.forEach((_, i) => cue(500 + i * 550, () => setPaired(i + 1)));
    cue(500 + FIT_PAIRS.length * 550 + 250, () => {
      cancels.push(
        animateCount(numRef.current, FIT_SCORE, {
          duration: 1100,
          onFrame: (v) => meterRef.current?.style.setProperty("--deg", `${v * 3.6}deg`),
        })
      );
    });
    cue(500 + FIT_PAIRS.length * 550 + 1200, () => setScored(true));
    return () => cancels.forEach((c) => c());
  });

  return (
    <div>
      {/* Scene head — the real trademarked lockup, not plain text. */}
      <div className="flex items-center justify-between gap-3 mb-3.5 flex-wrap">
        <div className="flex items-baseline gap-2 flex-wrap min-w-0">
          <PracticeFitWordmark tm className="text-base" />
          <span className="text-sm font-extrabold tracking-[-0.2px] min-w-0">
            — one score, two sides of data
          </span>
        </div>
        <span
          className="text-2xs font-extrabold tracking-[1.2px] uppercase px-2 py-1 text-heritage-deep whitespace-nowrap"
          style={{ background: "rgba(77,122,96,0.12)" }}
        >
          5-min assessment
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-3 lg:gap-4 items-center">
        {/* Candidate side — her assessment answers. */}
        <SideCard
          title="Dr. Chen's assessment"
          sub="What she told PracticeFit"
          side="candidate"
          paired={paired}
        />

        {/* The single score — one engine, one number. */}
        <div className="justify-self-center">
          <div
            ref={meterRef}
            className="relative w-[132px] h-[132px] rounded-full grid place-items-center"
            style={
              {
                "--deg": `${FIT_SCORE * 3.6}deg`,
                background: "conic-gradient(var(--heritage) var(--deg), #e7e2d5 0)",
              } as React.CSSProperties
            }
          >
            <div className="absolute inset-[11px] rounded-full bg-cream" aria-hidden />
            <div className="relative z-[1] text-center">
              <span ref={numRef} className="block text-4xl font-extrabold tabular leading-none">
                {FIT_SCORE}
              </span>
              <span className="mt-1 flex justify-center">
                <PracticeFitWordmark className="text-2xs" />
              </span>
            </div>
          </div>
        </div>

        {/* Practice side — the profile + posting. */}
        <SideCard
          title="The practice's profile"
          sub="What the posting declares"
          side="practice"
          paired={paired}
        />
      </div>

      {/* Real v8 dimension weights. */}
      <div
        className={`flex flex-wrap items-center justify-center gap-1.5 mt-4 transition-opacity duration-[450ms] ${
          scored ? "opacity-100" : "opacity-0"
        }`}
        style={EASE}
      >
        {FIT_DIM_CHIPS.map((d) => (
          <span
            key={d.label}
            className="text-2xs font-semibold text-slate-body bg-card border border-[var(--rule)] px-2 py-0.5"
          >
            {d.label} · {d.weight}
          </span>
        ))}
        <span className="text-2xs font-semibold text-slate-meta px-1">{FIT_DIM_MORE}</span>
      </div>
      <div
        className={`text-2xs text-slate-meta text-center mt-2 transition-opacity duration-[450ms] ${
          scored ? "opacity-100" : "opacity-0"
        }`}
      >
        {FIT_HONESTY_NOTE}
      </div>

      {/* DSOFit — the corporate track of the same engine. */}
      <div
        className={`mt-4 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 border-t border-dashed border-[var(--rule-strong)] pt-3 transition-opacity duration-[450ms] ${
          scored ? "opacity-100" : "opacity-0"
        }`}
      >
        <DsoFitWordmark tm className="text-sm shrink-0" />
        <span className="text-2xs text-slate-body leading-relaxed">{DSOFIT_NOTE}</span>
      </div>
    </div>
  );
}

function SideCard({
  title,
  sub,
  side,
  paired,
}: {
  title: string;
  sub: string;
  side: "candidate" | "practice";
  paired: number;
}) {
  return (
    <div className="bg-card border border-[var(--rule)] p-3 min-w-0">
      <div className="text-xs font-extrabold">{title}</div>
      <div className="text-2xs text-slate-meta mt-0.5 mb-2">{sub}</div>
      {FIT_PAIRS.map((p, i) => {
        const on = paired > i;
        return (
          <div
            key={p.dim}
            className={`flex items-center justify-between gap-2 border-l-2 px-2 py-1.5 mb-1 transition-all duration-[400ms] ${
              on
                ? "border-l-heritage bg-heritage/[0.06] opacity-100"
                : "border-l-transparent opacity-40"
            }`}
            style={EASE}
          >
            <span className="text-2xs font-bold uppercase tracking-[0.5px] text-slate-meta shrink-0">
              {p.dim}
            </span>
            <span className="text-2xs font-semibold text-right break-words min-w-0">
              {side === "candidate" ? p.candidate : p.practice}
            </span>
          </div>
        );
      })}
    </div>
  );
}
