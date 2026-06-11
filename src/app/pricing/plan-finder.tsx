"use client";

/**
 * PlanFinder — the 30-second tier recommender (Day 32 port, FOH 100x
 * Model 03). Three taps → an honest recommendation with reasoning. It
 * recommends DOWN when the footprint is small — the credibility of the
 * recommendation is the conversion mechanic, not upsell pressure.
 *
 * Pure client state; the CTA deep-links to the tier grid (#tiers).
 * Answer bands mirror the ENFORCED caps in lib/billing/caps.ts
 * (jobs 5/20/100/∞ · seats 5/15/50/∞) — keep in sync with #88.
 */

import { useState } from "react";

const QUESTIONS: Array<{ q: string; opts: string[] }> = [
  {
    q: "How many practice locations are you hiring for?",
    opts: ["1–5", "6–15", "16–40", "40+"],
  },
  {
    q: "How many roles are typically open at once?",
    opts: ["1–5", "6–20", "21–100", "100+"],
  },
  {
    q: "How many teammates will work the pipeline?",
    opts: ["1–5", "6–15", "16–50", "50+"],
  },
];

const TIER_NAMES = ["Solo", "Growth", "Scale", "Enterprise"] as const;

const WHYS: Record<(typeof TIER_NAMES)[number], string> = {
  Solo: "A handful of locations and open roles — Solo covers it at owner pricing, and you can move up any time without losing anything.",
  Growth:
    "Multiple practices, a steady stream of roles, and a small team working the pipeline — Growth's 20 openings and 15 seats fit that footprint, with +3-seat packs if you outgrow them.",
  Scale:
    "You're running real hiring volume across many practices — Scale's 100 concurrent openings, 50 seats, approval chains, and confidential searches are built for exactly this.",
  Enterprise:
    "At your footprint, caps shouldn't exist. Enterprise is unlimited everything — talk to us and we'll map it to your org.",
};

export function PlanFinder() {
  const [answers, setAnswers] = useState<Array<number | null>>([null, null, null]);
  const [step, setStep] = useState(0);

  const done = answers.every((a) => a !== null);
  const rec = done ? Math.max(...(answers as number[])) : null;

  const pick = (value: number) => {
    const next = [...answers];
    next[step] = value;
    setAnswers(next);
    if (step < QUESTIONS.length - 1) setStep(step + 1);
  };

  const reset = () => {
    setAnswers([null, null, null]);
    setStep(0);
  };

  return (
    <section className="px-6 sm:px-14 pt-24 max-w-[1240px] mx-auto">
      <div
        data-reveal
        className="relative max-w-[680px] mx-auto bg-ink text-ivory px-7 py-8 sm:px-9"
      >
        <span aria-hidden className="absolute top-0 inset-x-0 h-[3px] bg-heritage" />
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-light mb-4">
          Not sure which tier? 30 seconds.
        </div>

        {/* progress */}
        <div className="flex gap-1.5 mb-5" aria-hidden>
          {QUESTIONS.map((_, i) => (
            <span
              key={i}
              className={`h-[3px] flex-1 ${
                done || i <= step ? "bg-heritage-light" : "bg-ivory/15"
              }`}
            />
          ))}
        </div>

        {!done && (
          <div>
            <div className="text-[16px] font-extrabold tracking-[-0.2px] mb-4">
              {QUESTIONS[step].q}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {QUESTIONS[step].opts.map((opt, i) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => pick(i)}
                  className={`px-4 py-2.5 text-[13px] font-bold border transition-colors ${
                    answers[step] === i
                      ? "bg-heritage border-heritage text-white"
                      : "border-ivory/30 text-ivory hover:border-heritage-light hover:text-heritage-light"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="mt-4 text-[10px] font-bold tracking-[1.2px] uppercase text-ivory/45 hover:text-ivory"
              >
                ← Back
              </button>
            )}
          </div>
        )}

        {done && rec !== null && (
          <div className="text-center py-1">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-light mb-1.5">
              Your fit
            </div>
            <div className="text-[28px] font-extrabold tracking-[-0.8px] mb-2">
              {TIER_NAMES[rec]}
            </div>
            <p className="text-[13px] text-ivory/65 leading-[1.65] max-w-[440px] mx-auto mb-5">
              {WHYS[TIER_NAMES[rec]]}
            </p>
            <a
              href="#tiers"
              className="inline-block bg-ivory text-ink px-6 py-3 text-[11px] font-bold tracking-[1.6px] uppercase hover:bg-ivory-deep transition-colors"
            >
              See the tier ↑
            </a>
            <div>
              <button
                type="button"
                onClick={reset}
                className="mt-3.5 text-[10px] font-bold tracking-[1.2px] uppercase text-ivory/45 hover:text-ivory"
              >
                Start over
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
