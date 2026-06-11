"use client";

/**
 * #115 FOH-1 — the DSO Hire motion system (marketing primitives).
 *
 * Motion personality (locked in the Day-30 review + Hero_Motion_Concept):
 * "precise, settling, architectural" — things slide into alignment on the
 * grid. 450ms, ease-out-quint, small distances. NO parallax, NO scroll-
 * jacking, NO cursor effects — that's the new slop.
 *
 * Two primitives:
 *
 *   <MotionMount />  — one per page (already inside SiteShell). Finds every
 *     element carrying `data-reveal` and adds `.mk-in` when it scrolls into
 *     view (one IntersectionObserver, fire-once). Server components opt in
 *     by ADDING AN ATTRIBUTE — no wrapper divs, so grid/flex layouts are
 *     untouched. Stagger via `style={{ "--mk-delay": "120ms" }}`.
 *     Graceful everywhere: the hiding CSS only applies under
 *     `@media (scripting: enabled)` (see globals.css), so no-JS visitors
 *     and crawlers always see content; `prefers-reduced-motion` disables
 *     the whole layer.
 *
 *   <CountUp />      — tabular-nums number that counts up over ~950ms when
 *     it enters the viewport. Server-renders the FINAL value (SEO + no-JS
 *     correct), zeroes only after hydration, animates on view.
 *
 * FOH-9 note: these same primitives are intended for the in-app surfaces
 * (dashboard KPIs, analytics) — import from here, don't fork.
 */

import { useEffect, useRef } from "react";

const EASE_OUT_QUINT = (t: number) => 1 - Math.pow(1 - t, 5);

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ───────────────────────────────────────────────────────
   MotionMount — page-level reveal observer
─────────────────────────────────────────────────────── */

export function MotionMount() {
  useEffect(() => {
    // Cancel the CSS auto-reveal safety net — this page HAS the observer,
    // so below-fold elements keep their scroll-triggered entrances.
    document.documentElement.classList.add("mk-armed");

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (els.length === 0) return;

    // Reduced motion: the CSS layer is already inert; just mark everything
    // in so any future class-based styling stays consistent.
    if (prefersReducedMotion()) {
      for (const el of els) el.classList.add("mk-in");
      return;
    }

    const timeouts: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.add("mk-in");
          io.unobserve(el);
          // Once the entrance settles, hand the element back to its
          // pristine state — removing the [data-reveal] hook so our
          // transition can never fight the element's own hover/Tailwind
          // transitions afterwards.
          const delay = parseInt(el.style.getPropertyValue("--mk-delay")) || 0;
          timeouts.push(
            window.setTimeout(() => {
              el.removeAttribute("data-reveal");
              el.classList.remove("mk-in");
              el.style.removeProperty("--mk-delay");
            }, delay + 520)
          );
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -5% 0px" }
    );
    for (const el of els) io.observe(el);
    return () => {
      io.disconnect();
      for (const t of timeouts) clearTimeout(t);
    };
  }, []);

  return null;
}

/* ───────────────────────────────────────────────────────
   CountUp — settle-into-place number
─────────────────────────────────────────────────────── */

/**
 * StatValue — FOH-9 in-app wrapper. Animates PURE-INTEGER display values
 * ("47", "1,204") with a snappy count-up; anything pre-formatted ("3.2d",
 * "59%", "—") renders untouched. Lets KPI tiles / stat cards adopt motion
 * with zero call-site changes and zero risk to non-numeric states.
 *
 * In-app mode = ssrZero + reserveWidth: the value renders as 0 from the
 * server (no SSR-final → snap-to-0 flash — the authed app requires JS
 * anyway) and the span pre-reserves the FINAL value's width in `ch`, so
 * digit-count changes never shift neighboring layout. (Cam Day 31:
 * "dashboard motion is a little jumpy" — this was the fix.)
 */
export function StatValue({
  value,
  duration = 700,
}: {
  value: string;
  duration?: number;
}) {
  const m = /^(\d[\d,]*)$/.exec(value.trim());
  if (!m) return <>{value}</>;
  return (
    <CountUp
      to={parseInt(m[1].replace(/,/g, ""), 10)}
      duration={duration}
      ssrZero
      reserveWidth
    />
  );
}

export function CountUp({
  to,
  prefix = "",
  suffix = "",
  duration = 950,
  className,
  ssrZero = false,
  reserveWidth = false,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
  /**
   * Render 0 from the server and count up on view. Use IN-APP only —
   * marketing surfaces keep the real value in the HTML for SEO/no-JS
   * (their reveal layer hides the wind-up instead).
   */
  ssrZero?: boolean;
  /** Reserve the final value's width so digits never shift layout. */
  reserveWidth?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = `${prefix}${to.toLocaleString("en-US")}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = finalText;
      return;
    }

    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now();
        const step = (now: number) => {
          const p = Math.min((now - t0) / duration, 1);
          const v = Math.round(to * EASE_OUT_QUINT(p));
          el.textContent = `${prefix}${v.toLocaleString("en-US")}${suffix}`;
          if (p < 1) raf = requestAnimationFrame(step);
        };
        // ssrZero mode is already showing 0 — start counting directly.
        // SSR-final mode zeroes only at this moment (element is inside a
        // reveal-hidden parent on marketing pages, so no visible snap).
        if (!ssrZero) el.textContent = `${prefix}0${suffix}`;
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, prefix, suffix, duration, ssrZero, finalText]);

  return (
    <span
      ref={ref}
      className={className}
      style={{
        fontVariantNumeric: "tabular-nums",
        ...(reserveWidth
          ? {
              display: "inline-block",
              minWidth: `${finalText.length}ch`,
            }
          : null),
      }}
    >
      {ssrZero ? `${prefix}0${suffix}` : finalText}
    </span>
  );
}
