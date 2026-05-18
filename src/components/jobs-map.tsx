"use client";

/**
 * JobsMap — metro-pin map view of open roles for the public /jobs page.
 *
 * REWORKED 2026-05-18 from the original 9-mile-circle approach (see
 * project_map_view_pin_rework_2026_05_18.md). The circle paradigm caused
 * a visual blob when multiple DSO locations shared a city centroid:
 * eight circles drawn at the same coordinates rendered as one
 * overlapping mass. The pin approach handles same-centroid locations
 * cleanly via Mapbox's native clustering (which uses supercluster under
 * the hood) and shifts the privacy framing from "spatial fuzz" to
 * "metro-level aggregation."
 *
 * Privacy contract (UNCHANGED): every location's lat/lng comes from a
 * city + state geocode only — never a street address. The DB never
 * stores precise office coordinates. Pin position = city centroid.
 *
 * UX:
 *   - Brand-colored pins (heritage fill, navy text + halo) with the
 *     role count inline. Zillow-style.
 *   - Multiple locations at the same centroid auto-cluster into one pin
 *     showing the TOTAL roles across all of them.
 *   - Hover → preview popup with metro + role count.
 *   - Click an unclustered pin → drawer with that location's roles.
 *   - Click a cluster → if it'll break apart on zoom, fly to that zoom;
 *     if it's at max-cluster-zoom (same-centroid case), open the drawer
 *     with EVERY location in the cluster.
 *   - "Use my location" CTA recenters the map.
 *   - Two map styles (Streets / Satellite), localStorage-persisted.
 *
 * mapbox-gl is browser-only; dynamic-imported inside an effect.
 */

import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Locate, X, MapPin, Search, Loader2 } from "lucide-react";

