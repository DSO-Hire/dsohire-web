/**
 * GET /api/jobs/heatmap.json — Phase D heatmap data endpoint.
 *
 * Returns a GeoJSON FeatureCollection of H3-binned hexagons covering
 * every DSO location with at least one active job. Each Feature is a
 * Polygon (the hex boundary) with `count` (sum of active jobs in the
 * hex) and `metros` (list of unique "City, ST" labels aggregated into
 * the hex — used by the map's hover popup).
 *
 * Caching:
 *   - Cache-Control: public, s-maxage=900, stale-while-revalidate=300
 *   - Vercel edge cache holds the response for 15 minutes; serves
 *     stale-then-revalidate for an extra 5 minutes after expiry.
 *     Hiring activity doesn't churn minute-to-minute, so the
 *     freshness budget is generous.
 *
 * The heatmap renders on /jobs map view (Phase D, Day 2+). The route
 * is intentionally public — same privacy posture as the metro-pin map
 * (only `public_dso_affiliation = true` locations are exposed; the
 * underlying RPC enforces this via WHERE clause).
 */

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  aggregateToHexFeatures,
  DEFAULT_HEATMAP_RESOLUTION,
  type HeatmapPoint,
} from "@/lib/geocoding/h3-aggregate";

// Edge cache window — 15 min fresh, 5 min stale-while-revalidate.
const CACHE_CONTROL =
  "public, s-maxage=900, stale-while-revalidate=300";

export async function GET() {
  const supabase = await createSupabaseServerClient();

  // Single RPC round-trip — get_heatmap_points pre-aggregates jobs
  // per location and filters to public + active rows.
  const { data, error } = await supabase.rpc("get_heatmap_points");

  if (error) {
    console.warn("[heatmap] get_heatmap_points failed", error);
    // Fail open — return an empty FeatureCollection rather than 500.
    // The map should gracefully render a "no data" state rather than
    // breaking the page.
    return NextResponse.json(
      {
        type: "FeatureCollection" as const,
        features: [],
        generated_at: new Date().toISOString(),
        resolution: DEFAULT_HEATMAP_RESOLUTION,
        point_count: 0,
        error: "data_fetch_failed",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const rows = (data ?? []) as Array<{
    latitude: number;
    longitude: number;
    job_count: number;
    metro: string | null;
  }>;

  const points: HeatmapPoint[] = rows.map((r) => ({
    latitude: r.latitude,
    longitude: r.longitude,
    jobCount: Number(r.job_count) || 0,
    metro: r.metro,
  }));

  const collection = aggregateToHexFeatures(points);

  return NextResponse.json(collection, {
    status: 200,
    headers: {
      "Cache-Control": CACHE_CONTROL,
      // Lets downstream caches (CDN, browser) key by Accept since the
      // route is JSON-only — defensive against future Accept-headered
      // variants of the same endpoint (e.g. /heatmap.png renderer).
      Vary: "Accept",
    },
  });
}
