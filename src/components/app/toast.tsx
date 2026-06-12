"use client";

/**
 * The DSO Hire toast system — BOH Remodel Lane 1 (Day 32, Model 08).
 *
 * ONE confirmation dialect for the whole app, replacing per-surface
 * ad-hoc banners as each remodel lane adopts it. Speaks the interaction
 * grammar: the heritage accent always means "committed successfully."
 *
 * Usage (per shell, once):
 *   <ToastProvider>…app…</ToastProvider>
 * Anywhere below it:
 *   const toast = useToast();
 *   toast({ title: "Stage moved", body: "Maria → Interview — synced to everyone." });
 *   toast({ kind: "error", title: "Couldn't save", body: msg });
 *
 * Rules:
 *   - Max 3 visible; oldest drops. Auto-dismiss 4s (errors 6s); hover pauses.
 *   - Entrance/exit = transform+opacity only; motion-reduce gets instant.
 *   - NOT mounted anywhere yet — lanes adopt surface by surface, so this
 *     ships with zero behavioral change (foundation-protection rule 6).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type ToastKind = "commit" | "info" | "error";

export interface ToastInput {
  title: string;
  body?: string;
  kind?: ToastKind;
}

interface ToastItem extends ToastInput {
  id: number;
  leaving: boolean;
}

type ToastFn = (t: ToastInput) => void;

const ToastContext = createContext<ToastFn | null>(null);

/** No-op outside a provider so call sites never need guards. */
export function useToast(): ToastFn {
  return useContext(ToastContext) ?? (() => {});
}

const KIND_ACCENT: Record<ToastKind, string> = {
  commit: "border-l-heritage",
  info: "border-l-ink-soft",
  error: "border-l-[#b3543f]",
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    // Two-phase: mark leaving (plays exit transition), then remove.
    setItems((cur) =>
      cur.map((t) => (t.id === id ? { ...t, leaving: true } : t))
    );
    const t = setTimeout(() => {
      setItems((cur) => cur.filter((x) => x.id !== id));
    }, 240);
    timers.current.set(-id, t);
  }, []);

  const toast = useCallback<ToastFn>(
    (input) => {
      const id = nextId++;
      const item: ToastItem = {
        id,
        kind: input.kind ?? "commit",
        title: input.title,
        body: input.body,
        leaving: false,
      };
      setItems((cur) => {
        const next = [...cur, item];
        // Cap the stack at 3 — drop the oldest immediately.
        return next.length > 3 ? next.slice(next.length - 3) : next;
      });
      const ttl = item.kind === "error" ? 6000 : 4000;
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ttl)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const t of map.values()) clearTimeout(t);
    };
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Viewport — above the chat widget (z-[55]) so confirmations are
          never hidden behind an open Messages panel; offset clears the
          collapsed Messages bar + the "?" launcher. */}
      <div
        aria-live="polite"
        className="fixed bottom-24 right-5 z-[60] flex flex-col gap-2 w-[320px] max-w-[calc(100vw-40px)] pointer-events-none"
      >
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            onMouseEnter={() => {
              const h = timers.current.get(t.id);
              if (h) clearTimeout(h);
            }}
            onMouseLeave={() => {
              timers.current.set(
                t.id,
                setTimeout(() => dismiss(t.id), 1600)
              );
            }}
            className={`pointer-events-auto bg-ink text-ivory border-l-[3px] ${KIND_ACCENT[t.kind ?? "commit"]} px-4 py-3 shadow-[0_14px_30px_-12px_rgba(7,15,28,0.45)] transition-all duration-200 ease-out motion-reduce:transition-none ${
              t.leaving
                ? "opacity-0 translate-y-2"
                : "opacity-100 translate-y-0"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-[12.5px] font-bold leading-snug">
                {t.title}
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
                className="text-ivory/50 hover:text-ivory text-[12px] font-bold leading-none mt-0.5"
              >
                ✕
              </button>
            </div>
            {t.body && (
              <div className="text-[11.5px] text-ivory/65 leading-[1.55] mt-1">
                {t.body}
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
