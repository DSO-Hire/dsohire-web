"use client";

/**
 * LocationFilter — "All practices ↔ single practice" selector for the
 * analytics hub. Navigating sets ?loc=<id> (or clears it), preserving the
 * active tab + window, so the entire hub re-scopes to one practice.
 */

import { useRouter } from "next/navigation";

export interface LocationOpt {
  id: string;
  name: string;
  city: string | null;
}

export function LocationFilter({
  locations,
  value,
  tab,
  window,
}: {
  locations: LocationOpt[];
  value: string;
  tab: string;
  window: string;
}) {
  const router = useRouter();
  if (locations.length < 2) return null;
  return (
    <label className="inline-flex items-center gap-2 text-[11px] text-slate-meta">
      <span className="font-semibold uppercase tracking-[0.5px]">Practice</span>
      <select
        value={value}
        onChange={(e) => {
          const loc = e.target.value;
          const params = new URLSearchParams();
          params.set("tab", tab);
          params.set("window", window);
          if (loc) params.set("loc", loc);
          router.push(`/employer/analytics?${params.toString()}`);
        }}
        className="h-8 max-w-[220px] px-2 bg-card border border-[var(--rule-strong)] text-ink text-[12px] focus:outline-none focus:border-ink"
      >
        <option value="">All practices</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
            {l.city ? ` · ${l.city}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