/* mapbox-gl is dynamically imported. Loose runtime typings inside the
 * effect — we only touch a narrow surface (Map, sources, layers, click
 * + hover handlers). @types/mapbox-gl resolution is unstable in our
 * local node_modules state; Vercel's clean build gets real types. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapboxMap = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MapboxPopup = any;
type GeoJSONSourceWithCluster = {
  setData(data: unknown): void;
  getClusterExpansionZoom(clusterId: number, cb: (err: unknown, zoom: number) => void): void;
  getClusterLeaves(
    clusterId: number,
    limit: number,
    offset: number,
    cb: (err: unknown, features: Array<{ properties: { id: string } }>) => void
  ): void;
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

/* Map style picker — same two options Cam locked 2026-05-01. */
const MAP_STYLES = [
  { id: "streets", label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
  {
    id: "satellite-streets",
    label: "Satellite",
    url: "mapbox://styles/mapbox/satellite-streets-v12",
  },
] as const;
type MapStyleId = (typeof MAP_STYLES)[number]["id"];
const DEFAULT_STYLE_ID: MapStyleId = "streets";
const STYLE_STORAGE_KEY = "dsohire:map-style";

/* Clustering config.
 *
 * clusterRadius: 65px (slightly above Mapbox default 50) — gives a
 * small overlap tolerance for nearby pins so the visual is "they
 * cluster" rather than "they overlap with neither winning visual
 * priority." Counterbalanced by COORD_SNAP_DECIMALS below.
 *
 * clusterMaxZoom: 12 — beyond this, pins stop clustering. At zoom
 * 12 a typical metro spans ~3-5km, which is right for distinguishing
 * neighborhoods within a city.
 *
 * COORD_SNAP_DECIMALS: 3 — locations are snapped to a ~110m grid
 * before being fed to Mapbox. Two practices both geocoded to a city
 * centroid will land at IDENTICAL coordinates after the snap, even
 * if the geocoder returned slightly-different values for each
 * (e.g. PV FAMily Dent at 38.9891 vs 67 Dental at 38.9888 both
 * become 38.989). Identical coords always cluster, so the visual
 * is one pin with the aggregated role count instead of two
 * overlapping pins. The privacy story doesn't change — we were
 * already at city-centroid precision.
 */
const CLUSTER_RADIUS_PX = 65;
const CLUSTER_MAX_ZOOM = 12;
const COORD_SNAP_DECIMALS = 3;

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
  const popupRef = useRef<MapboxPopup | null>(null);
  const initialFitDoneRef = useRef(false);
  /* Latest locations kept in a ref so the style.load handler (attached
   * once at init) always re-attaches the source + layers with the
   * freshest data. */
  const locationsRef = useRef<JobsMapLocation[]>(locations);
  locationsRef.current = locations;
  /* Quick lookup by location id — used when expanding a cluster to
   * the drawer (cluster click returns leaf feature ids, we resolve
   * back to JobsMapLocation entries). */
  const locationByIdRef = useRef<Map<string, JobsMapLocation>>(
    new Map(locations.map((l) => [l.id, l]))
  );
  locationByIdRef.current = new Map(locations.map((l) => [l.id, l]));

  /* Drawer state holds an ARRAY of locations because a cluster click
   * at max zoom (same-centroid case) needs to display every location
   * the user just selected. A single-pin click sets a 1-element array. */
  const [drawerLocations, setDrawerLocations] = useState<JobsMapLocation[]>([]);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleId, setMapStyleId] =
    useState<MapStyleId>(DEFAULT_STYLE_ID);

  // Search-by-location state. We hit the Mapbox Geocoding API directly
  // (using the public NEXT_PUBLIC_MAPBOX_TOKEN already in scope) and
  // flyTo the first result. No autocomplete in v1 — type + Enter is the
  // shipping pattern; can add autocomplete later if it's felt-gap.
  const [searchInput, setSearchInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const totalDrawerJobs = useMemo(
    () => drawerLocations.reduce((sum, l) => sum + l.jobs.length, 0),
    [drawerLocations]
  );

  /* Group drawer jobs by DSO so cluster expansion clearly shows which
   * practice each job belongs to. Sort groups by job count desc so the
   * most-active DSO appears first. */
  const drawerDsoGroups = useMemo(() => {
    type DsoGroup = {
      dsoId: string;
      dsoName: string;
      jobs: Array<{
        id: string;
        title: string;
        employment_type: string;
        role_category: string;
        locationName: string;
      }>;
    };
    const groups = new Map<string, DsoGroup>();
    for (const loc of drawerLocations) {
      for (const job of loc.jobs) {
        const existing = groups.get(job.dso_id);
        if (existing) {
          existing.jobs.push({
            id: job.id,
            title: job.title,
            employment_type: job.employment_type,
            role_category: job.role_category,
            locationName: loc.name,
          });
        } else {
          groups.set(job.dso_id, {
            dsoId: job.dso_id,
            dsoName: job.dso_name,
            jobs: [
              {
                id: job.id,
                title: job.title,
                employment_type: job.employment_type,
                role_category: job.role_category,
                locationName: loc.name,
              },
            ],
          });
        }
      }
    }
    return Array.from(groups.values()).sort(
      (a, b) => b.jobs.length - a.jobs.length
    );
  }, [drawerLocations]);

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
      // Browser-only library — dynamic import. Typed loose because
      // @types/mapbox-gl resolution is unstable in our local
      // node_modules state; Vercel's clean install gets real types.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mapboxgl: any = (await import("mapbox-gl")).default;

      if (cancelled || !containerRef.current) return;

      mapboxgl.accessToken = mapboxToken;

      const initialStyleUrl =
        MAP_STYLES.find((s) => s.id === mapStyleId)?.url ?? MAP_STYLES[0].url;

      const map = new mapboxgl.Map({
        container: containerRef.current,
        style: initialStyleUrl,
        center: [-98.5, 39.5],
        zoom: 3.6,
        attributionControl: false,
      });

      // CRITICAL ORDERING — register the style.load handler IMMEDIATELY
      // after construction. Mapbox loads the initial style asynchronously
      // but FAST when cached; if we attach controls / refs first, the
      // initial style.load can fire BEFORE the handler is registered and
      // we miss the only chance to attach our source + layers (until the
      // user toggles a style which fires another style.load). That was
      // the "data only appears after clicking Streets/Satellite" bug.
      const handleStyleLoad = () => {
        if (cancelled) return;
        const currentLocations = locationsRef.current;
        attachLocationLayers(map, currentLocations);
        wireLayerInteractions(map, {
          getLocation: (id: string) => locationByIdRef.current.get(id) ?? null,
          openDrawer: (locs) => setDrawerLocations(locs),
          popup: popupRef.current,
        });

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
      };
      map.on("style.load", handleStyleLoad);
      // Belt-and-suspenders: if the style is ALREADY loaded by the time
      // this code path completes (heavily cached scenarios), the event
      // won't fire again. Trigger the handler manually.
      if (map.isStyleLoaded?.()) handleStyleLoad();

      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right"
      );
      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right"
      );

      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: "dsohire-map-popup",
      });

      mapRef.current = map;
    })();

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      popupRef.current = null;
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
    ) as GeoJSONSourceWithCluster | undefined;
    if (!source) return;
    source.setData(buildLocationFeatures(locations));
  }, [locations, mapReady]);

  /* ── Search by location ────────────────────────────────────── */
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;
    if (!mapboxToken) return;
    setSearchError(null);
    setSearching(true);
    try {
      // Mapbox Geocoding API — filter to US places, postcodes, regions,
      // localities so we match "Denver", "66208", "Kansas", "Overland Park"
      // cleanly without surfacing street-level addresses.
      const url =
        "https://api.mapbox.com/geocoding/v5/mapbox.places/" +
        encodeURIComponent(query) +
        ".json?" +
        new URLSearchParams({
          access_token: mapboxToken,
          country: "us",
          types: "place,postcode,region,locality,district",
          limit: "1",
          autocomplete: "false",
        }).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error("Search failed");
      const data = (await res.json()) as {
        features?: Array<{
          center?: [number, number];
          place_name?: string;
          place_type?: string[];
        }>;
      };
      const first = data.features?.[0];
      if (!first?.center) {
        setSearchError("No match. Try a city, ZIP, or state.");
        return;
      }
      const [lng, lat] = first.center;
      // Zoom level by result type — ZIPs zoom in tight, states stay
      // pulled out, cities land in the middle.
      const placeType = first.place_type?.[0];
      const zoom =
        placeType === "postcode"
          ? 11
          : placeType === "region"
            ? 6
            : placeType === "district"
              ? 8
              : 9; // place, locality, default
      if (mapRef.current) {
        mapRef.current.flyTo({ center: [lng, lat], zoom, duration: 1100 });
      }
    } catch {
      setSearchError("Couldn't reach the geocoder. Try again.");
    } finally {
      setSearching(false);
    }
  };

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
        <p className="text-[13px] text-slate-meta">
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
        <p className="text-[13px] text-slate-meta">
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

      {/* Top-left controls — search + locate + style picker */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 items-start max-w-[calc(100%-32px)] sm:max-w-[340px]">
        {/* Search-by-location input — primary action, biggest control */}
        <form
          onSubmit={handleSearch}
          className="flex items-stretch border border-[var(--rule-strong)] bg-ivory shadow-sm w-full sm:w-[300px]"
          role="search"
          aria-label="Search by city, ZIP, or state"
        >
          <div className="flex items-center pl-3 pr-1 text-slate-meta">
            <Search className="h-4 w-4" aria-hidden />
          </div>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              if (searchError) setSearchError(null);
            }}
            placeholder="City, ZIP, or state"
            className="flex-1 min-w-0 px-2 py-2.5 bg-transparent text-[13px] text-ink placeholder:text-slate-meta focus:outline-none"
            aria-label="Search by city, ZIP, or state"
          />
          <button
            type="submit"
            disabled={searching || !searchInput.trim()}
            className="px-3 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {searching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Go"
            )}
          </button>
        </form>
        {searchError && (
          <div className="bg-red-50 border-l-2 border-red-500 px-3 py-2 text-[12px] text-red-900 max-w-[300px] shadow-sm">
            {searchError}
          </div>
        )}

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
          <div className="bg-red-50 border-l-2 border-red-500 px-3 py-2 text-[12px] text-red-900 max-w-[260px] shadow-sm">
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

      {/* Privacy chip — reframed 2026-05-18 from spatial-fuzz to
          aggregation-level. More prominent than the old footnote. */}
      <div className="absolute top-4 right-[60px] sm:right-4 sm:top-4 sm:bottom-auto bottom-4 left-4 sm:left-auto bg-ivory/95 backdrop-blur-sm border border-[var(--rule)] px-3 py-2 max-w-[320px] sm:max-w-[260px] text-[11px] text-slate-body leading-snug shadow-sm">
        <span className="font-bold text-ink uppercase tracking-[1.5px] text-[10px] block mb-0.5">
          Metro view
        </span>
        Pins show role counts at the metro level — never an office address.
      </div>

      {/* Side drawer — renders for either single-location or cluster
          selection. The cluster case aggregates jobs across every
          location in the cluster. */}
      {drawerLocations.length > 0 && (
        <div
          className="absolute top-0 right-0 bottom-0 w-full sm:w-[420px] bg-white border-l border-[var(--rule)] shadow-lg overflow-y-auto"
          role="dialog"
          aria-label={
            drawerLocations.length === 1
              ? `Jobs at ${drawerLocations[0].name}`
              : `Jobs across ${drawerLocations.length} practices`
          }
        >
          <div className="p-6 sm:p-7">
            <button
              type="button"
              onClick={() => setDrawerLocations([])}
              className="absolute top-4 right-4 p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              {drawerLocations.length === 1
                ? "Jobs at this location"
                : `Jobs across ${drawerLocations.length} practices`}
            </div>
            <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink leading-tight mb-1.5">
              {drawerLocations.length === 1
                ? drawerLocations[0].name
                : metroSummary(drawerLocations)}
            </h2>
            <p className="text-[13px] text-slate-meta tracking-[0.3px] mb-6">
              {totalDrawerJobs === 1 ? "1 open role" : `${totalDrawerJobs} open roles`}
              {drawerLocations.length === 1 &&
                ` · ${[drawerLocations[0].city, drawerLocations[0].state]
                  .filter(Boolean)
                  .join(", ")}`}
            </p>

            {totalDrawerJobs === 0 ? (
              <p className="text-[14px] text-slate-meta italic">
                No active jobs at this location right now.
              </p>
            ) : drawerDsoGroups.length === 1 ? (
              // Single-DSO case (most common — single-location cluster
              // OR cluster of locations all owned by one DSO). Flat list
              // without redundant DSO headers since the DSO is implied.
              <ul className="space-y-3 list-none">
                {drawerDsoGroups[0].jobs.map((job) => (
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
                        <span className="text-[13px] text-slate-body">
                          {drawerDsoGroups[0].dsoName}
                          {drawerLocations.length > 1 && ` · ${job.locationName}`}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-heritage-deep opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              // Multi-DSO cluster — group jobs under per-DSO headers so
              // users instantly see which practice each role belongs to.
              <div className="space-y-7">
                {drawerDsoGroups.map((group) => (
                  <section key={group.dsoId}>
                    <header className="flex items-baseline justify-between gap-3 mb-3 pb-2 border-b border-[var(--rule)]">
                      <h3 className="text-[15px] font-extrabold tracking-[-0.2px] text-ink">
                        {group.dsoName}
                      </h3>
                      <span className="text-[11px] font-semibold tracking-[1.5px] uppercase text-heritage-deep shrink-0">
                        {group.jobs.length} role
                        {group.jobs.length === 1 ? "" : "s"}
                      </span>
                    </header>
                    <ul className="space-y-3 list-none">
                      {group.jobs.map((job) => (
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
                              <span className="text-[13px] text-slate-body">
                                {job.locationName}
                              </span>
                              <ArrowRight className="h-3.5 w-3.5 text-heritage-deep opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

/** Human-friendly summary line for a cluster drawer. */
function metroSummary(locations: JobsMapLocation[]): string {
  // All locations in a cluster typically share city+state since they
  // share a centroid. Use the first one as the title; fall back to
  // a generic header.
  const first = locations[0];
  if (!first) return "Jobs at this metro";
  const cityState = [first.city, first.state].filter(Boolean).join(", ");
  return cityState || `${locations.length} practices in this metro`;
}

/* ───────────────────────────────────────────────────────────────
 * GeoJSON feature builder.
 *
 * Each location becomes a single Point feature carrying the location id
 * + role count. Mapbox's native clustering (powered by supercluster
 * under the hood) aggregates same-centroid points cleanly with summed
 * jobCount. The old polygon-circle approximation is gone.
 * ───────────────────────────────────────────────────────────── */

function snapCoord(value: number): number {
  // Round to COORD_SNAP_DECIMALS decimal places via integer math
  // to avoid floating-point noise. 3 decimals ≈ 110m grid.
  const factor = Math.pow(10, COORD_SNAP_DECIMALS);
  return Math.round(value * factor) / factor;
}

function buildLocationFeatures(locations: JobsMapLocation[]): unknown {
  const features = locations.map((loc) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      // Snap to a ~110m grid so locations that share a city centroid
      // but received slightly-different geocoder responses land at
      // EXACTLY the same coordinates and cluster cleanly. See the
      // COORD_SNAP_DECIMALS comment above.
      coordinates: [snapCoord(loc.longitude), snapCoord(loc.latitude)],
    },
    properties: {
      id: loc.id,
      jobCount: loc.jobs.length,
      // Carry city/state through to feature properties so the
      // single-pin city-name label layer can read them via expressions.
      // Cluster pins don't carry this since Mapbox clusterProperties
      // only supports numeric aggregation — clusters get city via the
      // async leaf-lookup in the hover popup.
      city: loc.city ?? "",
      state: loc.state ?? "",
    },
  }));
  return { type: "FeatureCollection", features };
}

/* ───────────────────────────────────────────────────────────────
 * Source + layer attachment.
 *
 * Called from style.load so it runs on initial creation AND after every
 * setStyle (Mapbox wipes custom sources/layers on style change).
 *
 * Pin design:
 *   - Single-location pin: heritage-green fill, navy outline, role
 *     count rendered as a white-haloed label inside.
 *   - Cluster pin: same colors, slightly larger radius, navy outline
 *     thickens, role count inside reflects the SUM across all locations
 *     in the cluster (Mapbox's clusterProperties feature).
 * ───────────────────────────────────────────────────────────── */

function attachLocationLayers(
  map: MapboxMap,
  locations: JobsMapLocation[]
): void {
  map.addSource("dsohire-locations", {
    type: "geojson",
    data: buildLocationFeatures(locations),
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS_PX,
    // Sum the jobCount property across every feature in each cluster
    // so the cluster pin shows the total role count, not a count of
    // locations.
    clusterProperties: {
      jobCount: ["+", ["get", "jobCount"]],
    },
  });

  // Cluster pin — circle layer
  map.addLayer({
    id: "dsohire-clusters",
    type: "circle",
    source: "dsohire-locations",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": "#4D7A60", // heritage
      "circle-stroke-color": "#14233F", // navy
      "circle-stroke-width": 2,
      "circle-radius": [
        "step",
        ["get", "jobCount"],
        20, // base radius
        5, 24, // 5+ roles
        15, 28, // 15+ roles
        40, 32, // 40+ roles
      ],
      "circle-opacity": 0.92,
    },
  });

  // Cluster count label
  map.addLayer({
    id: "dsohire-clusters-count",
    type: "symbol",
    source: "dsohire-locations",
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "jobCount"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 14,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#F7F4ED", // ivory
      "text-halo-color": "#14233F", // navy halo for contrast on heritage
      "text-halo-width": 0,
    },
  });

  // Single-location pin — circle layer
  map.addLayer({
    id: "dsohire-points",
    type: "circle",
    source: "dsohire-locations",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": "#4D7A60", // heritage
      "circle-stroke-color": "#14233F", // navy
      "circle-stroke-width": 1.5,
      "circle-radius": [
        "step",
        ["get", "jobCount"],
        16, // base — 1 role
        3, 18, // 3+
        6, 20, // 6+
      ],
      "circle-opacity": 0.92,
    },
  });

  // Single-location count label (inside the pin)
  map.addLayer({
    id: "dsohire-points-count",
    type: "symbol",
    source: "dsohire-locations",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "jobCount"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": "#F7F4ED", // ivory
    },
  });

  // Single-location CITY LABEL — sits below the pin so users instantly
  // know what metro they're looking at without having to hover or
  // click. Added 2026-05-18 after the metro-pin rework left pins
  // visually anonymous ("10" with no metro context).
  map.addLayer({
    id: "dsohire-points-city",
    type: "symbol",
    source: "dsohire-locations",
    filter: ["!", ["has", "point_count"]],
    layout: {
      "text-field": ["get", "city"],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": [0, 1.6],
      "text-allow-overlap": false,
      "text-optional": true,
    },
    paint: {
      "text-color": "#14233F", // navy
      "text-halo-color": "#F7F4ED", // ivory halo for legibility on busy basemaps
      "text-halo-width": 1.5,
    },
  });

  // Cluster CITY LABEL — clusters can't carry city via Mapbox's
  // clusterProperties (numeric-only), so we DON'T render a static
  // text-field here. The hover popup does the async leaf-lookup
  // for the cluster's metro name (see wireLayerInteractions).
}

interface InteractionHandlers {
  getLocation: (id: string) => JobsMapLocation | null;
  openDrawer: (locations: JobsMapLocation[]) => void;
  popup: MapboxPopup | null;
}

function wireLayerInteractions(
  map: MapboxMap,
  handlers: InteractionHandlers
): void {
  /* Cluster click — try to expand the cluster by zooming in. If the
   * expansion zoom is at-or-above clusterMaxZoom (the same-centroid
   * case where zooming won't break the cluster apart), open the
   * drawer with every location in the cluster instead. */
  map.on("click", "dsohire-clusters", (e: unknown) => {
    const ev = e as {
      features?: Array<{
        properties?: { cluster_id?: number };
        geometry?: { coordinates?: [number, number] };
      }>;
    };
    const feature = ev.features?.[0];
    if (!feature) return;
    const clusterId = feature.properties?.cluster_id;
    const coords = feature.geometry?.coordinates;
    if (clusterId === undefined || !coords) return;

    const source = map.getSource(
      "dsohire-locations"
    ) as GeoJSONSourceWithCluster | undefined;
    if (!source) return;

    source.getClusterExpansionZoom(clusterId, (err, expansionZoom) => {
      if (err) return;
      const currentZoom = map.getZoom();
      // If the cluster would break apart on zoom, fly there.
      // Otherwise (same-centroid case), surface the drawer.
      if (expansionZoom > currentZoom + 0.5) {
        map.easeTo({ center: coords, zoom: expansionZoom });
        return;
      }
      // Same-centroid (or near-enough) cluster: get every leaf
      // location and open the drawer aggregating all of them.
      source.getClusterLeaves(clusterId, 100, 0, (leavesErr, leaves) => {
        if (leavesErr) return;
        const locs = leaves
          .map((l) => handlers.getLocation(l.properties?.id))
          .filter((l): l is JobsMapLocation => l !== null);
        if (locs.length > 0) handlers.openDrawer(locs);
      });
    });
  });

  /* Single-pin click — open the drawer with that single location. */
  map.on("click", "dsohire-points", (e: unknown) => {
    const ev = e as {
      features?: Array<{ properties?: { id?: string } }>;
    };
    const feature = ev.features?.[0];
    const id = feature?.properties?.id;
    if (!id) return;
    const loc = handlers.getLocation(id);
    if (loc) handlers.openDrawer([loc]);
  });

  /* Hover popup — single pins show metro name + role count. Cluster
   * pins show "N roles across M practices". */
  const popup = handlers.popup;
  if (popup) {
    const showSinglePopup = (e: unknown) => {
      const ev = e as {
        features?: Array<{
          properties?: { id?: string };
          geometry?: { coordinates?: [number, number] };
        }>;
      };
      const feature = ev.features?.[0];
      const id = feature?.properties?.id;
      const coords = feature?.geometry?.coordinates;
      if (!id || !coords) return;
      const loc = handlers.getLocation(id);
      if (!loc) return;
      const locality = [loc.city, loc.state].filter(Boolean).join(", ");
      const html = `
        <div class="dsohire-map-popup-card">
          <div class="dsohire-map-popup-label">${escapeHtml(loc.name)}</div>
          <div class="dsohire-map-popup-meta">${escapeHtml(locality)} · ${loc.jobs.length} role${loc.jobs.length === 1 ? "" : "s"}</div>
        </div>
      `;
      popup.setLngLat(coords).setHTML(html).addTo(map);
    };
    const showClusterPopup = (e: unknown) => {
      const ev = e as {
        features?: Array<{
          properties?: { point_count?: number; jobCount?: number; cluster_id?: number };
          geometry?: { coordinates?: [number, number] };
        }>;
      };
      const feature = ev.features?.[0];
      const coords = feature?.geometry?.coordinates;
      const count = feature?.properties?.point_count;
      const jobCount = feature?.properties?.jobCount;
      const clusterId = feature?.properties?.cluster_id;
      if (!coords || count === undefined || jobCount === undefined) return;

      // Render initial popup with role/practice counts. We'll upgrade
      // with metro name + DSO breakdown async via getClusterLeaves.
      const baseHtml = (metroLine: string, dsoLine: string) => `
        <div class="dsohire-map-popup-card">
          <div class="dsohire-map-popup-label">${jobCount} role${jobCount === 1 ? "" : "s"} · ${count} practice${count === 1 ? "" : "s"}</div>
          ${metroLine ? `<div class="dsohire-map-popup-meta">${metroLine}</div>` : ""}
          ${dsoLine ? `<div class="dsohire-map-popup-meta">${dsoLine}</div>` : ""}
        </div>
      `;
      popup.setLngLat(coords).setHTML(baseHtml("", "")).addTo(map);

      // Async upgrade — fetch the cluster's leaves and surface metro
      // city + DSO names. Mapbox getClusterLeaves is callback-based.
      if (clusterId === undefined) return;
      const source = map.getSource(
        "dsohire-locations"
      ) as GeoJSONSourceWithCluster | undefined;
      if (!source) return;
      source.getClusterLeaves(
        clusterId,
        50,
        0,
        (
          err: unknown,
          leaves: Array<{ properties: { id: string } }>
        ) => {
          if (err) return;
          const locs = leaves
            .map((l) => handlers.getLocation(l.properties.id))
            .filter((l): l is JobsMapLocation => l !== null);
          if (locs.length === 0) return;
          const firstLoc = locs[0];
          const locality = [firstLoc.city, firstLoc.state]
            .filter(Boolean)
            .join(", ");
          // Unique DSO names across all clustered locations
          const dsoNames = Array.from(
            new Set(
              locs.flatMap((l) => l.jobs.map((j) => j.dso_name))
            )
          );
          const dsoLine =
            dsoNames.length === 0
              ? ""
              : dsoNames.length <= 2
                ? `at ${escapeHtml(dsoNames.join(" + "))}`
                : `at ${escapeHtml(dsoNames.slice(0, 2).join(", "))} + ${dsoNames.length - 2} more`;
          popup.setHTML(baseHtml(escapeHtml(locality), dsoLine));
        }
      );
    };
    const hide = () => popup.remove();

    map.on("mouseenter", "dsohire-points", showSinglePopup);
    map.on("mouseleave", "dsohire-points", hide);
    map.on("mouseenter", "dsohire-clusters", showClusterPopup);
    map.on("mouseleave", "dsohire-clusters", hide);
  }

  /* Cursor affordance — pointer over any clickable layer. */
  for (const layer of ["dsohire-clusters", "dsohire-points"]) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

/** Minimal HTML-escape for popup content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
