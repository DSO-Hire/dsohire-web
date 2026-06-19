"use client";

/**
 * PracticeFitTeaser — #115 FOH-5, the candidate-side conversion machine.
 *
 * Three tap-only questions (30 seconds) → the dial assembles a clearly
 * labeled SAMPLE score with the visitor's three real signals shown as
 * captured. The full assessment rides the CTA.
 *
 * HONESTY RULES (locked fit-model floors — do not soften):
 *   - We NEVER present a fabricated number as the visitor's real score.
 *     The result state is explicitly "Sample score" + "3 of 25+ signals
 *     captured" — their answers are real inputs, the 92 is a demo.
 *   - No answer is wrong; no answer changes the sample. This is a feel
 *     of the product, not a fake computation.
 *
 * Pure client component — imports only the pure FitDial. No server deps.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { FitDial } from "./fit-dial";

interface TeaserQuestion {
  prompt: string;
  /** Which real assessment signal this maps to (shown in the result). */
  signal: string;
  options: string[];
}

const QUESTIONS: TeaserQuestion[] = [
  {
    prompt: "What pace feels right to you?",
    signal: "Pace",
    options: ["Steady & thorough", "Balanced", "High-energy, full days"],
  },
  {
    prompt: "Your ideal work week?",
    signal: "Schedule",
    options: ["4 days", "5 days", "Flexible / PRN"],
  },
  {
    prompt: "What matters most right now?",
    signal: "Priority",
    options: ["Mentorship & growth", "Pay & benefits", "Culture & team"],
  },
];

export function PracticeFitTeaser({
  assessmentHref,
}: {
  assessmentHref: string;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);

  const done = step >= QUESTIONS.length;

  function pick(option: string) {
    setAnswers((prev) => [...prev, option]);
    setStep((s) => s + 1);
  }

  function reset() {
    setAnswers([]);
    setStep(0);
  }

  return (
    <div
      className="bg-card border border-[var(--rule-strong)] overflow-hidden"
      style={{
        boxShadow:
          "0 30px 60px -30px rgba(7,15,28,0.18), 0 10px 24px -12px rgba(7,15,28,0.10)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 bg-cream border-b border-[var(--rule)]">
        <div>
          <div className="text-[9px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Try it · 3 questions · 30 seconds
          </div>
          <div className="text-[15px] font-bold tracking-[-0.3px] text-ink leading-tight">
            {done ? "Here's how your score assembles" : "How do you like to work?"}
          </div>
        </div>
        {/* Progress pips */}
        <div className="flex items-center gap-1.5" aria-hidden>
          {QUESTIONS.map((_, i) => (
            <span
              key={i}
              className={`block w-5 h-1 transition-colors ${
                i < step ? "bg-heritage" : "bg-ivory-deep"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Body */}
      {!done ? (
        <div className="px-6 sm:px-8 py-8">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
            {QUESTIONS[step].signal} · question {step + 1} of {QUESTIONS.length}
          </div>
          <div className="text-[19px] font-extrabold tracking-[-0.4px] text-ink mb-5">
            {QUESTIONS[step].prompt}
          </div>
          <div className="flex flex-col gap-2.5">
            {QUESTIONS[step].options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => pick(opt)}
                className="text-left px-5 py-3.5 border border-[var(--rule-strong)] text-[14.5px] font-semibold text-ink bg-card hover:border-heritage hover:bg-cream/60 motion-safe:hover:-translate-y-0.5 transition-all"
              >
                {opt}
              </button>
            ))}
          </div>
          <p className="mt-5 text-[11.5px] text-slate-meta leading-snug">
            No sign-up needed for the preview. No wrong answers.
          </p>
        </div>
      ) : (
        <div className="px-6 sm:px-8 py-8">
          {/* Sample disclaimer FIRST — the honesty floor, stated plainly. */}
          <div
            className="inline-flex items-center px-2 py-1 mb-5 text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep border border-heritage/35"
            style={{ background: "var(--heritage-tint)" }}
          >
            Sample score · yours needs the full assessment
          </div>

          <FitDial
            score={92}
            caption="Sample · Strong match"
            dimensions={[
              { label: "Schedule fit", value: 94 },
              { label: "Pace & culture", value: 88 },
              { label: "Growth & mentorship", value: 91 },
              { label: "Commute", value: 86 },
            ]}
          />

          {/* Their real captured signals */}
          <div className="mt-7 border-t border-[var(--rule)] pt-5">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-3">
              Captured — 3 of 25+ signals
            </div>
            <ul className="list-none space-y-1.5 mb-5">
              {QUESTIONS.map((q, i) => (
                <li key={q.signal} className="flex items-center gap-2 text-[13.5px] text-ink">
                  <Check className="h-3.5 w-3.5 text-heritage-deep shrink-0" />
                  <span className="font-semibold">{q.signal}:</span>
                  <span className="text-slate-body">{answers[i]}</span>
                </li>
              ))}
            </ul>
            <p className="text-[13px] text-slate-body leading-relaxed mb-6">
              Your real PracticeFit uses 25+ dimensions — schedule overlap
              with actual openings, commute from your area, PMS fluency,
              clinical mix, and more. Five minutes, free, private.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={assessmentHref}
                className="inline-flex items-center gap-2.5 px-6 py-3 bg-heritage text-primary-foreground text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-heritage-deep transition-colors"
              >
                Take The Full Assessment
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-ink transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Start over
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
