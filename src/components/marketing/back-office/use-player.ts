"use client";

/**
 * usePlayer — the showcase's autoplay state machine.
 *
 * One rAF loop owns the clock. Per chapter: elapsed time accumulates toward
 * `durationMs`; finishing advances to the next chapter (wrapping). The clock
 * PAUSES (without resetting the chapter) whenever any of these hold:
 *   • the visitor is hovering/touching the stage (`setHover`)
 *   • the section is offscreen (IntersectionObserver on `sectionRef`)
 *   • the visitor pressed pause (`toggle`)
 *   • the tab is hidden (visibilitychange)
 * prefers-reduced-motion disables autoplay entirely (enhanced=false —
 * chapters render their SSR final states and never animate).
 *
 * Progress is written imperatively to `barRefs` (chip fill widths) inside
 * the rAF — no per-frame React state, so the loop costs ~nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Player {
  /** Active chapter index. */
  current: number;
  /** User-toggled pause state (for the ⏸/▶ button). */
  paused: boolean;
  /** False until mounted OR when reduced-motion — render final states. */
  enhanced: boolean;
  /** Nonce that bumps every time the current chapter (re)starts — chapters
   *  key their choreography off it so jumping back replays. */
  playNonce: number;
  /** Non-null while the D-mark transition veil should render (keyed so the
   *  CSS draw restarts per transition). The chapter swap happens ~180ms in,
   *  BEHIND the veil — that's what kills the hard-cut flash. */
  wipeKey: number | null;
  go: (i: number) => void;
  next: () => void;
  prev: () => void;
  toggle: () => void;
  setHover: (v: boolean) => void;
  /** Attach to the section wrapper for offscreen pausing. */
  sectionRef: React.RefObject<HTMLElement | null>;
  /** Attach one per chapter chip's progress-fill element. */
  barRefs: React.MutableRefObject<Array<HTMLElement | null>>;
}

/** Wipe choreography (ms) — keep in sync with the bo-veil CSS timings. */
const WIPE_COMMIT_MS = 180; // chapter swap, hidden behind the veil
const WIPE_TOTAL_MS = 780; // veil unmount (CSS animation is 760ms)

