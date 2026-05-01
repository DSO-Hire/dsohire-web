/**
 * Mapbox geocoding helper — converts a (city, state) pair into latitude /
 * longitude coordinates for the public /jobs map view.
 *
 * Privacy contract: this helper deliberately accepts only city + state.
 * It never accepts a street address. That guarantees the coordinates we
 * persist to dso_locations are at city-center granularity, not house-level
 * granularity, and the radius-circle map UI never leaks a precise office
 * location.
 *
 * Usage:
 *   const result = await geocodeCityState("Overland Park", "KS");
 *   if (result) await db.update({ latitude: result.lat, longitude: result.lng });
 *
 * Failures (network, rate limit, no match) return null and log a warning.
 * Callers should NEVER throw on a geocoding failure — the location row
 * must still save without coordinates so the user isn't blocked.
 */

const MAPBOX_GEOCODING_BASE =
  "https://api.mapbox.com/geocoding/v5/mapbox.places";

export interface GeocodeResult {
  lat: number;
  lng: number;
  /** Mapbox's place_name string, e.g. "Overland Park, Kansas, United States". */
  formatted: string;
}

export async function geocodeCityState(
  city: string | null | undefined,
  state: string | null | undefined
): Promise<GeocodeResult | null> {
  const cityClean = (city ?? "").trim();
  const stateClean = (state ?? "").trim();
  if (!cityClean || !stateClean) return null;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    console.warn(
      "[geocoding] NEXT_PUBLIC_MAPBOX_TOKEN missing — skipping geocode"
    );
    return null;
  }

  // Restrict to place (city) + region (state) types so we never accidentally
  // return a sub-city result. country=us scopes to the USA per launch market.
  const query = encodeURIComponent(`${cityClean}, ${stateClean}`);
  const url = `${MAPBOX_GEOCODING_BASE}/${query}.json?country=us&types=place,region&limit=1&access_token=${encodeURIComponent(
    token
  )}`;

  try {
    const res = await fetch(url, {
      // Cache results for a day at the edge — city centroids don't move.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      console.warn(
        `[geocoding] mapbox returned ${res.status} for "${cityClean}, ${stateClean}"`
      );
      return null;
    }
    const json = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        center?: [number, number]; // [lng, lat] per Mapbox convention
      }>;
    };
    const top = json.features?.[0];
    if (!top || !top.center || top.center.length !== 2) {
      console.warn(
        `[geocoding] no result for "${cityClean}, ${stateClean}"`
      );
      return null;
    }
    const [lng, lat] = top.center;
    return {
      lat,
      lng,
      formatted: top.place_name ?? `${cityClean}, ${stateClean}`,
    };
  } catch (err) {
    console.warn("[geocoding] fetch failed", err);
    return null;
  }
}
