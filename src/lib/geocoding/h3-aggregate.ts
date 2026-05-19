/**
 * H3 hex aggregation — Phase D heatmap data pipeline (Day 1).
 *
 * Takes raw points (DSO locations with active-job counts) and aggregates
 * them into hex cells at a chosen H3 resolution. Output is a GeoJSON
 * FeatureCollection where each Feature is a hexagon Polygon with a
 * `count` property carrying the sum of jobs in that hex, plus a
 * `metros` property listing the metros aggregated into that hex (used
 * by the hover popup on the map).
 *
 * Resolution choice: r4 (~1,770 km² per hex, ~22km edge). The original
 * plan called for r5 (~252 km²) but the visual review against real data
 * (Day 3 deploy 2026-05-19) showed r5 hexes rendered as ~2px specks at
 * country zoom — invisible. The heatmap is country-scale by design (it
 * crossfades into metro pins at zoom 7+), so the hex size needs to match
 * country-scale legibility. r4 hexes are ~30km across and read as proper
 * polygons at zoom 3-7 while still being granular enough to show
 * regional concentration (cluster differences between metros stay
 * visible). r3 (~12k km²) would group state-wide and lose all signal.
 *
 * H3 docs: https://h3geo.org/docs/core-library/restable
 * h3-js: https://github.com/uber/h3-js
 */

import { cellToBoundary, latLngToCell } from "h3-js";

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  /** Number of active jobs at this location. Hex count = sum of these. */
  jobCount: number;
  /** Optional metro label (e.g. "Austin, TX") — collected per-hex for
   *  the hover popup so we don't need a server round-trip to resolve. */
  metro?: string | null;
}

export interface HeatmapHexFeature {
  type: "Feature";
  geometry: {
    type: "Polygon";
    /** GeoJSON convention: one ring of [lng, lat] pairs, closed (first
     *  vertex repeated at the end). */
    coordinates: [number[][]];
  };
  properties: {
    /** H3 cell index — stable identifier for the hex. */
    cellId: string;
    /** Sum of jobCounts across all points that fell into this hex. */
    count: number;
    /** Unique metro labels aggregated into this hex (sorted, deduped). */
    metros: string[];
  };
}

export interface HeatmapFeatureCollection {
  type: "FeatureCollection";
  features: HeatmapHexFeature[];
  /** Diagnostic metadata — not part of strict GeoJSON spec, but harmless
   *  to client consumers and useful for debugging cache freshness. */
  generated_at: string;
  resolution: number;
  point_count: number;
}

/** Default H3 resolution for Phase D heatmap. Bumped from r5 to r4 on
 *  2026-05-19 after visual review — see file header for rationale. */
export const DEFAULT_HEATMAP_RESOLUTION = 4;

/**
 * Aggregate raw points into a GeoJSON FeatureCollection of H3 hexagons.
 *
 * Empty input → empty FeatureCollection (not null) so callers can render
 * "no data" state without nullchecks. Points with null/undefined lat or
 * lng are silently dropped — the data pipeline upstream is responsible
 * for filtering, but defensive here too.
 */
export function aggregateToHexFeatures(
  points: HeatmapPoint[],
  resolution: number = DEFAULT_HEATMAP_RESOLUTION
): HeatmapFeatureCollection {
  // Group points into a map keyed by H3 cell index.
  // Value: running sum of job counts + a Set of metro labels (deduped
  // naturally; converted to a sorted array at render time).
  const cellMap = new Map<
    string,
    { count: number; metros: Set<string> }
  >();

  for (const p of points) {
    if (
      typeof p.latitude !== "number" ||
      typeof p.longitude !== "number" ||
      !Number.isFinite(p.latitude) ||
      !Number.isFinite(p.longitude)
    ) {
      continue;
    }
    const cellId = latLngToCell(p.latitude, p.longitude, resolution);
    const existing = cellMap.get(cellId);
    if (existing) {
      existing.count += p.jobCount;
      if (p.metro) existing.metros.add(p.metro);
    } else {
      const metros = new Set<string>();
      if (p.metro) metros.add(p.metro);
      cellMap.set(cellId, { count: p.jobCount, metros });
    }
  }

  // Build Feature[] from the aggregated cells. Use formatAsGeoJson=true
  // to get [lng, lat] boundary coords (GeoJSON convention), and append
  // the first vertex to close the ring (also a GeoJSON requirement).
  const features: HeatmapHexFeature[] = [];
  for (const [cellId, agg] of cellMap.entries()) {
    if (agg.count <= 0) continue; // skip zero-count hexes (defensive)

    const boundary = cellToBoundary(cellId, true) as number[][];
    if (boundary.length === 0) continue;

    const ring = [...boundary, boundary[0]!];

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
      properties: {
        cellId,
        count: agg.count,
        metros: Array.from(agg.metros).sort(),
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
    generated_at: new Date().toISOString(),
    resolution,
    point_count: points.length,
  };
}
