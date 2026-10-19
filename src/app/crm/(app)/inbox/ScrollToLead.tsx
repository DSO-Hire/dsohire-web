"use client";

import { useEffect } from "react";

/* Search results link to /crm/inbox?lead=<id>: bring that row into view
   once the page paints. The row itself carries the highlight class. */
export default function ScrollToLead({ id }: { id: string }) {
  useEffect(() => {
    const el = document.getElementById(`lead-${id}`);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
  }, [id]);
  return null;
}
