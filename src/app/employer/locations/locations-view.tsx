"use client";

/**
 * LocationsView — the list ⇄ grid switcher for /employer/locations.
 *
 * The server page does auth + data + sort and hands us a prepared array
 * (each location already carries its active-job count). We own the view
 * toggle (persisted in localStorage) and render either the original list
 * rows or a card grid. The sort control is rendered server-side and
 * passed straight through so it keeps working in both views.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, LayoutGrid, List, MapPin } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

export interface LocationCardData {
  id: string;
  name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  logo_url: string | null;
  created_at: string;
  activeJobs: number;
}

type ViewMode = "list" | "grid";
const STORAGE_KEY = "dsohire.locations.view";

export function LocationsView({
  locations,
  sortControl,
}: {
  locations: LocationCardData[];
  sortControl?: ReactNode;
}) {
  // Default to list (matches prior behavior); hydrate the saved choice
  // after mount so server + first client render agree.
  const [view, setView] = useState<ViewMode>("list");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      /* localStorage blocked — keep default */
    }
  }, []);

  function choose(next: ViewMode) {
    setView(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  // Geographic footprint — counts per state, busiest first. Useful for
  // multi-market groups; hidden for tiny single-market DSOs.
  const footprint = useMemo(() => {
    const byState = new Map<string, number>();
    for (const l of locations) {
      const st = (l.state ?? "").trim().toUpperCase();
      if (!st) continue;
      byState.set(st, (byState.get(st) ?? 0) + 1);
    }
    const states = [...byState.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
    return { total: locations.length, stateCount: states.length, states };
  }, [locations]);
  const showFootprint =
    footprint.stateCount >= 2 ||
    (footprint.total >= 5 && footprint.stateCount >= 1);

  return (
    <>
      {showFootprint && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-[var(--rule)] bg-white px-4 py-3">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink">
            <MapPin className="h-3.5 w-3.5 text-heritage" />
            {footprint.total} locations across {footprint.stateCount}{" "}
            {footprint.stateCount === 1 ? "state" : "states"}
          </span>
          <span className="hidden h-3 w-px bg-[var(--rule-strong)] sm:block" />
          <div className="flex flex-wrap gap-1.5">
            {footprint.states.map(([st, n]) => (
              <span
                key={st}
                className="inline-flex items-center gap-1 border border-[var(--rule)] bg-cream/70 px-2 py-0.5 text-[11px] font-semibold text-slate-body"
              >
                {st}
                <span className="font-bold text-heritage-deep">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-3">
        <div
          className="inline-flex border border-[var(--rule-strong)] bg-white"
          role="group"
          aria-label="Choose layout"
        >
          <ViewToggleButton
            active={view === "list"}
            onClick={() => choose("list")}
            label="List view"
          >
            <List className="h-4 w-4" />
          </ViewToggleButton>
          <ViewToggleButton
            active={view === "grid"}
            onClick={() => choose("grid")}
            label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </ViewToggleButton>
        </div>
        {sortControl ?? <span />}
      </div>

      {view === "list" ? (
        <ul className="list-none border-t border-[var(--rule)]">
          {locations.map((loc) => (
            <LocationRowItem key={loc.id} location={loc} />
          ))}
        </ul>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {locations.map((loc) => (
            <LocationCard key={loc.id} location={loc} />
          ))}
        </div>
      )}
    </>
  );
}

function ViewToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={
        "px-2.5 py-2 transition-colors " +
        (active
          ? "bg-ink text-ivory"
          : "text-slate-meta hover:text-ink hover:bg-cream/60")
      }
    >
      {children}
    </button>
  );
}

/* ── List row (carried over from the original page) ── */
function LocationRowItem({ location }: { location: LocationCardData }) {
  const cityState = [location.city, location.state].filter(Boolean).join(", ");
  const street = [location.address_line1, location.address_line2]
    .filter(Boolean)
    .join(", ");
  const activeJobs = location.activeJobs;

  return (
    <li className="border-b border-[var(--rule)]">
      <Link
        href={`/employer/locations/${location.id}`}
        className="group block py-5 hover:bg-cream/40 transition-colors -mx-2 px-2"
      >
        <div className="flex items-start gap-5">
          <Avatar
            name={location.name}
            imageUrl={location.logo_url}
            size="lg"
            className="flex-shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1.5">
              <MapPin className="h-3.5 w-3.5 text-heritage flex-shrink-0" />
              <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                {cityState || "Address incomplete"}
              </span>
            </div>
            <div className="text-[17px] font-extrabold tracking-[-0.3px] text-ink leading-tight mb-1 truncate">
              {location.name}
            </div>
            {street && (
              <div className="text-[13px] tracking-[0.3px] text-slate-meta truncate">
                {street}
                {location.postal_code ? ` · ${location.postal_code}` : ""}
              </div>
            )}
          </div>
          <div className="flex items-center gap-8 text-right flex-shrink-0">
            <div>
              <div className="text-[16px] font-extrabold text-ink leading-none">
                {activeJobs}
              </div>
              <div className="text-[9px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-1">
                {activeJobs === 1 ? "Job" : "Jobs"}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors" />
          </div>
        </div>
      </Link>
    </li>
  );
}

/* ── Grid "place card" ── */
function LocationCard({ location }: { location: LocationCardData }) {
  const cityState = [location.city, location.state].filter(Boolean).join(", ");
  const street = [location.address_line1, location.address_line2]
    .filter(Boolean)
    .join(", ");
  const activeJobs = location.activeJobs;

  return (
    <Link
      href={`/employer/locations/${location.id}`}
      className="group relative block overflow-hidden border border-[var(--rule)] bg-white transition-all hover:border-heritage/40 hover:shadow-[0_10px_28px_-14px_rgba(20,35,63,0.3)]"
    >
      {/* growing left accent on hover */}
      <span className="absolute left-0 top-0 bottom-0 w-[3px] origin-top scale-y-0 bg-heritage transition-transform duration-200 group-hover:scale-y-100" />

      {/* header band — soft heritage wash that fades into the white card
          (no hard border, so the overlapping logo isn't bisected) */}
      <div className="relative h-14 bg-gradient-to-b from-heritage/[0.16] via-heritage/[0.07] to-white">
        <div className="absolute left-4 top-2.5 inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[1.5px] text-heritage-deep">
          <MapPin className="h-3 w-3" />
          {cityState || "Address incomplete"}
        </div>
      </div>

      {/* logo sits ON TOP of the band (z-10) with a white ring */}
      <div className="px-4">
        <div className="relative z-10 -mt-6 mb-2">
          <Avatar
            name={location.name}
            imageUrl={location.logo_url}
            size="xl"
            className="ring-4 ring-white"
          />
        </div>
        <div className="truncate text-[16px] font-extrabold tracking-[-0.3px] leading-tight text-ink">
          {location.name}
        </div>
        <div className="mt-0.5 truncate text-[12.5px] tracking-[0.2px] text-slate-meta">
          {street
            ? `${street}${location.postal_code ? ` · ${location.postal_code}` : ""}`
            : "Address incomplete"}
        </div>
      </div>

      {/* footer — active-jobs pill + View affordance */}
      <div className="mt-3 flex items-center justify-between border-t border-[var(--rule)] px-4 py-3">
        {activeJobs > 0 ? (
          <span className="inline-flex items-center gap-1.5 bg-heritage/[0.10] px-2 py-1 text-[11px] font-bold text-heritage-deep">
            <Briefcase className="h-3 w-3" />
            {activeJobs} active {activeJobs === 1 ? "job" : "jobs"}
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-slate-meta">
            No active jobs
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[1px] text-slate-meta transition-colors group-hover:text-heritage-deep">
          View
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
