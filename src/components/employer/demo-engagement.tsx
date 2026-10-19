"use client";

/**
 * DemoEngagement: counts a demo open only when a real person is there.
 * Email security scanners and link previews load the /demo link without
 * anyone reading it, so the open is reported after a trusted input event
 * (pointer, touch, wheel, scroll or key) with the tab visible and at least
 * a few seconds on the page. Once per browser session. Renders nothing.
 */
import { useEffect } from "react";

const FLAG = "dh_demo_engaged";
const MIN_MS = 3000;
const EVENTS = ["pointermove", "pointerdown", "touchstart", "wheel", "scroll", "keydown"] as const;

export function DemoEngagement() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(FLAG)) return;
    } catch {
      /* storage blocked: the server cookie still dedupes */
    }
    const start = performance.now();
    let sent = false;
    const onEvent = (e: Event) => {
      if (sent || !e.isTrusted || document.visibilityState !== "visible") return;
      if (performance.now() - start < MIN_MS) return;
      sent = true;
      cleanup();
      try {
        sessionStorage.setItem(FLAG, "1");
      } catch {
        /* ignore */
      }
      void fetch("/demo/engaged", { method: "POST", keepalive: true }).catch(() => {});
    };
    const cleanup = () => EVENTS.forEach((t) => window.removeEventListener(t, onEvent, true));
    EVENTS.forEach((t) => window.addEventListener(t, onEvent, { capture: true, passive: true }));
    return cleanup;
  }, []);
  return null;
}
