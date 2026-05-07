"use client";

/**
 * LocationSwitcher — multi-location dropdown for the sidebar context block
 * (Phase 4.6.d). Sits above the nav. Pressing it opens a list of every
 * location plus an "All locations" option; selecting writes a cookie via
 * the setActiveLocation server action and re-runs the layout (which
 * picks up the new active location in the next render).
 *
 * Why client-side dropdown state: the trigger button needs hover/open
 * affordance. The actual write is server-driven so RLS validates the
 * choice and revalidatePath() refreshes everything that filters by
 * location.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Loader2, MapPin } from "lucide-react";
import { setActiveLocation } from "@/lib/employer/active-location-actions";

export interface LocationOption {
  id: string;
  name: string;
  /** Optional sub-label (e.g. "Indianapolis, IN") */
  subtitle?: string | null;
}

interface LocationSwitcherProps {
  locations: LocationOption[];
  /** Active location id, or null for "All locations". */
  activeLocationId: string | null;
}

export function LocationSwitcher({
  locations,
  activeLocationId,
}: LocationSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Close on Esc or outside click.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.parentElement?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const activeLocation = activeLocationId
    ? locations.find((l) => l.id === activeLocationId) ?? null
    : null;
  const activeLabel = activeLocation?.name ?? "All locations";

  const onSelect = (locationId: string | null) => {
    setOpen(false);
    startTransition(async () => {
      await setActiveLocation({ locationId });
      router.refresh();
    });
  };

  // No locations to switch between → render a static badge.
  if (locations.length === 0) {
    return (
      <div className="px-3 py-2 text-[10px] tracking-[1.5px] uppercase text-ivory/40 inline-flex items-center gap-1.5">
        <MapPin className="size-3" />
        No locations yet
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 rounded text-left text-[12px] font-semibold text-ivory/85 hover:bg-white/5 hover:text-ivory transition-colors disabled:opacity-50"
      >
        <MapPin className="size-3.5 flex-shrink-0 text-heritage" />
        <span className="flex-1 truncate">
          {pending ? "Switching…" : `Viewing: ${activeLabel}`}
        </span>
        {pending ? (
          <Loader2 className="size-3 animate-spin flex-shrink-0" />
        ) : (
          <ChevronsUpDown className="size-3 flex-shrink-0 text-ivory/50" />
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Switch location"
          className="absolute left-2 right-2 top-full mt-1 z-40 max-h-[320px] overflow-y-auto rounded border border-white/15 bg-ink-soft shadow-xl"
        >
          <SwitcherOption
            label="All locations"
            subtitle={`${locations.length} ${locations.length === 1 ? "location" : "locations"}`}
            isActive={activeLocationId === null}
            onSelect={() => onSelect(null)}
          />
          <li className="border-t border-white/10 my-1" />
          {locations.map((loc) => (
            <SwitcherOption
              key={loc.id}
              label={loc.name}
              subtitle={loc.subtitle ?? null}
              isActive={loc.id === activeLocationId}
              onSelect={() => onSelect(loc.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SwitcherOption({
  label,
  subtitle,
  isActive,
  onSelect,
}: {
  label: string;
  subtitle: string | null;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={isActive}
        onClick={onSelect}
        className={
          "w-full flex items-start gap-2 px-3 py-2 text-left transition-colors " +
          (isActive
            ? "bg-white/10 text-ivory"
            : "text-ivory/75 hover:bg-white/5 hover:text-ivory")
        }
      >
        <Check
          className={
            "size-3.5 mt-0.5 flex-shrink-0 " +
            (isActive ? "text-heritage" : "text-transparent")
          }
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold leading-tight truncate">
            {label}
          </span>
          {subtitle && (
            <span className="block text-[10px] tracking-[0.5px] text-ivory/50 truncate mt-0.5">
              {subtitle}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
