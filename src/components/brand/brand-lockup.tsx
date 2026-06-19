/**
 * BrandLockup — the DSO Hire logo lockup: the D-form mark (navy D + heritage
 * crossbar / implied H) + hairline divider + stacked DSO / HIRE wordmark.
 *
 * Dependency-free (pure SVG) on purpose: the canonical copy used to live inside
 * marketing/site-shell.tsx, but that module transitively imports server-only
 * code (next/headers via the Supabase server client). Importing the lockup from
 * there pulled the server dependency into client bundles and broke the
 * Turbopack build. This standalone version is safe to import anywhere — client
 * wizards included.
 *
 * Keep the silhouette in sync with marketing/site-shell's BrandLockup,
 * components/brand/brand-mark, /public/logo-*.svg, and Brand Assets/logo-files/.
 */
export function BrandLockup({
  dark,
  height = 36,
}: {
  dark?: boolean;
  height?: number;
}) {
  // `dark` forces light ink for placement on a dark surface (e.g. the navy
  // rail) regardless of app theme. When omitted, the lockup follows the theme
  // via the ink/heritage/border tokens (navy in light, ivory in dark).
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 124 44"
      height={height}
      style={{ height, width: "auto" }}
      role="img"
      aria-label="DSO Hire"
    >
      <path
        d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
        fill="none"
        className={dark ? undefined : "stroke-ink"}
        stroke={dark ? "#F7F4ED" : undefined}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="8"
        y1="22"
        x2="24"
        y2="22"
        className="stroke-heritage"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="52"
        y1="6"
        x2="52"
        y2="38"
        className={dark ? undefined : "stroke-border-2"}
        stroke={dark ? "rgba(247,244,237,0.18)" : undefined}
        strokeWidth="0.8"
      />
      <text
        x="58"
        y="28"
        fontFamily="'Manrope', 'Helvetica Neue', Arial, sans-serif"
        fontSize="26"
        fontWeight="800"
        letterSpacing="-0.8"
        className={dark ? undefined : "fill-ink"}
        fill={dark ? "#F7F4ED" : undefined}
        textLength="52"
        lengthAdjust="spacingAndGlyphs"
      >
        DSO
      </text>
      <text
        x="58"
        y="38"
        fontFamily="'Manrope', 'Helvetica Neue', Arial, sans-serif"
        fontSize="9.5"
        fontWeight="500"
        className="fill-heritage"
        textLength="52"
        lengthAdjust="spacing"
      >
        HIRE
      </text>
    </svg>
  );
}
