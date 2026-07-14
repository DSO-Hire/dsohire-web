/**
 * Dynamic OG image for dsohire.com — Next.js MetadataRoute convention.
 *
 * Rendered at request time via `next/og` (Satori under the hood). Lives in
 * version control alongside the brand, so any change to the homepage
 * positioning can update the social-preview card too. Replaces the
 * pre-restructure opengraph-image.png.
 *
 * Fonts are pulled from Google Fonts at request time, subsetted to only
 * the glyphs we actually render (keeps the binary small).
 */

import { ImageResponse } from "next/og";

// Next.js metadata file convention — these exports drive the route.
export const alt = "DSO Hire — Dental hiring, done direct.";
// Canonical OG size. We tried 2x (2400x1260) on 2026-05-15 hoping it
// would make downscaled previews crisper, but it actually amplified
// the soft-text artifact from Google Fonts' subsetted-TTF endpoint —
// Satori's rasterizer + hinting-stripped subset font + LinkedIn's
// downscale pipeline compounded badly. Bulletproof next-session fix:
// commit the full Manrope TTF binaries to /public/fonts/ and read
// locally (no subsetting, full hinting tables).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens — kept in sync with src/app/globals.css.
const INK = "#14233F";
const HERITAGE = "#4D7A60";
const HERITAGE_LIGHT = "#6B9279";
const HERITAGE_DEEP = "#2F5D4F";
const IVORY = "#F7F4ED";
const SLATE_BODY = "#4A6278";
const DIVIDER = "rgba(20,35,63,0.18)";

// Canonical DSO Hire lockup wordmark — OUTLINED Manrope paths, copied verbatim
// from BrandLockup / /public/logo-on-light.svg (CANON locked 2026-07-07). The
// wordmark is NOT live text: "DSO" 26/800/-0.8 + "HIRE" 9.5/700 ink-flush. We
// inline the paths here (rather than importing BrandLockup) because Satori
// can't resolve the component's `fill-ink`/`fill-heritage` Tailwind tokens —
// only explicit fills render. Keep in sync with the component if canon changes.
const DSO_PATH =
  "M59.82 28.00L59.82 9.28L65.88 9.28Q66.10 9.28 66.79 9.29Q67.48 9.31 68.11 9.38Q70.38 9.66 71.95 10.96Q73.52 12.26 74.34 14.26Q75.16 16.26 75.16 18.64Q75.16 21.02 74.34 23.02Q73.52 25.02 71.95 26.32Q70.38 27.62 68.11 27.90Q67.48 27.97 66.79 27.99Q66.10 28.00 65.88 28.00ZM63.41 24.67L65.88 24.67Q66.23 24.67 66.83 24.65Q67.42 24.63 67.91 24.54Q69.13 24.30 69.90 23.40Q70.67 22.50 71.05 21.24Q71.42 19.98 71.42 18.64Q71.42 17.24 71.03 15.98Q70.65 14.71 69.87 13.84Q69.09 12.97 67.91 12.74Q67.42 12.63 66.83 12.62Q66.23 12.61 65.88 12.61L63.41 12.61ZM84.55 28.39Q82.47 28.39 80.80 27.66Q79.13 26.92 78.06 25.55Q76.99 24.18 76.70 22.28L80.39 21.73Q80.78 23.35 82.00 24.22Q83.23 25.09 84.79 25.09Q85.66 25.09 86.48 24.82Q87.30 24.54 87.82 24.01Q88.35 23.48 88.35 22.70Q88.35 22.41 88.26 22.14Q88.18 21.88 87.98 21.64Q87.79 21.41 87.43 21.20Q87.07 20.99 86.53 20.82L81.67 19.39Q81.12 19.24 80.40 18.95Q79.68 18.67 79.00 18.13Q78.33 17.60 77.88 16.72Q77.43 15.85 77.43 14.51Q77.43 12.62 78.38 11.37Q79.33 10.13 80.91 9.51Q82.50 8.90 84.42 8.92Q86.36 8.94 87.88 9.58Q89.40 10.22 90.43 11.43Q91.45 12.65 91.91 14.40L88.09 15.05Q87.88 14.14 87.32 13.52Q86.76 12.89 85.99 12.57Q85.22 12.24 84.37 12.22Q83.54 12.19 82.80 12.45Q82.07 12.70 81.61 13.18Q81.15 13.66 81.15 14.32Q81.15 14.94 81.52 15.32Q81.90 15.70 82.47 15.94Q83.04 16.17 83.64 16.33L86.89 17.21Q87.62 17.41 88.50 17.72Q89.39 18.04 90.20 18.61Q91.01 19.17 91.54 20.10Q92.07 21.02 92.07 22.44Q92.07 23.94 91.44 25.07Q90.80 26.19 89.74 26.93Q88.67 27.66 87.33 28.03Q85.98 28.39 84.55 28.39ZM102.16 28.39Q99.35 28.39 97.32 27.17Q95.28 25.95 94.18 23.75Q93.09 21.55 93.09 18.64Q93.09 15.73 94.18 13.53Q95.28 11.33 97.32 10.11Q99.35 8.89 102.16 8.89Q104.97 8.89 107.00 10.11Q109.04 11.33 110.14 13.53Q111.23 15.73 111.23 18.64Q111.23 21.55 110.14 23.75Q109.04 25.95 107.00 27.17Q104.97 28.39 102.16 28.39ZM102.16 25.06Q103.94 25.09 105.12 24.30Q106.31 23.50 106.90 22.05Q107.49 20.59 107.49 18.64Q107.49 16.69 106.90 15.26Q106.31 13.83 105.12 13.04Q103.94 12.24 102.16 12.22Q100.38 12.19 99.20 12.99Q98.01 13.78 97.42 15.23Q96.83 16.69 96.83 18.64Q96.83 20.59 97.42 22.02Q98.01 23.45 99.20 24.24Q100.38 25.04 102.16 25.06Z";
