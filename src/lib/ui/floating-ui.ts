"use client";

/**
 * Floating-UI coordinator. Since the Option B merge (2026-07-08) the
 * employer shell has ONE bottom-right launcher (MessengerLauncher), so the
 * old chatOpen/supportDrawerOpen hide-and-raise dance is gone. What remains
 * is the shared mobile-yield signal: a focused text field on phones should
 * hide the floating affordances so they never cover a composer.
 *
 * Tiny module-singleton + useSyncExternalStore so components mounted in
 * separate parts of the shell tree share it without prop drilling.
 */

import { useSyncExternalStore } from "react";

let inputFocused = false;
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

function setInputFocused(v: boolean) {
  if (inputFocused === v) return;
  inputFocused = v;
  emit();
}

/** One lazily-installed document listener tracks whether a text field is
 *  focused. Installed on first useInputFocused() call. */
let focusListenerInstalled = false;
function isTextField(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || node.isContentEditable === true;
}
function ensureFocusListener() {
  if (focusListenerInstalled || typeof document === "undefined") return;
  focusListenerInstalled = true;
  document.addEventListener("focusin", (e) => {
    if (isTextField(e.target)) setInputFocused(true);
  });
  document.addEventListener("focusout", () => {
    // Defer so focus moving between fields doesn't flicker the signal.
    setTimeout(() => setInputFocused(isTextField(document.activeElement)), 0);
  });
}

/** Subscribe to whether a text field is currently focused. */
export function useInputFocused(): boolean {
  ensureFocusListener();
  return useSyncExternalStore(
    subscribe,
    () => inputFocused,
    () => false
  );
}
