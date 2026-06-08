"use client";

/**
 * ScrollToHash — #103 (Day 28).
 *
 * Next's App Router doesn't reliably scroll to a `#hash` when the target
 * section is server-rendered behind data fetching / streaming — so deep-link
 * CTAs (e.g. the candidate dashboard's "Do it" onboarding buttons) would land
 * at the top of the page and make the user hunt for the setting.
 *
 * Drop this client component anywhere on a page that owns `#anchor` sections.
 * On mount (and on hash change) it finds the element and scrolls it into view.
 * `scroll-mt-*` on the target handles the sticky-header offset.
 */

import { useEffect } from "react";

export function ScrollToHash() {
  useEffect(() => {
    const scrollToHash = () => {
      const hash = window.location.hash?.slice(1);
      if (!hash) return;
      // Defer one frame so the section is in the DOM before we measure.
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, []);
  return null;
}
