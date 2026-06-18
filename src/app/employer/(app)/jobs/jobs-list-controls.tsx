"use client";

/**
 * JobsListControls — sort selector + location multi-select for the
 * /employer/jobs list. Both controls write to the URL (`?sort=…` and
 * repeated `?loc=<id>` params); the page re-fetches with the filter
 * applied. Hidden when the rail-level location switcher is active
 * (that switcher already narrows to one location, multi-select would
 * be redundant in that mode).
 *
 * Pattern is the same family as the audit-log filters bar — keep
 * filter state in the URL so deep links work, use useTransition so
 * sorting doesn't block typing in other inputs.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, MapPin } from "lucide-react";

interface JobsListControlsProps {
  sortOptions: ReadonlyArray<{ value: string; label: string }>;
  activeSort: string;
  locations: Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  }>;
  activeLocationIds: string[];
  /** When true, hide the location filter (rail-level switcher is active). */
  hideLocationFilter: boolean;
}

export function JobsListControls({
  sortOptions,
  activeSort,
  locations,
  activeLocationIds,
  hideLocationFilter,
}: JobsListControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [locOpen, setLocOpen] = useState(false);

  const setSort = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (value === "updated") params.delete("sort");
    else params.set("sort", value);
    startTransition(() => {
      router.push(`/employer/jobs${params.size ? `?${params.toString()}` : ""}`);
    });
  };

  const toggleLocation = (id: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    const current = params.getAll("loc");
    params.delete("loc");
    if (current.includes(id)) {
      for (const k of current) if (k !== id) params.append("loc", k);
    } else {
      for (const k of current) params.append("loc", k);
      params.append("loc", id);
    }
    startTransition(() => {
      router.push(`/employer/jobs${params.size ? `?${params.toString()}` : ""}`);
    });
  };

  const clearLocations = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("loc");
    startTransition(() => {
      router.push(`/employer/jobs${params.size ? `?${params.toString()}` : ""}`);
    });
  };

  const activeLocCount = activeLocationIds.length;
  const locationsById = new Map(locations.map((l) => [l.id, l]));

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <label className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body">
        Sort
      </label>
      <select
        value={activeSort}
        onChange={(e) => setSort(e.currentTarget.value)}
        disabled={pending}
        className="text-[12px] px-2.5 py-1.5 bg-white border border-[var(--rule-strong)] text-ink focus:outline-none focus:border-heritage min-w-[180px]"
      >
        {sortOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {!hideLocationFilter && locations.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setLocOpen((v) => !v)}
            disabled={pending}
            className={
              "inline-flex items-center gap-2 text-[12px] px-3 py-1.5 border transition-colors " +
              (activeLocCount > 0
                ? "bg-heritage text-ivory border-heritage"
                : "bg-white text-ink border-[var(--rule-strong)] hover:bg-cream")
            }
          >
            <MapPin className="h-3 w-3" />
            {activeLocCount === 0
              ? "All locations"
              : `${activeLocCount} location${activeLocCount === 1 ? "" : "s"}`}
            <ChevronDown className="h-3 w-3" />
          </button>
          {locOpen && (
            <>
              <button
                type="button"
                aria-label="Close locations menu"
                onClick={() => setLocOpen(false)}
                className="fixed inset-0 z-20"
              />
              <div className="absolute right-0 top-full mt-1 z-30 w-[280px] max-w-[calc(100vw-2rem)] max-h-[360px] overflow-y-auto bg-white border border-[var(--rule-strong)] shadow-[0_8px_24px_-8px_rgba(7,15,28,0.15)]">
                <div className="px-3 py-2 border-b border-[var(--rule)] flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
                    Filter by location
                  </span>
                  {activeLocCount > 0 && (
                    <button
                      type="button"
                      onClick={clearLocations}
                      className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-meta hover:text-red-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <ul className="list-none">
                  {locations.map((loc) => {
                    const checked = activeLocationIds.includes(loc.id);
                    return (
                      <li key={loc.id}>
                        <label
                          className={
                            "flex items-start gap-2 px-3 py-2 cursor-pointer transition-colors " +
                            (checked ? "bg-cream" : "hover:bg-cream/60")
                          }
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLocation(loc.id)}
                            className="mt-1 h-3.5 w-3.5 accent-heritage"
                          />
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-ink truncate">
                              {loc.name}
                            </div>
                            {(loc.city || loc.state) && (
                              <div className="text-[11px] text-slate-meta">
                                {[loc.city, loc.state].filter(Boolean).join(", ")}
                              </div>
                            )}
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}
        </div>
      )}

      {/* Active location chips when filtering — render below the
          controls strip on small screens so the row doesn't overflow. */}
      {activeLocCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 ml-auto">
          {activeLocationIds.map((id) => {
            const loc = locationsById.get(id);
            if (!loc) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleLocation(id)}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-heritage/10 border border-heritage/30 text-[10px] font-bold tracking-[0.5px] text-heritage-deep hover:bg-heritage/20"
              >
                {loc.name}
                <span className="text-heritage-deep/70">×</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
