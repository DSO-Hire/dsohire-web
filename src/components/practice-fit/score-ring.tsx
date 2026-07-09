"use client";

/**
 * <ScoreRing /> — compact animated PracticeFit/DSOFit score reveal
 * (design program 5c, signature micro-interaction).
 *
 * The in-app sibling of the marketing FitDial: when it scrolls into view
 * (or mounts visible — e.g. inside the WhyThisMatch expander), the ring
 * sweeps to the score on --ease-settle while the number counts up in
 * lockstep. Color rides currentColor so the caller's bucket/product ramp
 * (navy PracticeFit / heritage DSOFit, dark-adaptive) carries through
 * with zero prop plumbing.
 *
 * Fit-honesty: renders EXACTLY the score it's given — the animation is
 * a reveal, never an inflation. Reduced motion ⇒ fully static.
 */

import { useEffect, useRef } from "react";

const R = 34;
const CIRC = 2 * Math.PI * R;
/** Same settle personality as the count-ups in the showcase. */
const EASE = (p: number) => 1 - Math.pow(1 - p, 4);

export function ScoreRing({
  score,
  sizePx = 84,
  durationMs = 1100,
}: {
  /** 0–100. Rendered verbatim. */
  score: number;
  sizePx?: number;
  durationMs?: number;
}) {
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const arcRef = useRef<SVGCircleElement | null>(null);
  const numRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const arc = arcRef.current;
    const num = numRef.current;
    if (!root || !arc || !num) return;

    // Reduced motion — leave the server-rendered final state untouched.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    // Start empty; reveal on view.
    arc.style.transition = "none";
    arc.style.strokeDashoffset = String(CIRC);
    num.textContent = "0";

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        requestAnimationFrame(() => {
          arc.style.transition = `stroke-dashoffset ${durationMs}ms var(--ease-settle)`;
          arc.style.strokeDashoffset = String(CIRC * (1 - score / 100));
        });
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - t0) / durationMs, 1);
          num.textContent = String(Math.round(score * EASE(p)));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 }
    );
    io.observe(root);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [score, durationMs]);

  return (
    <span
      ref={rootRef}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: sizePx, height: sizePx }}
      role="img"
      aria-label={`Score ${score} out of 100`}
    >
      <svg
        viewBox="0 0 84 84"
        width={sizePx}
        height={sizePx}
        fill="none"
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx="42"
          cy="42"
          r={R}
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeWidth="6"
          fill="none"
        />
        <circle
          ref={arcRef}
          cx="42"
          cy="42"
          r={R}
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - score / 100)}
        />
      </svg>
      <span
        ref={numRef}
        className="absolute inset-0 flex items-center justify-center text-xl font-extrabold tracking-[-0.5px] tabular"
        aria-hidden
      >
        {score}
      </span>
    </span>
  );
}