export function usePlayer(durations: ReadonlyArray<number>): Player {
  const count = durations.length;
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);

  const sectionRef = useRef<HTMLElement | null>(null);
  const barRefs = useRef<Array<HTMLElement | null>>([]);

  // Mutable clock state — read/written only inside the rAF loop + handlers.
  const clock = useRef({
    elapsed: 0,
    last: 0,
    hover: false,
    offscreen: true,
    userPaused: false,
    hidden: false,
    current: 0,
    enhanced: false,
  });
  // Mirror React state into the clock (effect, not render — hooks-refs rule).
  useEffect(() => {
    clock.current.current = current;
    clock.current.userPaused = paused;
    clock.current.enhanced = enhanced;
  }, [current, paused, enhanced]);

  const [wipeKey, setWipeKey] = useState<number | null>(null);
  const wipeTimers = useRef<number[]>([]);

  /** The actual chapter swap — runs bare when not enhanced (reduced motion /
   *  pre-mount), or ~180ms into the veil so the cut is never visible. */
  const commitGo = useCallback(
    (i: number) => {
      const n = ((i % count) + count) % count;
      clock.current.elapsed = 0;
      clock.current.last = 0;
      // Reset every bar; the active one refills from the loop.
      for (const bar of barRefs.current) {
        if (bar) bar.style.transform = "scaleX(0)";
      }
      setCurrent(n);
      setPlayNonce((x) => x + 1);
    },
    [count]
  );

  const go = useCallback(
    (i: number) => {
      if (!clock.current.enhanced) {
        commitGo(i);
        return;
      }
      // Freeze the dwell clock immediately (the outgoing chapter shouldn't
      // keep burning time under the veil), start/restart the veil, and swap
      // the chapter once covered. Rapid jumps supersede pending commits.
      clock.current.elapsed = 0;
      clock.current.last = 0;
      wipeTimers.current.forEach(clearTimeout);
      wipeTimers.current = [];
      setWipeKey(Date.now());
      wipeTimers.current.push(
        window.setTimeout(() => commitGo(i), WIPE_COMMIT_MS),
        window.setTimeout(() => setWipeKey(null), WIPE_TOTAL_MS)
      );
    },
    [commitGo]
  );

  // Clear pending wipe timers on unmount.
  useEffect(
    () => () => {
      wipeTimers.current.forEach(clearTimeout);
    },
    []
  );

  const next = useCallback(() => go(clock.current.current + 1), [go]);
  const prev = useCallback(() => go(clock.current.current - 1), [go]);
  const toggle = useCallback(() => setPaused((p) => !p), []);
  const setHover = useCallback((v: boolean) => {
    clock.current.hover = v;
  }, []);

  // Enhance on mount unless reduced motion. Canonical mount-detection
  // enhancement (SSR renders final states; JS upgrades to animated) — same
  // pattern + rationale as the mobile-nav portal mount flag.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnhanced(true);
    setPlayNonce((x) => x + 1); // play chapter 0 from its start state
  }, []);

  // Offscreen pause.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || !enhanced) return;
    const io = new IntersectionObserver(
      (entries) => {
        clock.current.offscreen = !entries.some((e) => e.isIntersecting);
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enhanced]);

  // Tab-hidden pause.
  useEffect(() => {
    if (!enhanced) return;
    const onVis = () => {
      clock.current.hidden = document.hidden;
    };
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [enhanced]);

  // The clock.
  useEffect(() => {
    if (!enhanced) return;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const c = clock.current;
      const dwell = durations[c.current] ?? 7000;
      if (c.hover || c.offscreen || c.userPaused || c.hidden) {
        c.last = 0; // drop the delta so pause doesn't accumulate time
        return;
      }
      if (c.last === 0) {
        c.last = now;
        return;
      }
      c.elapsed += now - c.last;
      c.last = now;
      const bar = barRefs.current[c.current];
      // scaleX (compositor-only) — a per-frame width write forces layout
      // every frame for the whole dwell and reads as jank on phones.
      if (bar) bar.style.transform = `scaleX(${Math.min(1, c.elapsed / dwell)})`;
      if (c.elapsed >= dwell) go(c.current + 1);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enhanced, durations, go]);

  return {
    current,
    paused,
    enhanced,
    playNonce,
    wipeKey,
    go,
    next,
    prev,
    toggle,
    setHover,
    sectionRef,
    barRefs,
  };
}

/**
 * useCue — chapter-choreography helper: schedule a set of timeouts when the
 * chapter activates, auto-cleared when it deactivates or replays. Chapters
 * pass `active && enhanced` — under reduced motion nothing schedules and the
 * SSR final state stands.
 */
export function useCue(
  active: boolean,
  nonce: number,
  run: (cue: (ms: number, fn: () => void) => void) => void | (() => void)
) {
  const runRef = useRef(run);
  // Latest-callback mirror kept in an effect (hooks-refs rule); declared
  // BEFORE the choreography effect so it updates first in effect order.
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    if (!active) return;
    const timers: number[] = [];
    const cue = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const cleanup = runRef.current(cue);
    return () => {
      for (const t of timers) clearTimeout(t);
      cleanup?.();
    };
  }, [active, nonce]);
}

/** Chapter-local eased count-up (cue-driven, unlike marketing CountUp whose
 *  trigger is viewport entry). Same ease-out-quint personality. */
export function animateCount(
  el: HTMLElement | null,
  to: number,
  {
    duration = 900,
    prefix = "",
    suffix = "",
    onFrame,
  }: {
    duration?: number;
    prefix?: string;
    suffix?: string;
    onFrame?: (v: number) => void;
  } = {}
): () => void {
  if (!el) return () => {};
  let raf = 0;
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min((now - t0) / duration, 1);
    const v = Math.round(to * (1 - Math.pow(1 - p, 5)));
    el.textContent = `${prefix}${v.toLocaleString("en-US")}${suffix}`;
    onFrame?.(v);
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
