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
    /**
     * The DISPLAYED employer name — already affiliation-masked
     * server-side via the `public_dso_affiliation` rule in
     * src/app/jobs/page.tsx. For jobs at locations marked
     * public_dso_affiliation: false, this is the practice name
     * (e.g., "67 Dental"), NEVER the parent DSO name. The drawer
     * groups by this field so private-affiliation practices appear
     * as their own sections, not bundled under their parent DSO.
     */
    dso_name: string;
  }>;
}

/**
 * MetroGroup — locations aggregated by city+state into a single map pin.
 *
 * Cam direction 2026-05-18 PM: "instead of locations being separate,
 * each city gets a pin and then all the jobs pop down from that city."
 * The earlier coordinate-snap fix wasn't aggressive enough: Mission Rd
 * Fake Dental and 67 Dental + PV FAMily Dent all in Prairie Village
 * snapped to slightly-different grid cells and rendered as 2-3 pins
 * for one city. Metro grouping eliminates this entirely by aggregating
 * at the city+state level regardless of geographic precision.
 */
interface MetroGroup {
  key: string; // city|state
  city: string;
  state: string;
  /** Pin position — average of constituent locations for natural centering. */
  latitude: number;
  longitude: number;
  /** All locations in this metro (1+). */
  locations: JobsMapLocation[];
  /** Total open roles across all locations. */
  jobCount: number;
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
 * After the metro-level aggregation rework (2026-05-18), each MetroGroup
 * already represents a city+state-level pin. Clustering at the Mapbox
 * level only kicks in at LOW zoom when adjacent metros (e.g., KC + Lee's
 * Summit) sit close enough on screen to merge into a regional pin.
 *
 * clusterRadius: 65px — generous catchment for the regional-pin case.
 * clusterMaxZoom: 11 — beyond this, individual metro pins appear.
 */
const CLUSTER_RADIUS_PX = 65;
const CLUSTER_MAX_ZOOM = 11;

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
  /* Metro-aggregate the raw locations into one MetroGroup per city+state.
   * Locations without city or state fall back to their own metro keyed
   * on their id so they don't aggregate with unrelated rows. */
  const metroGroups = useMemo<MetroGroup[]>(() => {
    const groups = new Map<string, MetroGroup>();
    for (const loc of locations) {
      const cityKey = (loc.city ?? "").trim().toLowerCase();
      const stateKey = (loc.state ?? "").trim().toUpperCase();
      // Locations missing city or state get a unique key so they show
      // as their own pin instead of polluting a metro bucket.
      const key =
        cityKey && stateKey ? `${cityKey}|${stateKey}` : `loc:${loc.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.locations.push(loc);
        existing.jobCount += loc.jobs.length;
        // Running mean of lat/lng so the metro pin sits in the middle
        // of all its constituent practice centroids.
        const n = existing.locations.length;
        existing.latitude =
          existing.latitude + (loc.latitude - existing.latitude) / n;
        existing.longitude =
          existing.longitude + (loc.longitude - existing.longitude) / n;
      } else {
        groups.set(key, {
          key,
          city: loc.city ?? "",
          state: loc.state ?? "",
          latitude: loc.latitude,
          longitude: loc.longitude,
          locations: [loc],
          jobCount: loc.jobs.length,
        });
      }
    }
    return Array.from(groups.values());
  }, [locations]);

  /* Latest metro groups kept in a ref so the style.load handler always
   * re-attaches the source + layers with the freshest data. */
  const metroGroupsRef = useRef<MetroGroup[]>(metroGroups);
  metroGroupsRef.current = metroGroups;
  /* Quick lookup by metro key — used to resolve a clicked pin back to
   * the underlying locations (we pass the key as the feature property). */
  const metroByKeyRef = useRef<Map<string, MetroGroup>>(
    new Map(metroGroups.map((g) => [g.key, g]))
  );
  metroByKeyRef.current = new Map(metroGroups.map((g) => [g.key, g]));

  /* Drawer opens for a single METRO group (city+state). The drawer
   * renders all of the metro's locations, with jobs grouped by their
   * displayed DSO name (already affiliation-masked server-side). */
  const [drawerMetro, setDrawerMetro] = useState<MetroGroup | null>(null);
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

  /* Group drawer jobs by their DISPLAYED DSO name.
   *
   * 2026-05-18 — privacy leak fix. Grouping by job.dso_id collapsed
   * private-affiliation practices into their parent DSO bucket, since
   * dso_id was always the parent. Grouping by job.dso_name uses the
   * already-affiliation-masked name (e.g., "67 Dental" for private
   * locations, "dso hire" for public ones), so private practices
   * appear as their own sections without visual connection to the
   * parent. This is the load-bearing fix that closes the leak.
   *
   * Edge case: two unrelated DSOs with the same displayed name would
   * collapse into one bucket. We accept that — a strictly more private
   * outcome than the alternative.
   */
  const drawerDsoGroups = useMemo(() => {
    type DsoGroup = {
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
    if (!drawerMetro) return [];
    for (const loc of drawerMetro.locations) {
      for (const job of loc.jobs) {
        const key = job.dso_name; // displayed (masked) name
        const existing = groups.get(key);
        if (existing) {
          existing.jobs.push({
            id: job.id,
            title: job.title,
            employment_type: job.employment_type,
            role_category: job.role_category,
            locationName: loc.name,
          });
        } else {
          groups.set(key, {
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
  }, [drawerMetro]);

  const totalDrawerJobs = drawerMetro?.jobCount ?? 0;

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

      popupRef.current = new mapboxgl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 14,
        className: "dsohire-map-popup",
      });

      mapRef.current = map;

      // ROBUST LOAD HANDLING — separates "first-ever setup" from
      // "re-attach after style swap" so the two paths don't race or
      // double-fire.
      //
      // - `load` fires once when initial style + assets are ready.
      //   Handles the cold-cache case.
      // - `map.loaded()` returns true synchronously if the map is
      //   ALREADY loaded by the time we check. Handles the hot-cache
      //   case where the load event already fired before we attached
      //   our listener.
      // - `style.load` fires on EVERY style load, including swaps.
      //   We use it to re-attach the source + layers (Mapbox wipes
      //   them on setStyle).
      //
      // The earlier 'style.load only' approach missed the hot-cache
      // case despite the isStyleLoaded check — likely because the
      // event had already fired and our `.on()` was too late to bind.
      // Splitting into `load` (idempotent first-time setup) +
      // `style.load` (post-init re-attach only) is the textbook fix.
      let initialSetupDone = false;
      const initialSetup = () => {
        if (cancelled || initialSetupDone) return;
        initialSetupDone = true;
        const currentMetros = metroGroupsRef.current;
        attachLocationLayers(map, currentMetros);
        wireLayerInteractions(map, {
          getMetro: (key: string) =>
            metroByKeyRef.current.get(key) ?? null,
          openDrawer: (metro) => setDrawerMetro(metro),
          popup: popupRef.current,
        });
        if (!initialFitDoneRef.current && currentMetros.length > 0) {
          const bounds = new mapboxgl.LngLatBounds();
          for (const m of currentMetros) {
            bounds.extend([m.longitude, m.latitude]);
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

      const reattachAfterStyleSwap = () => {
        if (cancelled) return;
        // Skip the first style.load — that's covered by initialSetup
        // via the `load` event / loaded() check. Only re-attach on
        // SUBSEQUENT style swaps.
        if (!initialSetupDone) return;
        const currentMetros = metroGroupsRef.current;
        attachLocationLayers(map, currentMetros);
        wireLayerInteractions(map, {
          getMetro: (key: string) =>
            metroByKeyRef.current.get(key) ?? null,
          openDrawer: (metro) => setDrawerMetro(metro),
          popup: popupRef.current,
        });
      };

      if (map.loaded?.()) {
        // Hot cache path: map is already loaded; run setup synchronously.
        initialSetup();
      } else {
        // Cold cache path: wait for the load event.
        map.once("load", initialSetup);
      }
      map.on("style.load", reattachAfterStyleSwap);

      map.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        "bottom-right"
      );
      map.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right"
      );
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

  /* ── Refresh data when metro groups change ──────────────── */
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource(
      "dsohire-locations"
    ) as GeoJSONSourceWithCluster | undefined;
    if (!source) return;
    source.setData(buildLocationFeatures(metroGroups));
  }, [metroGroups, mapReady]);

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

      {/* Side drawer — opens for a single metro (city+state group).
          Renders all locations in the metro with jobs grouped by
          displayed DSO name (affiliation-masked server-side). */}
      {drawerMetro && (
        <div
          className="absolute top-0 right-0 bottom-0 w-full sm:w-[420px] bg-white border-l border-[var(--rule)] shadow-lg overflow-y-auto"
          role="dialog"
          aria-label={`Jobs in ${drawerMetro.city || "this metro"}`}
        >
          <div className="p-6 sm:p-7">
            <button
              type="button"
              onClick={() => setDrawerMetro(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-meta hover:text-ink hover:bg-cream transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              {drawerMetro.locations.length === 1
                ? "Jobs in this metro"
                : `Jobs across ${drawerMetro.locations.length} practices`}
            </div>
            <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink leading-tight mb-1.5">
              {[drawerMetro.city, drawerMetro.state]
                .filter(Boolean)
                .join(", ") || "This metro"}
            </h2>
            <p className="text-[13px] text-slate-meta tracking-[0.3px] mb-6">
              {totalDrawerJobs === 1
                ? "1 open role"
                : `${totalDrawerJobs} open roles`}
            </p>

            {totalDrawerJobs === 0 ? (
              <p className="text-[14px] text-slate-meta italic">
                No active jobs in this metro right now.
              </p>
            ) : drawerDsoGroups.length === 1 ? (
              // Single-DSO metro — flat list, no redundant DSO header.
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
                          {drawerMetro.locations.length > 1 &&
                            ` · ${job.locationName}`}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-heritage-deep opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              // Multi-DSO metro — group jobs under per-DSO headers
              // (using the DISPLAYED dso name; private-affiliation
              // practices appear as their own sections, never bundled
              // under their parent DSO).
              <div className="space-y-7">
                {drawerDsoGroups.map((group) => (
                  <section key={group.dsoName}>
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

/* ───────────────────────────────────────────────────────────────
 * GeoJSON feature builder.
 *
 * Each location becomes a single Point feature carrying the location id
 * + role count. Mapbox's native clustering (powered by supercluster
 * under the hood) aggregates same-centroid points cleanly with summed
 * jobCount. The old polygon-circle approximation is gone.
 * ───────────────────────────────────────────────────────────── */

function buildLocationFeatures(metros: MetroGroup[]): unknown {
  // ONE Point feature per metro (city+state group). The metro's
  // latitude/longitude is already the mean of its constituent
  // practice centroids (see metroGroups useMemo). No coordinate
  // snapping needed at this layer — the metro-level aggregation
  // makes it unnecessary.
  const features = metros.map((m) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [m.longitude, m.latitude],
    },
    properties: {
      key: m.key,
      jobCount: m.jobCount,
      practiceCount: m.locations.length,
      city: m.city,
      state: m.state,
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
  metros: MetroGroup[]
): void {
  // Defensive: if we're re-attaching after a style swap, the source
  // may still exist. Removing layers first prevents Mapbox throwing
  // on duplicate-add.
  for (const id of [
    "dsohire-clusters",
    "dsohire-clusters-count",
    "dsohire-points",
    "dsohire-points-count",
    "dsohire-points-city",
  ]) {
    if (map.getLayer?.(id)) map.removeLayer(id);
  }
  if (map.getSource?.("dsohire-locations")) map.removeSource("dsohire-locations");

  map.addSource("dsohire-locations", {
    type: "geojson",
    data: buildLocationFeatures(metros),
    cluster: true,
    clusterMaxZoom: CLUSTER_MAX_ZOOM,
    clusterRadius: CLUSTER_RADIUS_PX,
    // Sum the jobCount + practiceCount across features in each cluster
    // so the cluster pin can show totals across the multi-metro region.
    clusterProperties: {
      jobCount: ["+", ["get", "jobCount"]],
      practiceCount: ["+", ["get", "practiceCount"]],
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
  getMetro: (key: string) => MetroGroup | null;
  openDrawer: (metro: MetroGroup) => void;
  popup: MapboxPopup | null;
}

function wireLayerInteractions(
  map: MapboxMap,
  handlers: InteractionHandlers
): void {
  /* Cluster click — clusters now group MULTIPLE METROS together at
   * low zoom. Always expansion-zoom on click; metros are always at
   * different coords so zooming will break them apart. */
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
      map.easeTo({ center: coords, zoom: expansionZoom });
    });
  });

  /* Metro pin click — open the drawer for that metro (showing all
   * locations in the metro, jobs grouped by displayed DSO name). */
  map.on("click", "dsohire-points", (e: unknown) => {
    const ev = e as {
      features?: Array<{ properties?: { key?: string } }>;
    };
    const feature = ev.features?.[0];
    const key = feature?.properties?.key;
    if (!key) return;
    const metro = handlers.getMetro(key);
    if (metro) handlers.openDrawer(metro);
  });

  /* Hover popup — single pins show metro name + role count. Cluster
   * pins show "N roles across M practices". */
  const popup = handlers.popup;
  if (popup) {
    const showMetroPopup = (e: unknown) => {
      const ev = e as {
        features?: Array<{
          properties?: { key?: string };
          geometry?: { coordinates?: [number, number] };
        }>;
      };
      const feature = ev.features?.[0];
      const key = feature?.properties?.key;
      const coords = feature?.geometry?.coordinates;
      if (!key || !coords) return;
      const metro = handlers.getMetro(key);
      if (!metro) return;
      const locality = [metro.city, metro.state].filter(Boolean).join(", ");
      const practicesLine =
        metro.locations.length === 1
          ? `${metro.jobCount} role${metro.jobCount === 1 ? "" : "s"}`
          : `${metro.jobCount} role${metro.jobCount === 1 ? "" : "s"} across ${metro.locations.length} practices`;
      const html = `
        <div class="dsohire-map-popup-card">
          <div class="dsohire-map-popup-label">${escapeHtml(locality || "Metro")}</div>
          <div class="dsohire-map-popup-meta">${practicesLine}</div>
        </div>
      `;
      popup.setLngLat(coords).setHTML(html).addTo(map);
    };
    const showClusterPopup = (e: unknown) => {
      const ev = e as {
        features?: Array<{
          properties?: {
            point_count?: number;
            jobCount?: number;
            practiceCount?: number;
          };
          geometry?: { coordinates?: [number, number] };
        }>;
      };
      const feature = ev.features?.[0];
      const coords = feature?.geometry?.coordinates;
      const metroCount = feature?.properties?.point_count;
      const jobCount = feature?.properties?.jobCount;
      const practiceCount = feature?.properties?.practiceCount;
      if (!coords || metroCount === undefined || jobCount === undefined) return;
      const html = `
        <div class="dsohire-map-popup-card">
          <div class="dsohire-map-popup-label">${jobCount} role${jobCount === 1 ? "" : "s"}</div>
          <div class="dsohire-map-popup-meta">across ${metroCount} metro${metroCount === 1 ? "" : "s"}${
            practiceCount && practiceCount !== metroCount
              ? ` · ${practiceCount} practices`
              : ""
          }</div>
          <div class="dsohire-map-popup-meta" style="margin-top:4px;color:var(--color-slate-meta);font-size:10px;">Click to zoom in</div>
        </div>
      `;
      popup.setLngLat(coords).setHTML(html).addTo(map);
    };
    const hide = () => popup.remove();

    map.on("mouseenter", "dsohire-points", showMetroPopup);
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
