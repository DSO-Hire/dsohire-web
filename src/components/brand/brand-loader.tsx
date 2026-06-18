/**
 * BrandLoader — the DSO Hire D-mark, drawing itself on a loop, as a loading
 * indicator (Cam idea, Day 37). Reuses the brand's existing "draw-on" language
 * (same as the sidebar logo) so a lagging load reads as the brand signing in
 * rather than the page appearing to do nothing.
 *
 * Behaviour (all CSS — server-safe, instant; see globals.css `.bl-*`):
 *   • Fades in after a ~200ms beat, so FAST loads never flash it.
 *   • The arch + heritage crossbar draw on, then sweep off, seamlessly looped.
 *   • Reduced-motion shows the static mark.
 *
 * Use in a route `loading.tsx` (fullScreen) or inline inside a card/section.
 */
export function BrandLoader({
  label,
  fullScreen = false,
}: {
  /** Optional short caption under the mark (e.g. "Loading your dashboard"). */
  label?: string;
  /** Center in the full viewport — for route-level loading.tsx fallbacks. */
  fullScreen?: boolean;
}) {
  const mark = (
    <span className="bl-loader inline-flex flex-col items-center gap-3">
      <svg width="52" height="52" viewBox="0 0 44 44" aria-hidden="true">
        <path
          className="bl-arch"
          d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
          fill="none"
          stroke="#14233F"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          className="bl-bar"
          x1="8"
          y1="22"
          x2="24"
          y2="22"
          stroke="#4D7A60"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? (
        <span className="text-[11px] font-bold uppercase tracking-[2px] text-slate-meta">
          {label}
        </span>
      ) : null}
      <span className="sr-only">Loading…</span>
    </span>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        fullScreen
          ? "min-h-screen flex items-center justify-center bg-ivory"
          : "flex items-center justify-center py-16"
      }
    >
      {mark}
    </div>
  );
}
