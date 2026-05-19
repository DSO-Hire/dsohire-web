/**
 * Heatmap overlay helper for JobsMap — Phase D deck.gl integration.
 *
 * Fetches the pre-aggregated GeoJSON from /api/jobs/heatmap.json,
 * constructs a deck.gl GeoJsonLayer with a 6-step quantile color ramp
 * (heritage tints) and mounts it on top of the existing Mapbox canvas
 * via MapboxOverlay.
 *
 * Day 2 scope (foundational):
 *   • Mount the layer + render hexes
 *   • Color ramp + alpha
 *   • Lifecycle hooks
 *
 * Day 3 additions (this file):
 *   • setOpacity(0-1) on the handle for zoom-driven crossfade
 *   • pickable=true + onHover handler that drives a Mapbox popup
 *     (passed in by the caller — JobsMap owns the popup instance)
 *   • onClick handler that flies the map to the hex center at zoom 9
 *     so the user transitions into the metro-pin view smoothly
 *
 * Day 4 follow-up:
 *   • Wire into the style picker proper (replace ?heatmap=1 flag)
 *   • Update privacy footnote copy
 */

import type {
  HeatmapFeatureCollection,
  HeatmapHexFeature,
} from "@/lib/geocoding/h3-aggregate";

/** Brand-aligned 6-step ramp: muted heritage-tint → heritage-deep.
 *  Earlier version started from #ECE7DB (ivory-deep) which read as
 *  invisible against the cream basemap — even the densest hexes
 *  looked like empty outlines because all the visual weight was in
 *  the stroke. New ramp starts from a saturated heritage-tint so the
 *  lowest bucket still contrasts cleanly against ivory/cream. */
const RAMP_COLORS: Array<[number, number, number, number]> = [
  [177, 198, 187, 220], // muted heritage-tint (sparsest, still visible)
  [142, 178, 161, 225],
  [108, 158, 136, 230],
  [77, 122, 96, 235],  // #4D7A60 — heritage
  [62, 102, 80, 240],
  [47, 93, 79, 245],   // #2F5D4F — heritage-deep (densest)
];

function quantileThresholds(counts: number[]): number[] {
  if (counts.length === 0) return [0, 0, 0, 0, 0];
  const sorted = [...counts].sort((a, b) => a - b);
  const step = sorted.length / 6;
  return [1, 2, 3, 4, 5].map((i) => {
    const idx = Math.min(Math.floor(step * i), sorted.length - 1);
    return sorted[idx]!;
  });
}

function colorForCount(
  count: number,
  thresholds: number[]
): [number, number, number, number] {
  for (let i = 0; i < thresholds.length; i++) {
    if (count <= thresholds[i]!) return RAMP_COLORS[i]!;
  }
  return RAMP_COLORS[RAMP_COLORS.length - 1]!;
}

/** Compute polygon centroid from boundary coords. Used to anchor
 *  the popup and to compute the flyTo target on click. */
function polygonCentroid(ring: number[][]): [number, number] {
  let lngSum = 0;
  let latSum = 0;
  // First vertex is duplicated at the end of GeoJSON polygon rings —
  // skip the last entry to avoid double-counting it in the centroid.
  const n = ring.length - 1;
  for (let i = 0; i < n; i++) {
    lngSum += ring[i]![0]!;
    latSum += ring[i]![1]!;
  }
  return [lngSum / n, latSum / n];
}

export interface HeatmapOverlayHandle {
  /** Re-fetch the heatmap data + rebuild the layer. */
  refresh: () => Promise<void>;
  /** Update the layer's opacity (0-1) for the zoom-driven crossfade.
   *  Skips the rebuild if overlay isn't initialized yet. */
  setOpacity: (opacity: number) => void;
  /** Remove the overlay from the map and release its resources. */
  destroy: () => void;
}

