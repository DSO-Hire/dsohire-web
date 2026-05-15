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
  // Match TTF/OTF only — never WOFF2.
  const match = css.match(
    /src:\s*url\((https:\/\/[^)]+)\)\s*format\(['"](?:truetype|opentype)['"]\)/,
  );
  if (!match) {
    throw new Error(
      `No TTF/OTF URL in Google Fonts CSS for ${family}@${weight} — got: ${css.slice(0, 300)}`,
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
    "DSO Hire THE DENTAL-ONLY HIRING PLATFORM Dental hiring, done direct. Built for multi-location DSOs and dental professionals. dsohire.com";

  const [manropeBold, manropeExtraBold] = await Promise.all([
    loadGoogleFontTtf("Manrope", 700, glyphPool),
    loadGoogleFontTtf("Manrope", 800, glyphPool),
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
