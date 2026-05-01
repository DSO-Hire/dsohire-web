"use client";

/**
 * JobsMap — privacy-preserving map view of open roles for the public /jobs page.
 *
 * Privacy contract: every dso_location renders as a translucent ~9-mile circle
 * (heritage-green fill, navy outline) at the city centroid we geocoded.
 * Coordinates are derived from city + state ONLY — never from a street address.
 * The actual office is "somewhere inside the circle" and our DB never stores
 * precise coordinates.
 *
 * UX:
 *   - "Use my location" CTA → recenters the map on the user's coords (not stored)
 *   - Click a circle → opens a side drawer listing the jobs at that location
 *   - Drawer cards link to /jobs/[id]
 *
 * mapbox-gl is browser-only (it touches window/document at import time). We
 * dynamic-import the JS inside a useEffect so it only runs in the browser.
 * The CSS is statically imported at the top so Next bundles it into the
 * client CSS chunk.
 */

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Locate, X, MapPin } from "lucide-react";

/* mapbox-gl is dynamically imported in the effect (browser-only). We avoid
 * a static type import here so this file compiles in environments where
 * @types/mapbox-gl hasn't been resolved yet (e.g. mid-install). The runtime
 * surface we use (Map, GeoJSONSource, LngLatBounds) is narrow enough that
 * the loose typings inside the effect are fine. */
type MapboxMap = {
  remove(): void;
  on(event: string, handler: (e: unknown) => void): void;
  on(event: string, layerId: string, handler: (e: unknown) => void): void;
  addControl(control: unknown, position?: string): void;
  addLayer(layer: unknown): void;
  addSource(id: string, source: unknown): void;
  getSource(id: string): unknown;
  getCanvas(): { style: { cursor: string } };
  fitBounds(bounds: unknown, options?: unknown): void;
  flyTo(options: unknown): void;
  setStyle(style: string): void;
};
type GeoJSONSourceLike = {
  setData(data: unknown): void;
};

export interface JobsMapLocation {
  /** dso_locations.id */
  id: string;
  /** dso_locations.name (e.g. "Downtown Overland Park") */
  name: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  /** Active jobs tagged at this location. */
  jobs: Array<{
    id: string;
    title: string;
    employment_type: string;
    role_category: string;
    dso_id: string;
    dso_name: string;
  }>;
}

interface JobsMapProps {
  locations: JobsMapLocation[];
  mapboxToken: string | null;
}

/* Approx 9 miles in meters — 14,484 m. The radius circle is rendered as a
 * GeoJSON polygon approximation so we don't need a turf.js dependency. */
const RADIUS_METERS = 14_484;
const CIRCLE_VERTICES = 64;

/* Available Mapbox styles — picker UI lets the user toggle. Privacy is
 * preserved across all of them because the ~9-mile circle dwarfs any
 * individual building even at high zoom. */
