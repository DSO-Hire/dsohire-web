/**
 * Heatmap overlay helper for JobsMap — Phase D Day 2 deck.gl integration.
 *
 * Fetches the pre-aggregated GeoJSON from /api/jobs/heatmap.json,
 * constructs a deck.gl GeoJsonLayer with a 6-step quantile color ramp
 * (heritage tints) and mounts it on top of the existing Mapbox canvas
 * via MapboxOverlay.
 *
 * Day 2 scope (this file):
 *   • Mount the layer + render hexes on the map
 *   • Color ramp + opacity
 *   • Lifecycle hooks (setup, teardown, refresh)
 *
 * Day 3 follow-up (deferred, NOT in this file):
 *   • Zoom-driven visibility crossfade (hex ↔ metro pins)
 *   • Hover popup
 *   • Click → flyTo center at zoom 9
 *
 * Day 4 follow-up:
 *   • Style picker entry for "Heatmap" mode (currently always-on
 *     when initialized; Day 2 deliberately keeps it simple)
 */

import type { HeatmapFeatureCollection, HeatmapHexFeature } from "@/lib/geocoding/h3-aggregate";

/** Brand-aligned 6-step ramp: ivory-deep → heritage-light → heritage-deep.
 *  Alpha kept at 0.9 so the basemap shows through subtly. */
const RAMP_COLORS: Array<[number, number, number, number]> = [
  [236, 231, 219, 230], // #ECE7DB — ivory-deep (sparsest)
  [214, 218, 200, 230], // blend
  [185, 204, 192, 230], // #B9CCC0 — heritage-light
  [143, 179, 160, 230], // blend
  [95, 137, 117, 230], // blend
  [47, 93, 79, 230], // #2F5D4F — heritage-deep (densest)
];

/** Compute quantile-bucket thresholds for the count distribution.
 *  Returns an array of 5 boundary values; a count is in bucket `i` if
 *  it's <= thresholds[i], or bucket 5 if greater than thresholds[4]. */
function quantileThresholds(counts: number[]): number[] {
  if (counts.length === 0) return [0, 0, 0, 0, 0];
  const sorted = [...counts].sort((a, b) => a - b);
  const step = sorted.length / 6;
  return [1, 2, 3, 4, 5].map((i) => {
    const idx = Math.min(Math.floor(step * i), sorted.length - 1);
    return sorted[idx]!;
  });
}

/** Lookup a color for a given count using precomputed thresholds. */
function colorForCount(
  count: number,
  thresholds: number[]
): [number, number, number, number] {
  for (let i = 0; i < thresholds.length; i++) {
    if (count <= thresholds[i]!) return RAMP_COLORS[i]!;
  }
  return RAMP_COLORS[RAMP_COLORS.length - 1]!;
}

export interface HeatmapOverlayHandle {
  /** Re-fetch the heatmap data + rebuild the layer (e.g., after a
   *  cache-bust or a filter change once we wire filter-sync in Day 3+). */
  refresh: () => Promise<void>;
  /** Remove the overlay from the map and release its resources. */
  destroy: () => void;
}

/**
 * Attach the heatmap overlay to an initialized Mapbox map.
 *
 * Idempotent on re-mount within a single Map instance — calling
 * twice will tear down the old overlay before adding the new one.
 *
 * Returns a handle for refresh/destroy. Caller is responsible for
 * calling destroy() when the map unmounts (typically inside the
 * JobsMap useEffect cleanup function).
 */
export async function attachHeatmapOverlay(
  // Mapbox map instance — typed loose because the JobsMap dynamic
  // import returns `any` for the same reasons (see jobs-map.tsx).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any
): Promise<HeatmapOverlayHandle> {
  // Dynamic imports — both libraries are browser-only and we don't
  // want them in any SSR bundle. Keep them out of the JobsMap module
  // graph until the heatmap is actually being rendered.
  const [{ GeoJsonLayer }, { MapboxOverlay }] = await Promise.all([
    import("@deck.gl/layers"),
    import("@deck.gl/mapbox"),
  ]);

  let collection: HeatmapFeatureCollection | null = null;
  let thresholds: number[] = [0, 0, 0, 0, 0];

  const fetchCollection = async (): Promise<HeatmapFeatureCollection> => {
    const res = await fetch("/api/jobs/heatmap.json", { cache: "default" });
    if (!res.ok) {
      throw new Error(
        `heatmap fetch failed: ${res.status} ${res.statusText}`
      );
    }
    return (await res.json()) as HeatmapFeatureCollection;
  };

  const buildLayer = () => {
    if (!collection) return null;
    // beforeId is a MapboxOverlay-interleaved-mode prop that deck.gl's
    // typed GeoJsonLayer constructor doesn't expose publicly (it's
    // consumed by the Mapbox bridge, not the layer itself). Spread it
    // in via a type-erasing intermediate so tsc accepts it while the
    // runtime continues to honor the z-order intent (hexes render
    // BELOW Mapbox label layers so city/state names stay legible).
    const baseProps = {
      id: "dsohire-heatmap",
      data: collection.features,
      pickable: false, // Day 3 turns this on for hover/click
      stroked: true,
      filled: true,
      lineWidthMinPixels: 1,
      getLineWidth: 1,
      getLineColor: [47, 93, 79, 80] as [number, number, number, number],
      getFillColor: (f: HeatmapHexFeature) =>
        colorForCount(f.properties.count, thresholds),
    };
    const extendedProps = {
      ...baseProps,
      beforeId: "place-label",
    };
    return new GeoJsonLayer<HeatmapHexFeature["properties"]>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      extendedProps as any
    );
  };

  // MapboxOverlay is the bridge between deck.gl layers and the
  // existing Mapbox canvas — both render to the same context, so
  // pins + hexes coexist visually without canvas-stacking issues.
  const overlay = new MapboxOverlay({
    interleaved: true,
    layers: [],
  });

  map.addControl(overlay);

  const refresh = async () => {
    try {
      collection = await fetchCollection();
      const counts = collection.features.map(
        (f) => (f.properties as { count: number }).count
      );
      thresholds = quantileThresholds(counts);
      const layer = buildLayer();
      overlay.setProps({ layers: layer ? [layer] : [] });
    } catch (err) {
      console.warn("[heatmap-overlay] refresh failed", err);
      overlay.setProps({ layers: [] });
    }
  };

  // Initial load.
  await refresh();

  return {
    refresh,
    destroy: () => {
      try {
        map.removeControl(overlay);
      } catch {
        /* map may already be torn down */
      }
    },
  };
}
