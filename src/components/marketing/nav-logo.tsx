"use client";

/**
 * NavLogo — the header lockup's hover life (refined 2026-11-22).
 *
 * One motion, done well: the heritage crossbar (the implied H) reaches
 * toward the arch's spine as the pointer travels across the lockup, closing
 * the D. Groups and candidates, connected direct.
 *
 * Why a spring and not a CSS transition: a transition restarts on every
 * pointermove, so the bar stutters as it chases the cursor. Here the
 * pointer only sets a target; a critically damped spring (no overshoot,
 * per the house "settle" rule) integrates toward it each frame, so the bar
 * glides continuously however erratically the mouse moves. ω = 18 settles
 * within 1% in about 400ms. The loop runs only while the bar is moving.
 *
 * Geometry: the crossbar line runs x 8 to 36 but only `len` units are
 * drawn (stroke-dasharray), so round caps stay round. Rest = 16 (the
 * locked 8 to 24 mark); full reach = 28 (cap edge 37.5, just inside the
 * spine at 38). Reach eases out across the lockup so the bar answers as
 * soon as the pointer arrives instead of waiting for the wordmark.
 *
 * Mouse only; touch and reduced motion never start the loop.
 */
import Link from "next/link";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";

const REST = 16;
const REACH = 12;
const OMEGA = 18; // rad/s; critically damped: stiffness ω², damping 2ω

export function NavLogo({ children }: { children: ReactNode }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const sim = useRef({ x: REST, v: 0, target: REST, raf: 0, last: 0 });

  useEffect(() => {
    const s = sim.current;
    return () => cancelAnimationFrame(s.raf);
  }, []);

  const bar = () => linkRef.current?.querySelector<SVGLineElement>(".lockup-bar") ?? null;

  function tick(now: number) {
    const s = sim.current;
    const el = bar();
    if (!el) return;
    // Clamp dt so a backgrounded tab doesn't fling the bar.
    const dt = Math.min(0.032, s.last ? (now - s.last) / 1000 : 0.016);
    s.last = now;
    // Two substeps keep the integration stable at low frame rates.
    for (let i = 0; i < 2; i++) {
      const h = dt / 2;
      const a = OMEGA * OMEGA * (s.target - s.x) - 2 * OMEGA * s.v;
      s.v += a * h;
      s.x += s.v * h;
    }
    const settled = Math.abs(s.target - s.x) < 0.02 && Math.abs(s.v) < 0.02;
    if (settled) s.x = s.target;
    if (settled && s.target === REST) {
      el.style.removeProperty("stroke-dasharray"); // hand back to the CSS rest state
    } else {
      el.style.strokeDasharray = `${s.x.toFixed(2)} 100`;
    }
    if (settled) {
      s.raf = 0;
      s.last = 0;
      return;
    }
    s.raf = requestAnimationFrame(tick);
  }

  function aim(target: number) {
    const s = sim.current;
    s.target = target;
    if (!s.raf) s.raf = requestAnimationFrame(tick);
  }

  const reduced = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function onMove(e: PointerEvent<HTMLAnchorElement>) {
    if (e.pointerType !== "mouse" || reduced()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const eased = 1 - (1 - t) * (1 - t); // ease-out: answers early
    aim(REST + REACH * eased);
  }

  function onLeave(e: PointerEvent<HTMLAnchorElement>) {
    if (e.pointerType !== "mouse") return;
    aim(REST);
  }

  return (
    <Link
      ref={linkRef}
      href="/"
      aria-label="DSO Hire, home"
      className="nav-logo flex items-center shrink-0"
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      {children}
    </Link>
  );
}
