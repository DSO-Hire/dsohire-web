"use client";

/**
 * CH2 — Comp model (dental-native; folds in the old Offers guardrail beat).
 * Field rows assemble in sequence (labels from lib/comp/model.ts via
 * track.ts), the guardrail chip flags out-of-band comp, then the estimated
 * annual range counts up. SSR/reduced-motion renders everything settled.
 */

import { useRef, useState } from "react";
import { SceneHead } from "../ui";
import { COMP_FIELDS, COMP_GUARDRAIL, COMP_ESTIMATE } from "../track";
import { useCue, animateCount } from "../use-player";

export function CompChapter({
  active,
  enhanced,
  nonce,
}: {
  active: boolean;
  enhanced: boolean;
  nonce: number;
}) {
  // SSR final state: everything visible, final numbers in the HTML.
  const [visible, setVisible] = useState(COMP_FIELDS.length + 2); // fields + guard + est
  const minRef = useRef<HTMLSpanElement | null>(null);
  const maxRef = useRef<HTMLSpanElement | null>(null);

  useCue(active && enhanced, nonce, (cue) => {
    setVisible(0);
    const cancels: Array<() => void> = [];
    COMP_FIELDS.forEach((_, i) => cue(300 + i * 380, () => setVisible(i + 1)));
    const base = 300 + COMP_FIELDS.length * 380;
    cue(base + 150, () => setVisible(COMP_FIELDS.length + 1)); // guardrail
    cue(base + 500, () => {
      setVisible(COMP_FIELDS.length + 2); // estimate card
      cancels.push(
        animateCount(minRef.current, COMP_ESTIMATE.min, { prefix: "$", suffix: "k", duration: 850 }),
        animateCount(maxRef.current, COMP_ESTIMATE.max, { prefix: "$", suffix: "k", duration: 850 })
      );
    });
    return () => cancels.forEach((c) => c());
  });

  const ease = { transitionTimingFunction: "var(--ease-settle)" };

  return (
    <div>
      <SceneHead title="Comp: an ATS that speaks dental" pill="Dental-native" />
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_290px] gap-5 items-start">
        <div>
          {COMP_FIELDS.map((f, i) => (
            <div
              key={f.label}
              className={`flex justify-between items-center gap-3 px-3.5 py-3 bg-card border border-[var(--rule)] mb-2 transition-all duration-[450ms] ${
                visible > i ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
              style={ease}
            >
              <span className="text-2xs font-bold uppercase tracking-[0.6px] text-slate-meta">
                {f.label}
              </span>
              <span className="text-xs font-bold text-right">{f.value}</span>
            </div>
          ))}
          <div
            className={`text-2xs text-warning bg-warning-bg border-l-[3px] border-l-warning px-2.5 py-1.5 mt-2.5 transition-opacity duration-[400ms] ${
              visible > COMP_FIELDS.length ? "opacity-100" : "opacity-0"
            }`}
          >
            ⚠ {COMP_GUARDRAIL}
          </div>
        </div>
        <div
          className={`bg-hero text-hero-foreground p-5 transition-all duration-500 ${
            visible > COMP_FIELDS.length + 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
          style={ease}
        >
          <div className="text-2xs tracking-[1.6px] uppercase text-heritage-bright mb-1.5 font-bold">
            Estimated annual
          </div>
          <div className="text-3xl font-extrabold tracking-[-0.5px] tabular">
            <span ref={minRef}>${COMP_ESTIMATE.min}k</span>
            {" – "}
            <span ref={maxRef}>${COMP_ESTIMATE.max}k</span>
          </div>
          <div className="text-2xs text-hero-foreground/70 mt-2 leading-relaxed">
            Modeled from guarantee, production %, and adjusted-production
            basis, which is the way dentists actually get paid. No generic ATS
            can compute this.
          </div>
        </div>
      </div>
    </div>
  );
}
