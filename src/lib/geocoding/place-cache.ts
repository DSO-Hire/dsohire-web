/**
 * Desired-market geocode cache for Practice Fit v2 (Phase A.2).
 *
 * The candidate already stores their target markets as canonical "City, ST"
 * strings in `candidates.desired_locations`. To score real commute distance
 * we need coordinates for those markets — but geocoding on every score
 * compute would be non-deterministic and rate-limited. So we resolve once
 * and persist the centroids on the candidate row (desired_location_points),
 * reusing them on subsequent computes.
 *
 * Privacy: only city + state is ever geocoded (geocodeCityState). These are
 * the markets the candidate WANTS, not where they live — we never geocode a
 * home or street address.
 */

import { geocodeCityState } from "./mapbox";

export interface PlacePoint {
  /** The canonical "City, ST" label this point was derived from. */
  label: string;
  lat: number;
  lng: number;
}

/** Parse a canonical "City, ST" string into its parts. */
function parseCityState(s: string): { city: string; state: string } | null {
  const idx = s.lastIndexOf(",");
  if (idx === -1) return null;
  const city = s.slice(0, idx).trim();
  const state = s.slice(idx + 1).trim();
  if (!city || !state) return null;
  return { city, state };
}

/** Coerce a stored jsonb value into a clean PlacePoint[]. */
export function parsePlacePoints(raw: unknown): PlacePoint[] {
  if (!Array.isArray(raw)) return [];
  const out: PlacePoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label : null;
    const lat = typeof o.lat === "number" ? o.lat : null;
    const lng = typeof o.lng === "number" ? o.lng : null;
    if (label && lat != null && lng != null) out.push({ label, lat, lng });
  }
  return out;
}

/**
 * Resolve the candidate's desired_locations to centroids, reusing
 * already-stored points whose labels still match and geocoding only the
 * new ones. Returns the resolved points plus whether the set changed
 * (so the caller can decide to persist).
 *
 * Geocode failures are skipped (the point is simply absent) — the location
 * scorer falls back to string/state matching when a point is missing, so a
 * transient geocode miss never hard-breaks the score.
 */
export async function resolveDesiredLocationPoints(
  desiredLocations: string[] | null | undefined,
  existing: PlacePoint[]
): Promise<{ points: PlacePoint[]; changed: boolean }> {
  const wanted = (desiredLocations ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const byLabel = new Map(existing.map((p) => [p.label.toLowerCase(), p]));
  const out: PlacePoint[] = [];

  for (const label of wanted) {
    const hit = byLabel.get(label.toLowerCase());
    if (hit) {
      out.push(hit);
      continue;
    }
    const cs = parseCityState(label);
    if (!cs) continue;
    const g = await geocodeCityState(cs.city, cs.state);
    if (g) out.push({ label, lat: g.lat, lng: g.lng });
  }

  // "Changed" = the resolved label set differs from what we already had.
  const before = existing.map((p) => p.label.toLowerCase()).sort();
  const after = out.map((p) => p.label.toLowerCase()).sort();
  const changed =
    before.length !== after.length ||
    before.some((l, i) => l !== after[i]);

  return { points: out, changed };
}
