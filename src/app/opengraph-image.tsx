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
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens — kept in sync with src/app/globals.css.
const INK = "#14233F";
const HERITAGE = "#4D7A60";
const HERITAGE_LIGHT = "#6B9279";
const HERITAGE_DEEP = "#2F5D4F";
const IVORY = "#F7F4ED";
const SLATE_BODY = "#4A6278";

/**
 * Fetch a font binary in a format Satori actually supports.
 *
 * Why not Google Fonts: Google now serves WOFF2 to modern UAs, and Satori
 * (the renderer behind next/og) explicitly does NOT support WOFF2 — it
 * throws "Unsupported OpenType signature wOF2" at render time. Satori
 * supports OTF, TTF, and WOFF (v1).
 *
 * Solution: pull straight from the @fontsource v4 CDN on jsDelivr, which
 * publishes raw .woff files at a stable, versioned URL. Skips the
 * CSS-of-CSS dance entirely.
 */
async function loadFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Font fetch failed (${res.status}) for ${url}`);
  }
  return res.arrayBuffer();
}

const MANROPE_BOLD =
  "https://cdn.jsdelivr.net/npm/@fontsource/manrope@4.5.5/files/manrope-latin-700-normal.woff";
const MANROPE_EXTRABOLD =
  "https://cdn.jsdelivr.net/npm/@fontsource/manrope@4.5.5/files/manrope-latin-800-normal.woff";

export default async function OpengraphImage() {
  const [manropeBold, manropeExtraBold] = await Promise.all([
    loadFont(MANROPE_BOLD),
    loadFont(MANROPE_EXTRABOLD),
  ]);

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

        {/* Top — brand mark + wordmark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            zIndex: 1,
          }}
        >
          {/* The D-form brand mark with heritage crossbar — mirrors BrandLockup */}
          <svg width={56} height={56} viewBox="0 0 44 44">
            <path
              d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
              fill="none"
              stroke={INK}
              strokeWidth={4.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              x1={8}
              y1={22}
              x2={24}
              y2={22}
              stroke={HERITAGE}
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          </svg>
          <span
            style={{
              fontSize: 38,
              fontWeight: 800,
              color: INK,
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            DSO Hire
          </span>
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
            Built for multi-location DSOs and dental professionals.
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
