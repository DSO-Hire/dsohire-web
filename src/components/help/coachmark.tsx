"use client";

/**
 * Coachmark — a restrained first-run nudge (Dave call Note 5).
 *
 * Cam's rules (locked 2026-05-22): cap at 2–3 screens total, show ONCE ever,
 * one-click dismiss, never a forced tour. The coachmark teaches the *system*
 * ("Tap any ⓘ for help"), not the content — so it gets out of the way fast.
 * There's a global "don't show tips" kill switch that suppresses all of them.
 *
 *   <Coachmark id="wizard" />            // default "tap any ⓘ" message
 *   <Coachmark id="pipeline" message="New here? Drag cards between stages — and tap any ⓘ for help." />
 *
 * Persistence is localStorage (per-browser). v1 deliberately avoids a schema
 * change; "seen on this device" is good enough for a first-run nudge.
 */

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";

const GLOBAL_OFF_KEY = "dsohire.help.coachmarks_off";
const perKey = (id: string) => `dsohire.help.coachmark.${id}`;

const DEFAULT_MESSAGE =
  "New here? Tap any ⓘ on this screen for a quick explanation — they're everywhere help might be useful.";

/** Suppress every coachmark from now on (the global kill switch). */
export function dismissAllCoachmarks() {
  try {
    window.localStorage.setItem(GLOBAL_OFF_KEY, "1");
  } catch {
    /* storage unavailable — nothing to persist */
  }
}

/** Test/debug helper: clear all coachmark state so they show again. */
export function resetCoachmarks(ids: string[] = []) {
  try {
    window.localStorage.removeItem(GLOBAL_OFF_KEY);
    for (const id of ids) window.localStorage.removeItem(perKey(id));
  } catch {
    /* no-op */
  }
}

export function Coachmark({
  id,
  message = DEFAULT_MESSAGE,
  className = "",
}: {
  id: string;
  message?: string;
  className?: string;
}) {
  // Start hidden and decide on the client only — avoids any hydration
  // mismatch (server can't read localStorage).
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const off = window.localStorage.getItem(GLOBAL_OFF_KEY) === "1";
      const seen = window.localStorage.getItem(perKey(id)) === "1";
      if (!off && !seen) setVisible(true);
    } catch {
      /* storage blocked → just don't show */
    }
  }, [id]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(perKey(id), "1");
    } catch {
      /* no-op */
    }
    setVisible(false);
  };

  const dismissAll = () => {
    dismissAllCoachmarks();
    setVisible(false);
  };

  return (
    <div
      role="note"
      className={
        "flex items-start gap-3 border border-heritage/40 bg-heritage-tint px-4 py-3 " +
        className
      }
    >
      <span
        className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-heritage/15"
        aria-hidden
      >
        <Info className="h-3.5 w-3.5 text-heritage-deep" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed text-ink">{message}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <button
            type="button"
            onClick={dismiss}
            className="text-[11px] font-bold uppercase tracking-[1.5px] text-heritage-deep underline-offset-2 hover:text-ink hover:underline"
          >
            Got it
          </button>
          <button
            type="button"
            onClick={dismissAll}
            className="text-[11px] font-medium tracking-[0.3px] text-slate-meta underline-offset-2 hover:text-ink hover:underline"
          >
            Don&apos;t show tips
          </button>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="p-1 text-slate-meta transition-colors hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
