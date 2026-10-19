"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const KEY = "dsohire-crm-pipeline-view";
const VIEWS = ["board", "compact", "table"];

/* Remembers the last pipeline view per browser. A bare /crm/pipeline visit
   (no view param) restores it; the page renders fine with nothing stored.
   Also opens the New opportunity panel when the URL carries #new. */
export default function ViewMemory({ view, explicit }: { view: string; explicit: boolean }) {
  const router = useRouter();

  useEffect(() => {
    try {
      if (explicit) {
        localStorage.setItem(KEY, view);
        return;
      }
      const stored = localStorage.getItem(KEY);
      if (stored && stored !== "board" && VIEWS.includes(stored)) {
        const p = new URLSearchParams(window.location.search);
        p.set("view", stored);
        router.replace(`/crm/pipeline?${p.toString()}${window.location.hash}`, { scroll: false });
      }
    } catch {
      /* storage blocked: the default board is fine */
    }
  }, [view, explicit, router]);

  useEffect(() => {
    const openNew = () => {
      if (window.location.hash === "#new") {
        const el = document.getElementById("new");
        if (el instanceof HTMLDetailsElement) {
          el.open = true;
          el.querySelector<HTMLSelectElement>("select[name=account_id]")?.focus();
        }
      }
    };
    openNew();
    window.addEventListener("hashchange", openNew);
    return () => window.removeEventListener("hashchange", openNew);
  }, []);

  return null;
}
