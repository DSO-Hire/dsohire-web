"use client";

/**
 * CH5 — Sourcing / consent (the closer). A masked prospect advances through
 * the REAL prospect stages (Sourced → Contacted → Responded → Converted,
 * labels from lib/sourcing/pipeline.ts); on response the double-blind card
 * flips from anonymous to a named candidate with the consent badge —
 * candidate-controlled, private-by-default.
 */

import { useState } from "react";
import { SceneHead, FitChip } from "../ui";
import { SOURCING, SOURCING_STEPS } from "../track";
import { useCue } from "../use-player";

export function SourcingChapter({
  active,
  enhanced,
  nonce,
}: {
  active: boolean;
  enhanced: boolean;
  nonce: number;
}) {
  // SSR final: all steps lit, card revealed, consent badge on.
  const [step, setStep] = useState(SOURCING_STEPS.length); // steps lit
  const [revealed, setRevealed] = useState(true);

  useCue(active && enhanced, nonce, (cue) => {
    setStep(0);
    setRevealed(false);
    [500, 1600, 3000, 4400].forEach((ms, i) => cue(ms, () => setStep(i + 1)));
    cue(4700, () => setRevealed(true));
  });

  return (
    <div>
      <SceneHead title="Sourcing — candidates who want to be found" pill="Consent-based" />
      <div className="grid grid-cols-1 sm:grid-cols-[280px_1fr] gap-5 items-start">
        <div className="bg-card border border-[var(--rule)] p-4">
          <div
            className={`w-[46px] h-[46px] rounded-full grid place-items-center font-extrabold mb-2.5 transition-colors duration-[400ms] ${
              revealed ? "bg-heritage/15 text-heritage-deep" : "bg-ivory-deep text-slate-meta"
            }`}
            aria-hidden
          >
            {revealed ? SOURCING.revealedInitials : "?"}
          </div>
          <div
            className={`text-sm font-extrabold transition-colors duration-300 ${
              revealed ? "" : "italic text-slate-body"
            }`}
          >
            {revealed ? SOURCING.revealedName : SOURCING.maskedName}
          </div>
          <div className="text-2xs text-slate-meta mt-1 mb-2">{SOURCING.role}</div>
          <FitChip fit={SOURCING.fit} />
          <div className="mt-2.5">
            <span
              className={`inline-flex items-center gap-1.5 text-2xs font-extrabold tracking-[0.6px] uppercase text-heritage-deep px-2 py-1 transition-opacity duration-500 ${
                revealed ? "opacity-100" : "opacity-0"
              }`}
              style={{ background: "rgba(77,122,96,0.12)" }}
            >
              {SOURCING.consentBadge}
            </span>
          </div>
        </div>
        <div className="bg-card border border-[var(--rule)] p-4">
          <div className="text-2xs tracking-[1.2px] uppercase text-slate-meta mb-2 font-bold">
            Double-blind outreach
          </div>
          <div className="text-xs leading-relaxed border border-dashed border-[var(--rule-strong)] p-3 min-h-[70px]">
            {SOURCING.message}
          </div>
          <div className="flex gap-1.5 mt-3">
            {SOURCING_STEPS.map((label, i) => (
              <div
                key={label}
                className={`flex-1 text-center text-2xs font-extrabold tracking-[0.6px] uppercase px-1 py-1.5 border transition-colors duration-300 ${
                  step > i
                    ? "bg-heritage/10 border-heritage text-heritage-deep"
                    : "bg-cream border-[var(--rule)] text-slate-meta"
                }`}
              >
                {label}
              </div>
            ))}
          </div>
          <div className="text-2xs text-slate-meta mt-3">
            Private by default — the candidate&apos;s name is shared only when
            they choose to share it.
          </div>
        </div>
      </div>
    </div>
  );
}