const HIRE_PATH =
  "M59.82 38.00L59.82 31.16L60.96 31.16L60.96 34.04L64.20 34.04L64.20 31.16L65.34 31.16L65.34 38.00L64.20 38.00L64.20 35.11L60.96 35.11L60.96 38.00ZM77.17 38.00L77.17 31.16L78.32 31.16L78.32 38.00ZM90.14 38.00L90.14 31.16L92.97 31.16Q93.07 31.16 93.23 31.17Q93.38 31.17 93.52 31.20Q94.11 31.29 94.50 31.59Q94.88 31.90 95.07 32.36Q95.26 32.82 95.26 33.39Q95.26 34.22 94.84 34.82Q94.41 35.43 93.54 35.57L93.05 35.61L91.29 35.61L91.29 38.00ZM94.07 38.00L92.72 35.22L93.89 34.96L95.37 38.00ZM91.29 34.54L92.92 34.54Q93.02 34.54 93.14 34.53Q93.26 34.52 93.36 34.49Q93.64 34.42 93.80 34.24Q93.97 34.06 94.04 33.83Q94.11 33.61 94.11 33.39Q94.11 33.17 94.04 32.94Q93.97 32.71 93.80 32.53Q93.64 32.35 93.36 32.28Q93.26 32.25 93.14 32.24Q93.02 32.23 92.92 32.23L91.29 32.23ZM106.82 38.00L106.82 31.16L111.23 31.16L111.23 32.23L107.96 32.23L107.96 33.92L110.66 33.92L110.66 34.99L107.96 34.99L107.96 36.93L111.23 36.93L111.23 38.00Z";

/**
 * Load a Google Font as TTF (Satori-compatible).
 *
 * Why the User-Agent trick: Google Fonts serves WOFF2 to modern browsers,
 * but Satori (the renderer behind next/og) doesn't support WOFF2 — it
 * throws "Unsupported OpenType signature wOF2". With an old Firefox UA
 * Google returns truetype URLs in the CSS instead, which Satori handles.
 *
 * The CSS-of-CSS dance: Google's stylesheet endpoint responds with a
 * tiny CSS file containing the actual font binary URL. Parse it out,
 * then fetch the binary.
 */
async function loadGoogleFontTtf(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({
    family: `${family}:wght@${weight}`,
    text,
  });
  const cssRes = await fetch(`https://fonts.googleapis.com/css2?${params}`, {
    headers: {
      // Firefox 3.6 — old enough that Google Fonts serves TTF, not WOFF2.
      "User-Agent":
        "Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.9.2.7) Gecko/20100713 Firefox/3.6.7",
    },
  });
  if (!cssRes.ok) {
    throw new Error(`Font CSS fetch failed (${cssRes.status}) for ${family}@${weight}`);
  }
  const css = await cssRes.text();
  // Match any url() in the CSS. With the Firefox 3.6 UA, Google's response
  // routes through fonts.gstatic.com/l/font?kit=... (subsetted TTF) — there's
  // no `format(...)` clause, just a bare url. Trust the old-UA contract.
  const match = css.match(/src:\s*url\((https?:\/\/[^)]+)\)/);
  if (!match) {
    throw new Error(
      `No font URL in Google Fonts CSS for ${family}@${weight} — got: ${css.slice(0, 300)}`,
    );
  }
  const fontRes = await fetch(match[1]);
  if (!fontRes.ok) {
    throw new Error(`Font binary fetch failed (${fontRes.status}) for ${family}@${weight}`);
  }
  return fontRes.arrayBuffer();
}

