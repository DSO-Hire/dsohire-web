"use client";

/**
 * NavScrollState: drives the marketing nav's scroll behavior by setting
 * data attributes on its parent <nav> (no re-renders, one rAF-throttled
 * listener):
 *   data-scrolled  past 12px, the glass firms up and gains a soft shadow
 *   data-hidden    scrolling DOWN past 420px tucks the nav away; any
 *                  scroll up brings it straight back (EDC pattern)
 * CSS lives in globals.css (.site-nav). Reduced motion keeps it pinned.
 * Focus inside the nav always shows it (keyboard users never lose it).
 */

import { useEffect, useRef } from "react";

export function NavScrollState() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const nav = ref.current?.closest("nav");
    if (!nav) return;
    let lastY = window.scrollY;
    let ticking = false;

    const update = () => {
      ticking = false;
      const y = window.scrollY;
      nav.dataset.scrolled = String(y > 12);
      const drawerOpen = document.documentElement.dataset.menuOpen === "true";
      if (y < 420 || y < lastY - 2 || drawerOpen) nav.dataset.hidden = "false";
      else if (y > lastY + 2) nav.dataset.hidden = "true";
      lastY = y;
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return <span ref={ref} hidden />;
}
