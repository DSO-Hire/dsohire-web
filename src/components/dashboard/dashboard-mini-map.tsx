/**
 * DashboardMiniMap — compact, embedded map widget showing application
 * density across the DSO's locations. Lives in the right half of the
 * dashboard's two-column row, paired with JobLeaderboard on the left.
 *
 * Visual:
 *   - Stylized cream "map canvas" with a faint grid pattern
 *   - One pin per location, positioned by lat/lng (linearly projected
 *     onto the canvas using the bounding box of the supplied locations)
 *   - Pin radius scales with applicationCount via sqrt() so a 9-app
 *     location reads as ~3× the area of a 1-app location, not 9×
 *   - Larger pins use heritage; smaller ones use ink for visual
 *     differentiation
 *   - The top-volume location's pin is rendered last so it sits on top
 *     when multiple pins overlap
 *
 * The whole widget is wrapped in a Link to /jobs (the full map view).
 *
 * Why not embed the actual JobsMap (Mapbox)?
 *   - Loading mapbox-gl on every dashboard hit is a meaningful payload
 *     hit (~600KB JS) for a widget the operator may not interact with.
 *     A static SVG projection is enough to convey "where activity is
 *     concentrated" — full geographic detail is one click away.
 *   - The privacy contract on JobsMap (9-mile circles only) is
 *     specifically for public-facing visibility. The dashboard is
 *     internal-only; we don't need to repeat that treatment here.
 */

import Link from "next/link";

interface MiniMapLocation {
  id: string;
  /** Display label for the pin chip. */
  city: string | null;
  state?: string | null;
  /** Geocoded city centroid. Null = pin is omitted. */
  latitude: number | null;
  longitude: number | null;
  /** Applications received in the window driving the heat scale. */
  applicationCount: number;
}

interface DashboardMiniMapProps {
  locations: MiniMapLocation[];
  /** Click-through destination for the whole widget. */
  href?: string;
  /** Eyebrow title. */
  title?: string;
  /** Footer legend caption. Defaults to "Pin size = applications received in last 30 days". */
  legendCaption?: string;
}

/* Internal projection: lat/lng → x/y inside an SVG-equivalent 1000x600 box
 * with 60px padding on every side. Returns null if the location has no
 * coords or only one location is supplied with zero spread on an axis
 * (we still want to render a single-pin map cleanly — handled inline). */
function projectLocations(locations: MiniMapLocation[]) {
  const W = 1000;
  const H = 600;
  const PAD = 80;
  const usable = locations.filter(
    (l): l is MiniMapLocation & { latitude: number; longitude: number } =>
      l.latitude != null && l.longitude != null,
  );
  if (usable.length === 0) return [];

  if (usable.length === 1) {
    return [
      {
        loc: usable[0],
        x: W / 2,
        y: H / 2,
      },
    ];
  }

  let minLat = Infinity,
    maxLat = -Infinity,
    minLng = Infinity,
    maxLng = -Infinity;
  for (const l of usable) {
    minLat = Math.min(minLat, l.latitude);
    maxLat = Math.max(maxLat, l.latitude);
    minLng = Math.min(minLng, l.longitude);
    maxLng = Math.max(maxLng, l.longitude);
  }
  const latRange = maxLat - minLat || 0.01;
  const lngRange = maxLng - minLng || 0.01;

  return usable.map((loc) => {
    // x ∝ longitude (west = left), y ∝ latitude (north = top)
    const x = PAD + ((loc.longitude - minLng) / lngRange) * (W - PAD * 2);
    const y = PAD + ((maxLat - loc.latitude) / latRange) * (H - PAD * 2);
    return { loc, x, y };
  });
}

