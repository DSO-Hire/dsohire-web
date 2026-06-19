"use client";

/**
 * <RailCollapse> — Lane S (Model H, Day 32 verdict).
 *
 * The little tab on the rail's right edge that slides the sidebar to a
 * 72px icon spine and back. State persists per browser (localStorage);
 * the slim styles live in globals.css under `.rail-slim` so the rail
 * itself stays a server component. Expanded SSR is the default, so
 * first paint may briefly show the full rail before the saved slim
 * preference applies — accepted v1 tradeoff.
 *
 * Day 35 — parameterized so the candidate rail can reuse it: pass a
 * `targetId` (the <aside> id) + a `storageKey`. Defaults keep the
 * employer call site (`<RailCollapse />`) byte-identical.
 */

import { useEffect, useState } from "react";

export function RailCollapse({
  targetId = "employer-rail",
  storageKey = "dsoh-rail-slim",
}: {
  targetId?: string;
  storageKey?: string;
} = {}) {
  const [slim, setSlim] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(storageKey) === "1") {
      setSlim(true);
      document.getElementById(targetId)?.classList.add("rail-slim");
    }
  }, [targetId, storageKey]);

  function toggle() {
    const next = !slim;
    setSlim(next);
    document
      .getElementById(targetId)
      ?.classList.toggle("rail-slim", next);
    localStorage.setItem(storageKey, next ? "1" : "0");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={slim ? "Expand sidebar" : "Collapse sidebar"}
      className="absolute top-8 -right-px z-10 flex h-[34px] w-[18px] items-center justify-center border border-r-0 border-sidebar-border bg-sidebar-foreground/[0.08] text-[10px] text-sidebar-foreground/60 transition-colors hover:bg-heritage-deep hover:text-sidebar-foreground"
    >
      {slim ? "›" : "‹"}
    </button>
  );
}
