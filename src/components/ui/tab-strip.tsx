"use client";

/**
 * TabStrip (design-excellence program 2b, 2026-07-09).
 *
 * The house tab strip, canonized: sentence-case labels, active tab
 * carries the 2px heritage rule (inset underline — never a pill),
 * full role=tablist/tab semantics with roving tabindex + arrow-key
 * navigation. The STRIP is the shareable piece — panel state, deep-link
 * hashes, and keep-mounted logic stay with each consumer (workspace
 * tabs, settings profile, mobile stage tabs all have bespoke needs).
 *
 *   <TabStrip
 *     ariaLabel="Candidate workspace"
 *     tabs={[{ id: "profile", label: "Profile", icon: Briefcase, badge: 2 }]}
 *     activeId={active}
 *     onSelect={setActive}
 *     panelIdFor={(id) => `pane-${id}`}   // aria-controls wiring
 *   />
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface TabStripTab {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** Small count chip after the label (e.g. unread). Hidden when 0/undefined. */
  badge?: number;
}

export function TabStrip({
  tabs,
  activeId,
  onSelect,
  ariaLabel,
  panelIdFor,
  className,
  wrap = false,
}: {
  tabs: TabStripTab[];
  activeId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  /** Maps a tab id to its panel element id (aria-controls). */
  panelIdFor?: (id: string) => string;
  className?: string;
  /** Wrap onto multiple lines (mobile-dense strips) instead of x-scrolling. */
  wrap?: boolean;
}) {
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Roving tabindex + arrow keys (Home/End included) per WAI-ARIA tabs.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = tabs.findIndex((t) => t.id === activeId);
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[next];
    onSelect(tab.id);
    refs.current.get(tab.id)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "flex items-stretch gap-0 border-b border-[var(--rule)]",
        wrap ? "flex-wrap" : "overflow-x-auto",
        className
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) refs.current.set(tab.id, el);
              else refs.current.delete(tab.id);
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active}
            aria-controls={panelIdFor?.(tab.id)}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 px-4 py-2.5 text-xs font-semibold transition-colors",
              active
                ? "text-ink shadow-[inset_0_-2px_0_0_var(--heritage)]"
                : "text-slate-body hover:text-ink"
            )}
          >
            {Icon && <Icon className="size-3.5 shrink-0" aria-hidden />}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center bg-heritage-deep/10 px-1 text-2xs font-extrabold tabular text-heritage-deep">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
