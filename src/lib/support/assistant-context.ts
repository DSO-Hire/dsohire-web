"use client";

/**
 * Assistant page-context store (Lane 8 Assistant 2.0 — Commit 1).
 *
 * A tiny client-side external store that pages register their "currently
 * focused entity" into, so the support drawer/assistant knows what the
 * user is looking at without being told ("why is HER fit 84" needs no
 * explanation). Module-singleton + useSyncExternalStore avoids any
 * provider placement surgery — the launcher (drawer) and the pages live
 * in separate parts of the tree.
 *
 * Authority note: the `label`/`secondary` carried here are DISPLAY ONLY
 * (the page already masked them). The drawer sends {kind,id,label,...} to
 * /api/support/chat, but the SERVER verifies the id under RLS before
 * trusting it — the label is never used for authority.
 */

import { useEffect, useSyncExternalStore } from "react";

export type AssistantContextKind = "application" | "job" | "board" | "candidate";

export interface AssistantPageContext {
  kind: AssistantContextKind;
  /** UUID of the focused entity. Verified server-side under RLS. */
  id: string;
  /** Display label for the drawer chip (cosmetic; already masked upstream). */
  label: string;
  /** Optional secondary line, e.g. "RDA · Chandler (Screening)". */
  secondary?: string;
}

let current: AssistantPageContext | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function setAssistantContext(ctx: AssistantPageContext | null) {
  current = ctx;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): AssistantPageContext | null {
  return current;
}

function getServerSnapshot(): AssistantPageContext | null {
  return null;
}

/** Read the current page context (drawer side). */
export function useAssistantContext(): AssistantPageContext | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Register the current page's focused entity. Sets on mount and whenever
 * the content changes; clears on unmount — but only if we're still the
 * active context, so a newly-mounted page that set its own context during
 * a route change isn't clobbered by the unmounting page's cleanup.
 */
export function useRegisterAssistantContext(ctx: AssistantPageContext | null) {
  const key = ctx
    ? `${ctx.kind}:${ctx.id}:${ctx.label}:${ctx.secondary ?? ""}`
    : null;
  useEffect(() => {
    const mine = ctx;
    setAssistantContext(mine);
    return () => {
      if (current === mine) setAssistantContext(null);
    };
    // key captures every field we read; ctx identity is stable per key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