export default async function OpengraphImage() {
  // Only the glyphs we actually render — Google subsets the font to this set,
  // keeping the binary tiny (~5 KB per weight vs ~80 KB full).
  const glyphPool =
    "DSO Hire THE DENTAL-ONLY HIRING PLATFORM Dental hiring, done direct. Built for multi-location dental groups and dental professionals. dsohire.com";

  // Launch-hardening: the entire card depends on a request-time Google Fonts
  // fetch. If that fetch fails or times out the moment LinkedIn/Twitter first
  // scrape us, this route would 500 and the launch post unfurls broken. On
  // ANY font failure, fall back to the pre-rendered static card shipped in
  // /public — crawlers follow the redirect and get a correct 1200x630 PNG.
  // (Post-launch bulletproof fix per the note above: commit full Manrope
  // TTFs to /public/fonts and read locally instead of fetching.)
  let manropeBold: ArrayBuffer;
  let manropeExtraBold: ArrayBuffer;
  try {
    [manropeBold, manropeExtraBold] = await Promise.all([
      loadGoogleFontTtf("Manrope", 700, glyphPool),
      loadGoogleFontTtf("Manrope", 800, glyphPool),
    ]);
  } catch (err) {
    console.error(
      "[og-image] font fetch failed, serving static fallback:",
      err,
    );
    return Response.redirect(
      "https://dsohire.com/media/marketing/og-image.png",
      302,
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: IVORY,
          fontFamily: "Manrope",
          position: "relative",
        }}
      >
        {/* Heritage decorative circle, top-right — gives a subtle warmth */}
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -180,
            width: 540,
            height: 540,
            borderRadius: 9999,
            background: "rgba(77, 122, 96, 0.18)",
          }}
        />
        {/* Grid pattern — same brand texture used on the homepage hero */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage:
              "linear-gradient(rgba(20,35,63,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(20,35,63,0.05) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        {/* Top — canonical DSO Hire lockup (outlined paths, CANON 2026-07-07) */}
        <div style={{ display: "flex", alignItems: "center", zIndex: 1 }}>
          <svg width={220} height={78} viewBox="0 0 124 44">
            {/* D-form mark */}
            <path
              d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
              fill="none"
              stroke={INK}
              strokeWidth={4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Heritage crossbar — the implied H */}
            <line
              x1={8}
              y1={22}
              x2={24}
              y2={22}
              stroke={HERITAGE}
              strokeWidth={3}
              strokeLinecap="round"
            />
            {/* Divider rule between mark and wordmark */}
            <line x1={52} y1={6} x2={52} y2={38} stroke={DIVIDER} strokeWidth={0.8} />
            {/* DSO — outlined Manrope 26/800 */}
            <path d={DSO_PATH} fill={INK} />
            {/* HIRE — outlined Manrope 9.5/700, ink-flush to DSO */}
            <path d={HIRE_PATH} fill={HERITAGE} />
          </svg>
        </div>

        {/* Middle — eyebrow + headline */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: HERITAGE_DEEP,
              letterSpacing: 4,
              marginBottom: 22,
            }}
          >
            THE DENTAL-ONLY HIRING PLATFORM
          </div>
          <div
            style={{
              fontSize: 120,
              fontWeight: 800,
              color: INK,
              letterSpacing: -4,
              lineHeight: 1.0,
              display: "flex",
              flexWrap: "wrap",
              gap: 24,
            }}
          >
            <span style={{ display: "flex" }}>Dental hiring,</span>
            <span style={{ display: "flex", color: HERITAGE_LIGHT }}>
              done direct.
            </span>
          </div>
        </div>

        {/* Bottom — supporting line + URL */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 700,
              color: SLATE_BODY,
              letterSpacing: -0.3,
              maxWidth: 820,
            }}
          >
            Built for multi-location dental groups and dental professionals.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 800,
              color: INK,
              letterSpacing: 0.5,
            }}
          >
            dsohire.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Manrope",
          data: manropeBold,
          weight: 700,
          style: "normal",
        },
        {
          name: "Manrope",
          data: manropeExtraBold,
          weight: 800,
          style: "normal",
        },
      ],
    },
  );
}
