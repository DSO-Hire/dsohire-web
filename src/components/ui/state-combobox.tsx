"use client";

/**
 * StateCombobox — searchable combobox of all 50 US states + DC.
 *
 * Forces canonical 2-letter uppercase codes on input (matches the
 * dso_locations.state CHECK constraint added in 20260504000004). Used in:
 *   - /jobs           (public job board state filter)
 *   - /employer/locations/new + /[id]    (location create/edit)
 *   - /employer/onboarding              (first-location form)
 *
 * Built on radix Popover + native filtering. Renders a hidden <input
 * name={name}> so it submits inside any plain <form action=…>. Each list item
 * displays "Full Name (XX)" so typing "MO", "Missouri", or "miss" all match.
 *
 * Accessibility: combobox + listbox roles, aria-activedescendant, full
 * keyboard navigation (Enter/Space to open, arrows to navigate, Enter to
 * pick, Esc to close).
 */

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StateOption {
  code: string;
  name: string;
}

export const US_STATES: readonly StateOption[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

/** Returns the canonical 2-letter code for a free-text input, or null if no match. */
export function normalizeStateInput(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase();
  if (US_STATES.some((s) => s.code === upper)) return upper;
  const lower = trimmed.toLowerCase();
  const byName = US_STATES.find((s) => s.name.toLowerCase() === lower);
  return byName?.code ?? null;
}

interface StateComboboxProps {
  value: string | null;
  onValueChange: (state: string | null) => void;
  placeholder?: string;
  /** When set, a hidden input with this name is rendered so the value submits with the parent form. */
  name?: string;
  /** Optional id on the trigger button (useful for <label htmlFor=…>). */
  id?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  /** When true, the list omits the "Clear selection" row — for required fields. */
  hideClear?: boolean;
}

export function StateCombobox({
  value,
  onValueChange,
  placeholder = "Select state",
  name,
  id,
  disabled,
  className,
  required,
  hideClear,
}: StateComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [activeIdx, setActiveIdx] = React.useState(0);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listboxId = React.useId();

  const filtered = React.useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return US_STATES;
    return US_STATES.filter(
      (s) =>
        s.code.toLowerCase().startsWith(f) ||
        s.name.toLowerCase().includes(f)
    );
  }, [filter]);

  // Reset active index when the filter changes or the panel opens.
  React.useEffect(() => {
    setActiveIdx(0);
  }, [filter, open]);

  // Focus the filter input when the panel opens.
  React.useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Keep the active row scrolled into view.
  React.useEffect(() => {
    if (!open || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLLIElement>(
      `[data-idx="${activeIdx}"]`
    );
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  const selected = value ? US_STATES.find((s) => s.code === value) : null;

  function commit(state: StateOption | null) {
    onValueChange(state?.code ?? null);
    setOpen(false);
    setFilter("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIdx(Math.max(0, filtered.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = filtered[activeIdx];
      if (pick) commit(pick);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setFilter("");
    }
  }

  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value ?? ""}
          // Browsers don't enforce `required` on hidden inputs, so the
          // requirement falls to whichever wrapper validates the form data.
          // We keep it here for documentation / a11y consumers.
          aria-required={required ? "true" : undefined}
        />
      )}
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={placeholder}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              !selected && "text-slate-meta",
              className
            )}
          >
            <span className="truncate text-left">
              {selected ? `${selected.name} (${selected.code})` : placeholder}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-meta flex-shrink-0" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            sideOffset={4}
            align="start"
            className="z-50 w-(--radix-popover-trigger-width) min-w-[220px] bg-white border border-[var(--rule-strong)] shadow-[0_18px_44px_-22px_rgba(7,15,28,0.28)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
            onOpenAutoFocus={(e) => {
              // We focus the filter input ourselves via the effect above.
              e.preventDefault();
            }}
          >
            <div className="p-2 border-b border-[var(--rule)]">
              <input
                ref={inputRef}
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search states…"
                aria-label="Search states"
                aria-autocomplete="list"
                aria-controls={listboxId}
                aria-activedescendant={
                  filtered[activeIdx]
                    ? `${listboxId}-${filtered[activeIdx].code}`
                    : undefined
                }
                className="w-full px-3 py-2 bg-cream border border-[var(--rule)] text-ink text-[13px] placeholder:text-slate-meta focus:outline-none focus:border-heritage transition-colors"
              />
            </div>
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-label="US states"
              className="max-h-64 overflow-y-auto py-1"
            >
              {!hideClear && (
                <li
                  role="option"
                  aria-selected={!value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(null);
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] tracking-[0.5px] uppercase font-semibold text-slate-meta hover:bg-cream cursor-pointer"
                >
                  <X className="h-3 w-3" />
                  Clear selection
                </li>
              )}
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-[12px] text-slate-meta italic">
                  No states match.
                </li>
              ) : (
                filtered.map((s, idx) => {
                  const isActive = idx === activeIdx;
                  const isSelected = value === s.code;
                  return (
                    <li
                      key={s.code}
                      id={`${listboxId}-${s.code}`}
                      data-idx={idx}
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onMouseDown={(e) => {
                        // mousedown (not click) so the focus shift doesn't
                        // close the popover before the click registers.
                        e.preventDefault();
                        commit(s);
                      }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer",
                        isActive ? "bg-cream" : "bg-white",
                        isSelected ? "text-ink font-semibold" : "text-ink"
                      )}
                    >
                      <span className="flex-1 truncate">
                        {s.name}{" "}
                        <span className="text-slate-meta tracking-[0.5px]">
                          ({s.code})
                        </span>
                      </span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-heritage-deep flex-shrink-0" />
                      )}
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