export interface AttachOpts {
  /** Mapbox popup instance owned by JobsMap. The overlay drives it
   *  on hex hover (set HTML + lngLat + addTo); JobsMap is responsible
   *  for popup lifecycle (creation + final removal on unmount). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  popup?: any;
}

/**
 * Attach the heatmap overlay to an initialized Mapbox map.
 */
export async function attachHeatmapOverlay(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  map: any,
  opts: AttachOpts = {}
): Promise<HeatmapOverlayHandle> {
  const [{ GeoJsonLayer }, { MapboxOverlay }] = await Promise.all([
    import("@deck.gl/layers"),
    import("@deck.gl/mapbox"),
  ]);

  let collection: HeatmapFeatureCollection | null = null;
  let thresholds: number[] = [0, 0, 0, 0, 0];
  let currentOpacity = 1;

  const fetchCollection = async (): Promise<HeatmapFeatureCollection> => {
    const res = await fetch("/api/jobs/heatmap.json", { cache: "default" });
    if (!res.ok) {
      throw new Error(
        `heatmap fetch failed: ${res.status} ${res.statusText}`
      );
    }
    return (await res.json()) as HeatmapFeatureCollection;
  };

  const onHover = (info: {
    object?: HeatmapHexFeature | null;
    x?: number;
    y?: number;
  }) => {
    const popup = opts.popup;
    if (!popup) return;
    const f = info.object;
    if (!f || !f.properties) {
      popup.remove();
      return;
    }
    const ring = f.geometry.coordinates[0]!;
    const centroid = polygonCentroid(ring);
    const { count, metros } = f.properties;
    const metroLine =
      metros.length === 0
        ? "Multiple metros"
        : metros.length <= 3
          ? metros.join(", ")
          : `${metros.slice(0, 3).join(", ")} +${metros.length - 3} more`;
    const html =
      `<div style="font-family: var(--font-manrope, system-ui); padding: 4px 2px;">` +
      `<div style="font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #2F5D4F; margin-bottom: 4px;">Hiring density</div>` +
      `<div style="font-size: 16px; font-weight: 800; color: #14233F; margin-bottom: 2px;">${count} open ${count === 1 ? "role" : "roles"}</div>` +
      `<div style="font-size: 12px; color: #4A6278;">${metroLine}</div>` +
      `</div>`;
    popup.setLngLat(centroid).setHTML(html).addTo(map);
  };

  const onClick = (info: { object?: HeatmapHexFeature | null }) => {
    const f = info.object;
    if (!f || !f.geometry) return;
    const ring = f.geometry.coordinates[0]!;
    const centroid = polygonCentroid(ring);
    // FlyTo zoom 9 transitions the user into metro-pin view via the
    // zoom-driven crossfade — they pan in, the hex fades out, the
    // metro pin underneath becomes legible.
    map.flyTo({
      center: centroid,
      zoom: 9,
      duration: 1000,
    });
  };

  const buildLayer = () => {
    if (!collection) return null;
    return new GeoJsonLayer<HeatmapHexFeature["properties"]>({
      id: "dsohire-heatmap",
      data: collection.features,
      pickable: true,
      stroked: true,
      filled: true,
      opacity: currentOpacity,
      lineWidthMinPixels: 1.5,
      getLineWidth: 1.5,
      // Heritage-deep stroke at higher alpha — frames each hex clearly
      // against the basemap so even sparse-bucket fills read as
      // intentional polygons, not pale blobs.
      getLineColor: [47, 93, 79, 200],
      getFillColor: (f) =>
        colorForCount(
          (f.properties as { count: number }).count,
          thresholds
        ),
      onHover,
      onClick,
    });
  };

  // interleaved:false renders deck.gl as a top-of-stack overlay canvas
  // independent of the Mapbox layer order. With interleaved:true on the
  // custom "DSO Hire" Studio style, layers were silently dropped because
  // the style doesn't expose deck.gl-compatible insertion points. The
  // overlay tradeoff: deck.gl always paints over Mapbox labels, which
  // is fine here since hexes obscure labels at heatmap zoom anyway.
  const overlay = new MapboxOverlay({
    interleaved: false,
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

  const setOpacity = (opacity: number) => {
    // Clamp + dedupe — many zoom events fire per drag; only rebuild
    // when the opacity actually changes meaningfully.
    const clamped = Math.max(0, Math.min(1, opacity));
    if (Math.abs(clamped - currentOpacity) < 0.01) return;
    currentOpacity = clamped;
    if (!collection) return;
    const layer = buildLayer();
    overlay.setProps({ layers: layer ? [layer] : [] });
  };

  await refresh();

  return {
    refresh,
    setOpacity,
    destroy: () => {
      try {
        map.removeControl(overlay);
      } catch {
        /* map may already be torn down */
      }
    },
  };
}
