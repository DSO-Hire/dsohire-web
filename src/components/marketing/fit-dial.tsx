"use client";

/**
 * #115 FOH-1 — FitDial: the PracticeFit score, assembling itself.
 *
 * The single most differentiated asset DSO Hire owns, finally shown moving
 * on the marketing surfaces (Day-30 review: "this is your money shot").
 * SVG ring fills to the score, the number counts up in lockstep, the
 * sparkle settles in last. Triggered once on scroll-into-view;
 * `prefers-reduced-motion` renders the finished state immediately.
 *
 * Pure client primitive — no server imports (hard rule). Reused by both
 * /for-dental-groups (employer voice) and /for-candidates (candidate
 * voice); FOH-9 may later mount it on in-app Smart Picks.
 */

import { useEffect, useRef } from "react";

const R = 86;
const CIRC = 2 * Math.PI * R;
const EASE = (t: number) => 1 - Math.pow(1 - t, 4);

export interface FitDimension {
  label: string;
  value: number; // 0-100
}

export function FitDial({
  score,
  caption = "Strong match",
  dimensions,
}: {
  score: number;
  caption?: string;
  dimensions: FitDimension[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const arc = arcRef.current;
    const num = numRef.current;
    if (!root || !arc || !num) return;

    const finish = () => {
      arc.style.strokeDashoffset = String(CIRC * (1 - score / 100));
      num.textContent = String(score);
      root.classList.add("mk-dial-lit");
      root.querySelectorAll<HTMLElement>("[data-dim-fill]").forEach((bar) => {
        bar.style.right = `${100 - Number(bar.dataset.dimFill)}%`;
      });
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    // Start empty; fill on view.
    arc.style.strokeDashoffset = String(CIRC);
    num.textContent = "0";

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // Ring + bars ride CSS transitions; the number rides rAF in lockstep.
        requestAnimationFrame(() => {
          arc.style.strokeDashoffset = String(CIRC * (1 - score / 100));
          root.querySelectorAll<HTMLElement>("[data-dim-fill]").forEach((bar) => {
            bar.style.right = `${100 - Number(bar.dataset.dimFill)}%`;
          });
        });
        const t0 = performance.now();
        const dur = 1400;
        const step = (now: number) => {
          const p = Math.min((now - t0) / dur, 1);
          num.textContent = String(Math.round(score * EASE(p)));
          if (p < 1) raf = requestAnimationFrame(step);
          else root.classList.add("mk-dial-lit");
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.45 }
    );
    io.observe(root);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [score]);

  return (
    <div
      ref={rootRef}
      className="grid grid-cols-1 md:grid-cols-[auto_1fr] items-center gap-10 md:gap-14"
    >
      {/* The dial */}
      <div className="relative w-[220px] h-[220px] mx-auto md:mx-0">
        <svg width="220" height="220" viewBox="0 0 220 220" fill="none" className="-rotate-90">
          <circle cx="110" cy="110" r={R} stroke="var(--ivory-deep)" strokeWidth="12" fill="none" />
          <circle
            ref={arcRef}
            cx="110"
            cy="110"
            r={R}
            stroke="var(--heritage)"
            strokeWidth="12"
            fill="none"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - score / 100)}
            style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            ref={numRef}
            className="text-[56px] font-extrabold tracking-[-2.5px] leading-none text-ink"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {score}
          </span>
          <span className="mt-1 text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
            PracticeFit · {caption}
          </span>
        </div>
        {/* Sparkle — pops in once the score lands (mirrors the .pf-slider thumb mark) */}
        <span
          aria-hidden
          className="mk-dial-sparkle absolute top-[22px] right-[26px] w-[26px] h-[26px] rounded-full bg-card border border-[var(--rule-strong)] flex items-center justify-center"
        >
          <svg width="12" height="12" viewBox="0 0 14 14">
            <path
              d="M7 0 L8.6 5.4 L14 7 L8.6 8.6 L7 14 L5.4 8.6 L0 7 L5.4 5.4 Z"
              fill="var(--heritage)"
            />
          </svg>
        </span>
      </div>

      {/* Dimension bars */}
      <div className="flex flex-col gap-3.5 max-w-[420px] w-full">
        {dimensions.map((d) => (
          <div key={d.label} className="flex items-center gap-4">
            <span className="w-[140px] shrink-0 text-[13px] font-semibold text-ink">
              {d.label}
            </span>
            <span className="relative flex-1 h-[5px] bg-ivory-deep overflow-hidden">
              <i
                data-dim-fill={d.value}
                className="absolute inset-0 bg-heritage not-italic"
                style={{
                  right: `${100 - d.value}%`,
                  transition: "right 1.1s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </span>
            <span
              className="w-[30px] text-right text-[11px] font-bold text-heritage-deep"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
