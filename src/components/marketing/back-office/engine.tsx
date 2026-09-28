"use client";

/**
 * Showcase engine: the scripted cursor + small choreography primitives.
 *
 * The cursor is the "actor" the v1 showcase lacked: things no longer happen
 * by themselves; a pointer moves to the button and presses it. It is a
 * scripted demo pointer inside the product frame, NOT a visitor-cursor
 * effect (house doctrine: no cursor-following effects), and it never
 * appears under reduced motion.
 *
 * Everything moves imperatively (style writes on refs) so a 60fps glide
 * costs zero React renders. Targets are found by `data-cur="id"` inside the
 * stage root, measured relative to it at call time, so layout changes
 * (height morphs, responsive columns) can never desync the pointer.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

export interface CursorApi {
  /** Glide to the element tagged data-cur={id}. `at` = point within it (0..1). */
  to: (id: string, opts?: { ms?: number; at?: [number, number] }) => void;
  /** Press + ripple at the current position. */
  click: () => void;
  /** Hold the press (drag start) / release it. */
  down: () => void;
  up: () => void;
  show: () => void;
  hide: () => void;
  /** Current pointer position relative to the stage root. */
  pos: () => { x: number; y: number };
  /** The stage root (for scenes that need to measure). */
  root: () => HTMLElement | null;
}

const NOOP: CursorApi = {
  to: () => {},
  click: () => {},
  down: () => {},
  up: () => {},
  show: () => {},
  hide: () => {},
  pos: () => ({ x: 0, y: 0 }),
  root: () => null,
};

const CursorCtx = createContext<CursorApi>(NOOP);
export const useCursor = () => useContext(CursorCtx);

/** Human-feeling glide: quick departure, gentle landing, a hair of overshoot. */
const GLIDE = "cubic-bezier(0.45, 0.05, 0.2, 1.04)";

export function CursorStage({
  enabled,
  className,
  children,
}: {
  enabled: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const curRef = useRef<HTMLDivElement>(null);
  const rippleRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef({ x: 40, y: 40 });

  const place = useCallback((x: number, y: number, ms: number) => {
    const el = curRef.current;
    if (!el) return;
    posRef.current = { x, y };
    el.style.transition = `transform ${ms}ms ${GLIDE}, opacity 300ms ease`;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const api = useMemo<CursorApi>(() => {
    if (!enabled) return NOOP;
    return {
      to: (id, opts) => {
        const root = rootRef.current;
        const target = root?.querySelector<HTMLElement>(`[data-cur="${id}"]`);
        if (!root || !target) return;
        const r = root.getBoundingClientRect();
        const t = target.getBoundingClientRect();
        if (t.width === 0 && t.height === 0) return; // hidden target
        const [ax, ay] = opts?.at ?? [0.55, 0.6];
        const x = t.left - r.left + t.width * ax;
        const y = t.top - r.top + t.height * ay;
        // Duration scales with distance (Fitts-ish) unless pinned.
        const d = Math.hypot(x - posRef.current.x, y - posRef.current.y);
        const ms = opts?.ms ?? Math.round(Math.min(1100, Math.max(420, 260 + d * 1.1)));
        place(x, y, ms);
      },
      click: () => {
        const el = curRef.current;
        const rip = rippleRef.current;
        if (!el) return;
        el.classList.remove("is-click");
        void el.offsetWidth; // restart the keyframe
        el.classList.add("is-click");
        if (rip) {
          rip.style.transform = `translate3d(${posRef.current.x}px, ${posRef.current.y}px, 0)`;
          rip.classList.remove("is-on");
          void rip.offsetWidth;
          rip.classList.add("is-on");
        }
      },
      down: () => curRef.current?.classList.add("is-down"),
      up: () => curRef.current?.classList.remove("is-down"),
      show: () => {
        if (curRef.current) curRef.current.style.opacity = "1";
      },
      hide: () => {
        if (curRef.current) curRef.current.style.opacity = "0";
      },
      pos: () => posRef.current,
      root: () => rootRef.current,
    };
  }, [enabled, place]);

  return (
    <CursorCtx.Provider value={api}>
      <div ref={rootRef} className={cn("relative", className)}>
        {children}
        {enabled && (
          <>
            <span ref={rippleRef} aria-hidden className="bx-ripple" />
            <div ref={curRef} aria-hidden className="bx-cursor" style={{ opacity: 0 }}>
              <svg width="22" height="24" viewBox="0 0 22 24" fill="none">
                <path
                  d="M3 2.2 19 11.4c.9.5.8 1.8-.2 2.1l-6.4 1.9-3.3 5.9c-.5.9-1.8.8-2.1-.2L2.1 3.4C1.8 2.5 2.3 1.8 3 2.2Z"
                  fill="#14233F"
                  stroke="#F7F4ED"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </>
        )}
      </div>
    </CursorCtx.Provider>
  );
}

/**
 * On: a choreographed reveal. Renders its settled state when `on` (or when
 * the stage isn't enhanced), and a lifted/blurred pre-state otherwise; the
 * spring transition between them lives in globals.css (.bx-on).
 */
export function On({
  on,
  delay = 0,
  as: Tag = "div",
  className,
  style,
  children,
  ...rest
}: {
  on: boolean;
  delay?: number;
  as?: React.ElementType;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
} & Record<string, unknown>) {
  return (
    <Tag
      data-on={on ? "true" : "false"}
      className={cn("bx-on", className)}
      style={{ ...style, "--d": `${delay}ms` } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}
