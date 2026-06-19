"use client";

/**
 * <NextBestActions> — BOH Remodel Lane 2a (Day 32, Model 01).
 *
 * The ranked action queue at the top of the dashboard, replacing the
 * StuckAlert + StalePipelineAlert banner pair (their data feeds it via
 * lib/dashboard/next-best-actions). Keyboard triage: j/k move the
 * selection, Enter opens the selected card's primary action. Keys are
 * ignored while typing in any input. Renders nothing when the queue is
 * empty — a quiet dashboard is a healthy dashboard.
 *
 * "Done" hides a card client-side only — real state changes happen on
 * the target pages; this is a triage view, not a source of truth.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NbaItem, NbaTone } from "@/lib/dashboard/next-best-actions";

const TONE_RANK: Record<NbaTone, string> = {
  hot: "bg-[#b3543f]",
  fit: "bg-heritage",
  std: "bg-ink",
};
const TONE_EDGE: Record<NbaTone, string> = {
  hot: "border-l-[#b3543f]",
  fit: "border-l-heritage",
  std: "border-l-ink",
};

export function NextBestActions({ items }: { items: NbaItem[] }) {
  const [doneIds, setDoneIds] = useState<Set<string>>(() => new Set());
  const [sel, setSel] = useState(0);
  const router = useRouter();

  const visible = useMemo(
    () => items.filter((i) => !doneIds.has(i.id)),
    [items, doneIds]
  );

  useEffect(() => {
    if (sel >= visible.length) setSel(Math.max(0, visible.length - 1));
  }, [visible.length, sel]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (visible.length === 0) return;
      if (e.key === "j") setSel((s) => Math.min(s + 1, visible.length - 1));
      if (e.key === "k") setSel((s) => Math.max(s - 1, 0));
      if (e.key === "Enter") {
        const item = visible[sel];
        if (item) router.push(item.primary.href);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, sel, router]);

  if (visible.length === 0) return null;

  return (
    <section className="mb-6 border border-[var(--rule)] bg-card">
      <header className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Next best actions
        </span>
        <span className="hidden sm:block text-[10px] text-slate-meta">
          <b className="text-ink">j / k</b> move · <b className="text-ink">Enter</b> open ·
          ranked by impact × urgency
        </span>
      </header>
      <div className="p-2.5" role="list">
        {visible.map((item, i) => (
          <div
            key={item.id}
            role="listitem"
            onClick={() => setSel(i)}
            className={`flex items-start gap-3 border border-[var(--rule)] border-l-[3px] ${TONE_EDGE[item.tone]} bg-cream/70 p-3 mb-2 last:mb-0 cursor-default transition-shadow ${
              i === sel ? "shadow-[0_0_0_2px_var(--color-heritage)] bg-card" : ""
            }`}
          >
            <span
              aria-hidden
              className={`flex-none w-[22px] h-[22px] ${TONE_RANK[item.tone]} text-ivory text-[10px] font-extrabold flex items-center justify-center`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-extrabold tracking-[-0.2px] text-ink leading-snug">
                {item.title}
              </div>
              <div className="text-[11.5px] text-slate-body leading-[1.55] mt-0.5">
                {item.why}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Link
                  href={item.primary.href}
                  className="bg-primary text-primary-foreground text-[10px] font-extrabold px-2.5 py-1.5 hover:bg-primary/90 transition-colors"
                >
                  {item.primary.label}
                </Link>
                {item.secondary && (
                  <Link
                    href={item.secondary.href}
                    className="border border-[var(--rule-strong)] bg-card text-ink text-[10px] font-extrabold px-2.5 py-1.5 hover:border-heritage hover:text-heritage-deep transition-colors"
                  >
                    {item.secondary.label}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDoneIds((cur) => new Set(cur).add(item.id));
                  }}
                  className="ml-auto text-[10px] font-extrabold text-slate-meta hover:text-ink px-2 py-1.5"
                  title="Hide from today's queue (view only — changes nothing)"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
