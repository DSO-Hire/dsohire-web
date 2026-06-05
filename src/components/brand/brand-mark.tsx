/**
 * BrandMark — the DSO Hire D-form mark, mark-only (no wordmark).
 *
 * The compact brand seal: the rounded D-form silhouette + heritage crossbar
 * (the implied H). Use it in tight spaces — tier-gate badges, favicons, app
 * icons, stamps — where the full lockup won't fit. For nav/footer use the
 * BrandLockup in marketing/site-shell instead.
 *
 * Sizing: pass a Tailwind size via `className` (e.g. "size-3.5"); the CSS
 * width/height override the 32×32 fallback attributes. Two-tone is intentional
 * (navy D + heritage crossbar) — it reads as a real logo even at 14px.
 *
 * Keep the silhouette in sync with BrandLockup / /public/logo-*.svg /
 * Brand Assets/logo-files/.
 */
export function BrandMark({
  dark,
  className,
}: {
  dark?: boolean;
  className?: string;
}) {
  const stroke = dark ? "#F7F4ED" : "#14233F";
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 44 44"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="DSO Hire"
    >
      {/* Outer D-form */}
      <path
        d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
        fill="none"
        stroke={stroke}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Heritage crossbar — implied H */}
      <line
        x1="8"
        y1="22"
        x2="24"
        y2="22"
        stroke="#4D7A60"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
