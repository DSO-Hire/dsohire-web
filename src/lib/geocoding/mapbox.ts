/**
 * Mapbox geocoding helpers.
 *
 * Two distinct entry points with different privacy properties:
 *
 *   geocodeCityState(city, state)
 *     → city-centroid coordinates. Powers the PUBLIC /jobs map view.
 *       Never accepts a street address. Persists to
 *       dso_locations.latitude / longitude.
 *
 *   geocodeStreetAddress({ line1, city, state, postal })
 *     → street-precise coordinates. Powers the EMPLOYER-FACING map
 *       view (Map Phase C, 2026-05-18). Persists to
 *       dso_locations.precise_latitude / precise_longitude. The
 *       application layer enforces that these columns NEVER render
 *       on candidate-facing surfaces — only to authenticated DSO
 *       members viewing their own locations.
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

/**
 * Forward-geocode a full street address to street-level coordinates.
 *
 * Privacy: the result must ONLY be stored in dso_locations.precise_*
 * columns and ONLY rendered to authenticated members of the owning
 * DSO. There is no public-read path for these coordinates by design.
 *
 * Address fields are concatenated in Mapbox's canonical order. If
 * line1 is missing we fall back to null (caller should skip the
 * write rather than silently geocode the city).
 */
export interface StreetAddressInput {
  line1: string | null | undefined;
  city: string | null | undefined;
  state: string | null | undefined;
  postal: string | null | undefined;
}

export async function geocodeStreetAddress(
  input: StreetAddressInput
): Promise<GeocodeResult | null> {
  const line1 = (input.line1 ?? "").trim();
  const cityClean = (input.city ?? "").trim();
  const stateClean = (input.state ?? "").trim();
  const postal = (input.postal ?? "").trim();
  // line1 is the load-bearing field — without it we'd just be re-doing
  // the city-centroid geocode under a different name. Refuse.
  if (!line1) return null;
  if (!cityClean || !stateClean) return null;

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    console.warn(
      "[geocoding] NEXT_PUBLIC_MAPBOX_TOKEN missing — skipping street geocode"
    );
    return null;
  }

  // Restrict to address-level result types and require autocomplete=false
  // so we don't get fuzzy partial-string matches. country=us scopes to
  // the USA per launch market.
  const parts = [line1, cityClean, `${stateClean} ${postal}`.trim()]
    .filter(Boolean)
    .join(", ");
  const query = encodeURIComponent(parts);
  const url = `${MAPBOX_GEOCODING_BASE}/${query}.json?country=us&types=address&autocomplete=false&limit=1&access_token=${encodeURIComponent(
    token
  )}`;

  try {
    const res = await fetch(url, {
      // Slightly shorter edge cache than the city geocode — street addresses
      // can change owners / suites more readily than city centroids.
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) {
      console.warn(
        `[geocoding] mapbox returned ${res.status} for street "${parts}"`
      );
      return null;
    }
    const json = (await res.json()) as {
      features?: Array<{
        place_name?: string;
        center?: [number, number]; // [lng, lat]
        relevance?: number;
      }>;
    };
    const top = json.features?.[0];
    if (!top || !top.center || top.center.length !== 2) {
      console.warn(`[geocoding] no street result for "${parts}"`);
      return null;
    }
    // Mapbox returns relevance 0..1; reject results below 0.7 to avoid
    // accidentally pinning to a generic city center when the address
    // couldn't be matched precisely.
    if (typeof top.relevance === "number" && top.relevance < 0.7) {
      console.warn(
        `[geocoding] low-relevance street result (${top.relevance}) for "${parts}" — skipping`
      );
      return null;
    }
    const [lng, lat] = top.center;
    return {
      lat,
      lng,
      formatted: top.place_name ?? parts,
    };
  } catch (err) {
    console.warn("[geocoding] street fetch failed", err);
    return null;
  }
}
