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
  const ink = dark ? "#F7F4ED" : "#14233F";
  const dividerColor = dark ? "rgba(247,244,237,0.18)" : "rgba(20,35,63,0.18)";
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
        stroke={ink}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="8"
        y1="22"
        x2="24"
        y2="22"
        stroke="#4D7A60"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line x1="52" y1="6" x2="52" y2="38" stroke={dividerColor} strokeWidth="0.8" />
      <text
        x="58"
        y="28"
        fontFamily="'Manrope', 'Helvetica Neue', Arial, sans-serif"
        fontSize="26"
        fontWeight="800"
        letterSpacing="-0.8"
        fill={ink}
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
        fill="#4D7A60"
        textLength="52"
        lengthAdjust="spacing"
      >
        HIRE
      </text>
    </svg>
  );
}