const MAP_STYLES = [
  { id: "light", label: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { id: "streets", label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
  {
    id: "satellite-streets",
    label: "Satellite",
    url: "mapbox://styles/mapbox/satellite-streets-v12",
  },
  { id: "outdoors", label: "Outdoors", url: "mapbox://styles/mapbox/outdoors-v12" },
] as const;
type MapStyleId = (typeof MAP_STYLES)[number]["id"];
const DEFAULT_STYLE_ID: MapStyleId = "light";
const STYLE_STORAGE_KEY = "dsohire:map-style";

const ROLE_LABELS: Record<string, string> = {
  dentist: "Dentist",
  dental_hygienist: "Dental Hygienist",
  dental_assistant: "Dental Assistant",
  front_office: "Front Office",
  office_manager: "Office Manager",
  regional_manager: "Regional Manager",
  specialist: "Specialist",
  other: "Other",
};

const EMP_LABELS: Record<string, string> = {
  full_time: "Full Time",
  part_time: "Part Time",
  contract: "Contract",
  prn: "PRN",
  locum: "Locum",
};

export function JobsMap({ locations, mapboxToken }: JobsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const initialFitDoneRef = useRef(false);
  /* Latest locations kept in a ref so the style.load handler (attached once
   * at init) always re-attaches layers using the freshest data. */
  const locationsRef = useRef<JobsMapLocation[]>(locations);
  locationsRef.current = locations;

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleId, setMapStyleId] =
    useState<MapStyleId>(DEFAULT_STYLE_ID);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedLocationId) ?? null,
    [locations, selectedLocationId]
  );

  /* ── Hydrate style preference from localStorage on mount ────── */
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STYLE_STORAGE_KEY);
      if (stored && MAP_STYLES.some((s) => s.id === stored)) {
        setMapStyleId(stored as MapStyleId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /* ── Initialize map ────────────────────────────────────────── */
  useEffect(() => {
    if (!mapboxToken) return;
    if (!containerRef.current) return;
    if (mapRef.current) return; // already initialized

    let cancelled = false;

    (async () => {
      // Browser-only library — dynamic import so the bundle only loads
      // client-side. Typed as `any` because @types/mapbox-gl resolution is
      // unstable in our local node_modules state; Vercel's clean install
      // gets real types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapboxgl: any = (await import("mapbox-gl")).default;

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = mapboxToken;

      const initialStyleUrl =
        MAP_STYLES.find((s) => s.id === mapStyleId)?.url ?? MAP_STYLES[0].url;

      // Default to a US-wide view; auto-fit to the location bounds once data
      // is loaded below.
      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: initialStyleUrl,
        center: [-98.5, 39.5],
        zoom: 3.6,
        attributionControl: false,
      });

      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right"
      );
      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right"
      );

      mapRef.current = map;

      // style.load fires on every style load, including the initial one and
      // every subsequent setStyle() call. We re-attach our source + layers
      // here because Mapbox wipes them on style change. Read locations from
      // the ref so the handler always sees the latest prop value.
      map.on("style.load", () => {
        if (cancelled) return;
        const currentLocations = locationsRef.current;
        attachLocationLayers(map, currentLocations);
        wireLayerInteractions(map, setSelectedLocationId);

        // Initial auto-fit only — subsequent style changes preserve the
        // user's zoom / pan.
        if (!initialFitDoneRef.current && currentLocations.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          for (const loc of currentLocations) {
            bounds.extend([loc.longitude, loc.latitude]);
          }
          map.fitBounds(bounds, {
            padding: { top: 80, bottom: 80, left: 80, right: 80 },
            maxZoom: 9,
            duration: 0,
          });
          initialFitDoneRef.current = true;
        }

        setMapReady(true);
      });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken]);

  /* ── Apply style changes after init ────────────────────────── */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const url = MAP_STYLES.find((s) => s.id === mapStyleId)?.url;
    if (!url) return;
    mapRef.current.setStyle(url);
    // Persist preference
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STYLE_STORAGE_KEY, mapStyleId);
      } catch {
        /* ignore */
      }
    }
  }, [mapStyleId, mapReady]);

  /* ── Refresh data when locations prop changes ──────────────── */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource(
      "dsohire-locations"
    ) as GeoJSONSourceLike | undefined;
    /* Source may not exist during a style swap — the next style.load will
     * re-attach with fresh locations from locationsRef, so it's safe to skip. */
    if (!source) return;
    source.setData(buildLocationFeatures(locations));
  }, [locations, mapReady]);

  /* ── Use my location ───────────────────────────────────────── */
  const handleLocateMe = () => {
    setLocateError(null);
    if (!navigator.geolocation) {
      setLocateError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        if (!mapRef.current) return;
        mapRef.current.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 8,
          duration: 1000,
        });
      },
      (err) => {
        setLocating(false);
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Enable it in your browser settings."
            : "Couldn't get your location. Try again."
        );
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 }
    );
  };

  if (!mapboxToken) {
    return (
      <div className="border border-[var(--rule)] bg-cream p-12 text-center">
        <MapPin className="h-6 w-6 text-heritage-deep mx-auto mb-3" />
        <p className="text-[14px] text-ink font-semibold mb-1">
          Map view isn&apos;t configured yet.
        </p>
        <p className="text-[12px] text-slate-meta">
          The map provider token is missing. Switch back to the list view to
          browse roles.
        </p>
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="border border-[var(--rule)] bg-cream p-12 text-center">
        <MapPin className="h-6 w-6 text-heritage-deep mx-auto mb-3" />
        <p className="text-[14px] text-ink font-semibold mb-1">
          No mapped locations yet.
        </p>
        <p className="text-[12px] text-slate-meta">
          Active job locations will show up here as soon as they&apos;re
          geocoded.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Map canvas */}
      <div
        ref={containerRef}
        className="w-full h-[640px] border border-[var(--rule)] bg-cream"
        style={{ borderRadius: 0 }}
      />

      {/* Top-left controls — locate + style picker */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 items-start">
        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locating}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-ivory border border-[var(--rule-strong)] text-ink text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors shadow-sm disabled:opacity-60"
        >
          <Locate className="h-3.5 w-3.5" />
          {locating ? "Locating…" : "Use my location"}
        </button>
        {locateError && (
          <div className="bg-red-50 border-l-2 border-red-500 px-3 py-2 text-[11px] text-red-900 max-w-[260px] shadow-sm">
            {locateError}
          </div>
        )}

        {/* Style picker */}
        <div
          className="inline-flex border border-[var(--rule-strong)] bg-ivory shadow-sm"
          role="group"
          aria-label="Map style"
        >
          {MAP_STYLES.map((style, idx) => (
            <button
              key={style.id}
              type="button"
              onClick={() => setMapStyleId(style.id)}
              aria-pressed={mapStyleId === style.id}
              className={
                "px-3 py-2 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors " +
                (idx > 0 ? "border-l border-[var(--rule-strong)] " : "") +
                (mapStyleId === style.id
                  ? "bg-ink text-ivory"
                  : "text-slate-body hover:text-ink hover:bg-cream")
              }
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      {/* Privacy footnote — overlay bottom-left */}
      <div className="absolute bottom-4 left-4 bg-ivory/90 backdrop-blur-sm border border-[var(--rule)] px-3 py-2 max-w-[320px] text-[10px] text-slate-body leading-snug">
        <span className="font-bold text-ink">Privacy:</span> circles are ~9
        miles wide and centered on the city, not the office address.
      </div>

      {/* Side drawer */}
      {selectedLocation && (
        <div
          className="absolute top-0 right-0 bottom-0 w-full sm:w-[400px] bg-white border-l border-[var(--rule)] shadow-lg overflow-y-auto"
          role="dialog"
          aria-label={`Jobs at ${selectedLocation.name}`}
        >
          <div className="p-6 sm:p-7">
            <button
              type="button"
              onClick={() => setSelectedLocationId(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              Jobs at this location
            </div>
            <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink leading-tight mb-1.5">
              {selectedLocation.name}
            </h2>
            <p className="text-[12px] text-slate-meta tracking-[0.3px] mb-6">
              {[selectedLocation.city, selectedLocation.state]
                .filter(Boolean)
                .join(", ") || "Location unavailable"}
            </p>

            {selectedLocation.jobs.length === 0 ? (
              <p className="text-[13px] text-slate-meta italic">
                No active jobs at this location right now.
              </p>
            ) : (
              <ul className="space-y-3 list-none">
                {selectedLocation.jobs.map((job) => (
                  <li key={job.id}>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="block p-4 border border-[var(--rule)] hover:border-heritage hover:bg-cream/50 transition-colors group"
                    >
                      <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-1">
                        {ROLE_LABELS[job.role_category] ?? job.role_category} ·{" "}
                        {EMP_LABELS[job.employment_type] ?? job.employment_type}
                      </div>
                      <div className="text-[15px] font-semibold text-ink leading-snug mb-1">
                        {job.title}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-slate-body">
                          {job.dso_name}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-heritage-deep opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Source + layer attachment.
 *
 * Called from the `style.load` event so it runs both on initial map
 * creation AND every time the user switches styles (Mapbox wipes custom
 * sources/layers on setStyle, so we re-add them here).
 * ───────────────────────────────────────────────────────────── */

function buildLocationFeatures(locations: JobsMapLocation[]): unknown {
  const features = locations.flatMap((loc) => [
    {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [buildCircle(loc.longitude, loc.latitude, RADIUS_METERS)],
      },
      properties: {
        kind: "circle",
        id: loc.id,
        jobCount: loc.jobs.length,
      },
    },
    {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [loc.longitude, loc.latitude],
      },
      properties: {
        kind: "label",
        id: loc.id,
        jobCount: loc.jobs.length,
        label:
          loc.jobs.length === 1 ? "1 role" : `${loc.jobs.length} roles`,
      },
    },
  ]);
  return { type: "FeatureCollection", features };
}

function attachLocationLayers(
  map: MapboxMap,
  locations: JobsMapLocation[]
): void {
  map.addSource("dsohire-locations", {
    type: "geojson",
    data: buildLocationFeatures(locations),
  });

  // Heritage-green fill
  map.addLayer({
    id: "dsohire-locations-fill",
    type: "fill",
    source: "dsohire-locations",
    filter: ["==", ["get", "kind"], "circle"],
    paint: {
      "fill-color": "#4D7A60",
      "fill-opacity": 0.22,
    },
  });
  // Navy outline
  map.addLayer({
    id: "dsohire-locations-line",
    type: "line",
    source: "dsohire-locations",
    filter: ["==", ["get", "kind"], "circle"],
    paint: {
      "line-color": "#14233F",
      "line-width": 1.5,
      "line-opacity": 0.65,
    },
  });
  // Job-count label at center
  map.addLayer({
    id: "dsohire-locations-label",
    type: "symbol",
    source: "dsohire-locations",
    filter: ["==", ["get", "kind"], "label"],
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 12,
      "text-allow-overlap": false,
    },
    paint: {
      "text-color": "#14233F",
      "text-halo-color": "#F7F4ED",
      "text-halo-width": 2,
    },
  });
}

function wireLayerInteractions(
  map: MapboxMap,
  setSelectedLocationId: (id: string | null) => void
): void {
  map.on("click", "dsohire-locations-fill", (e: unknown) => {
    const feature = (
      e as { features?: Array<{ properties?: { id?: string } }> }
    ).features?.[0];
    if (!feature) return;
    const id = feature.properties?.id;
    if (id) setSelectedLocationId(id);
  });
  map.on("mouseenter", "dsohire-locations-fill", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "dsohire-locations-fill", () => {
    map.getCanvas().style.cursor = "";
  });
}

/* ───────────────────────────────────────────────────────────────
 * Approximate a circle on a sphere as a closed polygon.
 *
 * For radii under ~50 miles in continental US latitudes, a flat-earth
 * approximation with a latitude-aware longitude scale is accurate to
 * within a few percent — well inside the privacy "fuzz" we want. We use
 * 64 vertices for visually smooth circles.
 * ───────────────────────────────────────────────────────────── */

function buildCircle(
  lng: number,
  lat: number,
  radiusMeters: number
): Array<[number, number]> {
  const earthRadius = 6_378_137; // meters (WGS84)
  const latRad = (lat * Math.PI) / 180;
  const dLatDeg = (radiusMeters / earthRadius) * (180 / Math.PI);
  const dLngDeg =
    (radiusMeters / (earthRadius * Math.cos(latRad))) * (180 / Math.PI);

  const ring: Array<[number, number]> = [];
  for (let i = 0; i <= CIRCLE_VERTICES; i++) {
    const theta = (i / CIRCLE_VERTICES) * 2 * Math.PI;
    const dx = Math.cos(theta) * dLngDeg;
    const dy = Math.sin(theta) * dLatDeg;
    ring.push([lng + dx, lat + dy]);
  }
  return ring;
}
