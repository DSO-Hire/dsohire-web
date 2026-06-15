"use client";

/**
 * Floating-UI coordinator — keeps the bottom-right affordances from
 * fighting over the same corner. Three things can live there: the support
 * drawer ("?"), the Messages chat widget, and their launchers.
 *
 * The rule (Lane 8 polish, 2026-06-15):
 *   - support drawer OPEN  → the Messages widget hides (drawer owns the corner)
 *   - chat panel    OPEN  → the "?" launcher hides
 *   - idle                → launchers stack with spacing; "?" dims until hover
 *
 * Tiny module-singleton + useSyncExternalStore so the two components (mounted
 * in separate parts of the shell tree) can coordinate without prop drilling —
 * same pattern as the assistant page-context store.
 */

import { useSyncExternalStore } from "react";

interface FloatingState {
  supportDrawerOpen: boolean;
  chatOpen: boolean;
}

let state: FloatingState = { supportDrawerOpen: false, chatOpen: false };
const SERVER_STATE: FloatingState = { supportDrawerOpen: false, chatOpen: false };
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setSupportDrawerOpen(open: boolean) {
  if (state.supportDrawerOpen === open) return;
  state = { ...state, supportDrawerOpen: open };
  emit();
}

export function setChatOpen(open: boolean) {
  if (state.chatOpen === open) return;
  state = { ...state, chatOpen: open };
  emit();
}

/** Subscribe to whether the support drawer is open. */
export function useSupportDrawerOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.supportDrawerOpen,
    () => SERVER_STATE.supportDrawerOpen
  );
}

/** Subscribe to whether the Messages chat panel is open. */
export function useChatOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.chatOpen,
    () => SERVER_STATE.chatOpen
  );
}
