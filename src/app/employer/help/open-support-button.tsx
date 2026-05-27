"use client";

/**
 * OpenSupportButton — tiny client-side button that opens the global
 * SupportLauncher / SupportDrawer by dispatching a synthetic "?" key
 * event. The launcher already listens for the "?" key, so this reuses
 * its open path without lifting state up across server components.
 *
 * Alternative: a global pub/sub (e.g. Zustand store) would let any
 * surface open the drawer directly. For Tier 1, the key-event trick
 * is good enough; if we add more entry points (CommandPalette →
 * "Open support") we should switch to a proper store.
 */

import { MessageSquare } from "lucide-react";

export function OpenSupportButton() {
  function onClick() {
    // The SupportLauncher listens for the "?" key globally; synthesize
    // it so this button shares the same open path.
    const event = new KeyboardEvent("keydown", {
      key: "?",
      bubbles: true,
    });
    window.dispatchEvent(event);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-ink text-ivory px-3.5 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft"
    >
      <MessageSquare className="size-3.5" />
      Open support
    </button>
  );
}