export function DashboardMiniMap({
  locations,
  href = "/jobs",
  title = "Application Density",
  legendCaption = "Pin size = applications received in last 30 days",
}: DashboardMiniMapProps) {
  const projected = projectLocations(locations);
  const hasCoords = projected.length > 0;
  const maxApps = Math.max(
    1,
    ...projected.map((p) => p.loc.applicationCount),
  );

  // Sort by applicationCount asc so the highest-volume pin renders last
  // (i.e. on top when overlapping).
  const sorted = [...projected].sort(
    (a, b) => a.loc.applicationCount - b.loc.applicationCount,
  );

  return (
    <Link
      href={href}
      className="group flex flex-col bg-white border border-[var(--rule)] overflow-hidden hover:border-rule-strong transition-colors"
    >
      <header className="flex items-baseline justify-between gap-3 px-6 py-4">
        <h2 className="text-[11px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
          {title}
        </h2>
        <span className="text-[10px] font-extrabold tracking-[1.5px] uppercase text-heritage group-hover:text-heritage-deep transition-colors">
          Open map →
        </span>
      </header>

      <div className="relative border-t border-[var(--rule)] flex-1 min-h-[240px]">
        {hasCoords ? (
          <svg
            viewBox="0 0 1000 600"
            className="w-full h-full block"
            preserveAspectRatio="xMidYMid slice"
            style={{
              background:
                "radial-gradient(ellipse 380px 260px at 35% 50%, #e8e0c8 0%, transparent 70%), radial-gradient(ellipse 280px 200px at 70% 70%, #ddd4b8 0%, transparent 65%), var(--color-cream, #FAF7F1)",
            }}
            role="img"
            aria-label={`Application density map across ${projected.length} locations`}
          >
            {/* Faint grid */}
            <defs>
              <pattern
                id="miniMapGrid"
                width="64"
                height="64"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 64 0 L 0 0 0 64"
                  fill="none"
                  stroke="rgba(0,0,0,0.04)"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect width="1000" height="600" fill="url(#miniMapGrid)" />

            {/* Pins */}
            {sorted.map(({ loc, x, y }) => {
              // Pin radius: sqrt scale so visual area scales with app count.
              const ratio = loc.applicationCount / maxApps;
              const baseR = 22;
              const maxR = 44;
              const r = baseR + (maxR - baseR) * Math.sqrt(ratio);
              const isTop = loc.applicationCount === maxApps;
              const isMid = ratio >= 0.5 && !isTop;
              const fill = isTop
                ? "var(--color-heritage, #4D7A60)"
                : isMid
                  ? "var(--color-heritage-deep, #2F5D4F)"
                  : "var(--color-ink, #14233F)";
              return (
                <g key={loc.id} transform={`translate(${x}, ${y})`}>
                  <circle
                    cx={0}
                    cy={0}
                    r={r}
                    fill={fill}
                    stroke="var(--color-ivory, #F7F4ED)"
                    strokeWidth={3}
                  />
                  <text
                    x={0}
                    y={4}
                    textAnchor="middle"
                    fill="var(--color-ivory, #F7F4ED)"
                    fontFamily="Manrope, sans-serif"
                    fontWeight={800}
                    fontSize={isTop ? 18 : isMid ? 15 : 13}
                    letterSpacing={-0.4}
                  >
                    {loc.applicationCount}
                  </text>
                  {/* City chip below the pin */}
                  {loc.city && (
                    <g transform={`translate(0, ${r + 16})`}>
                      <rect
                        x={-((loc.city.length * 6) + 14) / 2}
                        y={-9}
                        width={(loc.city.length * 6) + 14}
                        height={18}
                        fill="var(--color-ivory, #F7F4ED)"
                        stroke="var(--rule)"
                        strokeWidth={1}
                      />
                      <text
                        x={0}
                        y={3.5}
                        textAnchor="middle"
                        fill="var(--color-ink, #14233F)"
                        fontFamily="Manrope, sans-serif"
                        fontWeight={700}
                        fontSize={11}
                        letterSpacing={0.3}
                      >
                        {loc.city}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          /* Empty state — geocoding not yet run, or no locations on file. */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-cream text-center px-6">
            <div className="text-[13px] text-ink mb-1">
              Add a location to light up the map.
            </div>
            <div className="text-[11px] text-slate-meta">
              Each city becomes a pin sized by application volume.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-6 py-3 border-t border-[var(--rule)] bg-ivory text-[11px] text-slate-meta">
        <span className="block w-2 h-2 bg-heritage flex-shrink-0" />
        <span>{legendCaption}</span>
      </div>
    </Link>
  );
}
