"use client";

/**
 * CH3 — Two-sided fit. PracticeFit (employer → candidate) and DSOFit
 * (candidate → practice) meters facing each other, counting up together,
 * then a "mutual match" highlight. Dimension weights shown under the
 * PracticeFit meter mirror lib/practice-fit/compute.ts (see track.ts).
 */

import { useRef, useState } from "react";
import { SceneHead } from "../ui";
import { TWO_SIDED, FIT_DIMENSIONS } from "../track";
import { useCue, animateCount } from "../use-player";

export function TwoSidedChapter({
  active,
  enhanced,
  nonce,
}: {
  active: boolean;
  enhanced: boolean;
  nonce: number;
}) {
  const [matched, setMatched] = useState(true); // SSR final state
  const pMeter = useRef<HTMLDivElement | null>(null);
  const dMeter = useRef<HTMLDivElement | null>(null);
  const pNum = useRef<HTMLSpanElement | null>(null);
  const dNum = useRef<HTMLSpanElement | null>(null);

  useCue(active && enhanced, nonce, (cue) => {
    setMatched(false);
    pMeter.current?.style.setProperty("--deg", "0deg");
    dMeter.current?.style.setProperty("--deg", "0deg");
    if (pNum.current) pNum.current.textContent = "0";
    if (dNum.current) dNum.current.textContent = "0";
    const cancels: Array<() => void> = [];
    cue(400, () => {
      cancels.push(
        animateCount(pNum.current, TWO_SIDED.practiceFit, {
          duration: 1100,
          onFrame: (v) => pMeter.current?.style.setProperty("--deg", `${v * 3.6}deg`),
        })
      );
    });
    cue(700, () => {
      cancels.push(
        animateCount(dNum.current, TWO_SIDED.dsoFit, {
          duration: 1100,
          onFrame: (v) => dMeter.current?.style.setProperty("--deg", `${v * 3.6}deg`),
        })
      );
    });
    cue(2100, () => setMatched(true));
    return () => cancels.forEach((c) => c());
  });

  return (
    <div>
      <SceneHead title="Two-sided fit — it runs both directions" pill="PracticeFit × DSOFit" />
      <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-8 pt-2">
        <div>
          <Meter
            meterRef={pMeter}
            numRef={pNum}
            value={TWO_SIDED.practiceFit}
            label="PracticeFit"
          />
          <div className="text-2xs text-slate-body text-center mt-2 max-w-[180px] mx-auto">
            {TWO_SIDED.leftCaption}
          </div>
        </div>
        <div className="text-center" aria-hidden>
          <div
            className={`text-2xl transition-all duration-[400ms] ${
              matched ? "scale-100 opacity-100" : "scale-75 opacity-40"
            }`}
          >
            🤝
          </div>
          <div
            className={`text-2xs font-extrabold tracking-[1.4px] uppercase transition-colors duration-[400ms] ${
              matched ? "text-heritage-deep" : "text-slate-meta"
            }`}
          >
            {matched ? "mutual match" : "mutual"}
          </div>
        </div>
        <div>
          <Meter meterRef={dMeter} numRef={dNum} value={TWO_SIDED.dsoFit} label="DSOFit" />
          <div className="text-2xs text-slate-body text-center mt-2 max-w-[180px] mx-auto">
            {TWO_SIDED.rightCaption}
          </div>
        </div>
      </div>
      {/* Real scoring dimensions (weights mirror practice-fit/compute.ts). */}
      <div className="flex flex-wrap justify-center gap-1.5 mt-4">
        {FIT_DIMENSIONS.map((d) => (
          <span
            key={d.label}
            className="text-2xs font-semibold text-slate-body bg-card border border-[var(--rule)] px-2 py-0.5"
          >
            {d.label} · {d.weight}
          </span>
        ))}
        <span className="text-2xs font-semibold text-slate-meta px-1 py-0.5">+ 3 more</span>
      </div>
      <div className="text-2xs text-slate-meta text-center mt-3">{TWO_SIDED.note}</div>
    </div>
  );
}

function Meter({
  meterRef,
  numRef,
  value,
  label,
}: {
  meterRef: React.MutableRefObject<HTMLDivElement | null>;
  numRef: React.MutableRefObject<HTMLSpanElement | null>;
  value: number;
  label: string;
}) {
  return (
    <div
      ref={meterRef}
      className="relative w-[150px] h-[150px] rounded-full grid place-items-center mx-auto"
      style={
        {
          "--deg": `${value * 3.6}deg`,
          background: "conic-gradient(var(--heritage) var(--deg), #e7e2d5 0)",
        } as React.CSSProperties
      }
    >
      <div className="absolute inset-[12px] rounded-full bg-cream" aria-hidden />
      <div className="relative z-[1] text-center">
        <span ref={numRef} className="block text-4xl font-extrabold tabular leading-none">
          {value}
        </span>
        <span className="block text-2xs tracking-[1.4px] uppercase text-slate-meta mt-1">
          {label}
        </span>
      </div>
    </div>
  );
}
