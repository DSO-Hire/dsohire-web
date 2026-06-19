"use client";

/**
 * JobsStateFilter — multi-select state filter for /jobs's search bar.
 *
 * The /jobs search bar is a plain <form method="get">. We render one hidden
 * <input name="state"> per selected canonical 2-letter code, so the form
 * submits them as a repeated param (?state=KS&state=MO) which Next.js parses
 * into a string[] on the server. When nothing is selected, no hidden inputs
 * render, so the param is absent from the URL entirely (clean shareable URLs).
 *
 * Single-select StateCombobox is intentionally left untouched — it's still
 * used by location create/edit + onboarding where exactly one state is right.
 */

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { US_STATES } from "@/lib/us-states";

interface JobsStateFilterProps {
  /** Canonical 2-letter codes already selected (from the URL). */
  defaultValues: string[];
}

export function JobsStateFilter({ defaultValues }: JobsStateFilterProps) {
  const [selected, setSelected] = React.useState<string[]>(defaultValues);
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return US_STATES;
    return US_STATES.filter(
      (s) => s.code.toLowerCase().startsWith(f) || s.name.toLowerCase().includes(f)
    );
  }, [filter]);

  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  function toggle(code: string) {
    setSelected((cur) =>
      cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]
    );
  }

  const summary =
    selected.length === 0
      ? "Any state"
      : selected.length === 1
        ? `${US_STATES.find((s) => s.code === selected[0])?.name ?? selected[0]} (${selected[0]})`
        : `${selected.length} states`;

  return (
    <>
      {selected.map((code) => (
        <input key={code} type="hidden" name="state" value={code} />
      ))}
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Filter by state"
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              "flex w-full items-center justify-between gap-2 bg-transparent px-0 py-0 text-left text-[14px] text-ink transition-colors focus:outline-none",
              selected.length === 0 && "text-slate-meta"
            )}
          >
            <span className="truncate">{summary}</span>
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-slate-meta" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            sideOffset={8}
            align="start"
            className="z-50 w-(--radix-popover-trigger-width) min-w-[240px] border border-[var(--rule-strong)] bg-popover shadow-[0_18px_44px_-22px_rgba(7,15,28,0.28)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--rule)] p-2">
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search states…"
                aria-label="Search states"
                className="w-full border border-[var(--rule)] bg-cream px-3 py-2 text-[14px] text-ink placeholder:text-slate-meta focus:border-heritage focus:outline-none"
              />
              {selected.length > 0 && (
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSelected([]);
                  }}
                  className="flex shrink-0 items-center gap-1 px-2 py-1 text-[12px] font-semibold uppercase tracking-[0.5px] text-slate-meta hover:text-ink"
                  title="Clear all"
                >
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            <ul role="listbox" aria-multiselectable="true" aria-label="US states" className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-[13px] italic text-slate-meta">No states match.</li>
              ) : (
                filtered.map((s) => {
                  const isSelected = selected.includes(s.code);
                  return (
                    <li
                      key={s.code}
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        toggle(s.code);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 px-3 py-2 text-[14px] hover:bg-cream",
                        isSelected ? "font-semibold text-ink" : "text-ink"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center border",
                          isSelected
                            ? "border-heritage-deep bg-heritage-deep text-primary-foreground"
                            : "border-[var(--rule-strong)] bg-card"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">
                        {s.name}{" "}
                        <span className="tracking-[0.5px] text-slate-meta">({s.code})</span>
                      </span>
                    </li>
                  );
                })
              )}
            </ul>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
}
