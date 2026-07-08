"use client";

/**
 * CH4 — Draft with AI. The visitor (or autoplay) presses the REAL button
 * label ("Draft with AI", jd-generator-panel.tsx) and a dental-accurate JD
 * streams in line by line, grounded in the role + the comp built in CH2
 * (jd-generator-action.ts grounding; "the company" when masked).
 */

import { useEffect, useRef, useState } from "react";
import { SceneHead } from "../ui";
import { JD_LINES, JD_FOOT, DRAFT_BUTTON_LABEL } from "../track";
import { useCue } from "../use-player";

export function JdChapter({
  active,
  enhanced,
  nonce,
}: {
  active: boolean;
  enhanced: boolean;
  nonce: number;
}) {
  // SSR final: all lines + footnote visible.
  const [shown, setShown] = useState(JD_LINES.length + 1);
  const [pulse, setPulse] = useState(false);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const stream = () => {
    clearTimers();
    setPulse(false);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(JD_LINES.length + 1); // instant, no motion
      return;
    }
    setShown(0);
    let i = 0;
    const tick = () => {
      i += 1;
      setShown(i);
      if (i <= JD_LINES.length) timers.current.push(window.setTimeout(tick, 650));
    };
    timers.current.push(window.setTimeout(tick, 450));
  };

  useCue(active && enhanced, nonce, (cue) => {
    setShown(0);
    cue(300, () => setPulse(true));
    cue(1400, stream);
    return clearTimers;
  });

  return (
    <div>
      <SceneHead title="Draft with AI — dental-accurate in seconds" pill="Grounded in your comp" />
      <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-5 items-start">
        <div>
          <div className="bg-card border border-[var(--rule)] px-3.5 py-3 text-xs font-bold mb-2">
            Associate Dentist
            <span className="block text-2xs text-slate-meta font-semibold mt-0.5">
              Cherry Creek Dental Studio · Boise
            </span>
          </div>
          <div className="bg-card border border-[var(--rule)] px-3.5 py-3 text-xs font-bold mb-2.5">
            Comp: $750/day + 32%
            <span className="block text-2xs text-slate-meta font-semibold mt-0.5">
              from the model you just built
            </span>
          </div>
          <button
            type="button"
            onClick={stream}
            className={`w-full bg-hero text-hero-foreground text-2xs font-extrabold tracking-[1px] uppercase px-4 py-3 inline-flex items-center justify-center gap-2 hover:bg-hero/90 transition-colors ${
              pulse ? "bo-pulse" : ""
            }`}
          >
            ✦ {DRAFT_BUTTON_LABEL}
          </button>
        </div>
        <div>
          <div className="bg-card border border-[var(--rule)] p-4 min-h-[220px] text-xs leading-relaxed [&_h4]:text-sm [&_h4]:font-extrabold [&_h4]:mb-1.5 [&_h4]:mt-0">
            {JD_LINES.map((ln, i) => (
              <div
                key={i}
                className={`mb-2 transition-all duration-[350ms] ${
                  shown > i ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                }`}
                // Static, trusted marketing copy from track.ts (no user input).
                dangerouslySetInnerHTML={{ __html: ln.html }}
              />
            ))}
            {shown > 0 && shown <= JD_LINES.length && (
              <span aria-hidden className="inline-block w-2 h-[15px] bg-heritage align-[-2px] bo-blink" />
            )}
          </div>
          <div
            className={`text-2xs text-heritage-deep font-bold mt-2.5 transition-opacity duration-[400ms] ${
              shown > JD_LINES.length ? "opacity-100" : "opacity-0"
            }`}
          >
            {JD_FOOT}
          </div>
        </div>
      </div>
    </div>
  );
}
