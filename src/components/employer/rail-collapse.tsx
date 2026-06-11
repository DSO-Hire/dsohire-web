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
 */

import { useEffect, useState } from "react";

const KEY = "dsoh-rail-slim";

export function RailCollapse() {
  const [slim, setSlim] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(KEY) === "1") {
      setSlim(true);
      document.getElementById("employer-rail")?.classList.add("rail-slim");
    }
  }, []);

  function toggle() {
    const next = !slim;
    setSlim(next);
    document
      .getElementById("employer-rail")
      ?.classList.toggle("rail-slim", next);
    localStorage.setItem(KEY, next ? "1" : "0");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={slim ? "Expand sidebar" : "Collapse sidebar"}
      className="absolute top-8 -right-px z-10 flex h-[34px] w-[18px] items-center justify-center border border-r-0 border-white/15 bg-white/[0.08] text-[10px] text-ivory/60 transition-colors hover:bg-heritage-deep hover:text-ivory"
    >
      {slim ? "›" : "‹"}
    </button>
  );
}
