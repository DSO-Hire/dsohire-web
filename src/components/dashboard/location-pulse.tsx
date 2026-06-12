/**
 * <LocationPulse> — replaces DashboardMiniMap (Cam, Day 32 night: the
 * density map "has never really worked well… it's just a blob").
 *
 * Same data, legible shape: locations ranked by applications received
 * in the last 30 days, with a relative bar and the count. Click any
 * row → Locations. Server-safe; DashboardMiniMap stays on disk for
 * revert per the remodel convention.
 */

import Link from "next/link";

export interface LocationPulseRow {
  id: string;
  /** Practice name — the primary label (city alone is ambiguous when
      multiple practices share a metro; Cam, Day 32 night). */
  name: string;
  city: string | null;
  state: string | null;
  applicationCount: number;
}

export function LocationPulse({
  locations,
  href,
}: {
  locations: LocationPulseRow[];
  href: string;
}) {
  const ranked = [...locations]
    .sort((a, b) => b.applicationCount - a.applicationCount)
    .slice(0, 8);
  const max = Math.max(1, ...ranked.map((l) => l.applicationCount));

  return (
    <section className="border border-[var(--rule)] bg-white flex flex-col">
      <header className="px-5 py-4 border-b border-[var(--rule)] flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Applications by location — 30 days
        </span>
        <Link
          href={href}
          className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors shrink-0"
        >
          View locations →
        </Link>
      </header>
      {ranked.length === 0 ? (
        <div className="px-5 py-8 text-[12.5px] text-slate-body leading-relaxed">
          Add locations and they&apos;ll rank here by application volume.
        </div>
      ) : (
        <div className="p-2.5">
          {ranked.map((l) => {
            const cityState =
              [l.city, l.state].filter(Boolean).join(", ") || null;
            return (
              <Link
                key={l.id}
                href={href}
                title={cityState ?? undefined}
                className="flex items-center gap-3 px-2.5 py-2.5 hover:bg-cream/70 transition-colors"
              >
                <span className="text-[12.5px] font-bold text-ink w-[38%] truncate">
                  {l.name || cityState || "Location"}
                </span>
                <span className="flex-1 h-[10px] bg-cream relative">
                  <span
                    className="absolute inset-y-0 left-0 bg-heritage"
                    style={{
                      width: `${Math.max(
                        l.applicationCount > 0 ? 6 : 0,
                        (l.applicationCount / max) * 100
                      )}%`,
                    }}
                  />
                </span>
                <span className="text-[12px] font-extrabold text-ink tabular-nums w-7 text-right">
                  {l.applicationCount}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
