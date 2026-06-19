/**
 * <PracticeFitWordmark /> — the PracticeFit lockup (sparkle + two-tone
 * wordmark), Direction 01, locked 2026-06-03.
 *
 * Navy "Practice" + heritage "Fit", one word, with the sparkle on the
 * cap-height centerline. Set in Manrope (the app font-sans). Pure
 * rendering, server-safe. Size it with a text-* class on `className`
 * (everything scales in em).
 *
 *   <PracticeFitWordmark className="text-xl" />          // default, on light
 *   <PracticeFitWordmark surface="dark" />               // on navy/photos
 *   <PracticeFitWordmark tm />                            // first/marketing use
 *   <PracticeFitWordmark pill />                          // emphasis (chip-style)
 *
 * For emails or non-React surfaces use the static files in
 * /public/brand/practicefit/.
 */
import { PracticeFitMark } from "./practice-fit-mark";

export type PracticeFitSurface =
  | "light"
  | "dark"
  | "heritage"
  | "mono-navy"
  | "mono-ivory"
  /** Inherit the parent's text color (single-tone) — for colored headers
   *  whose text color changes by state, e.g. the bucket-colored fit bar. */
  | "inherit";

interface SurfaceColors {
  practice: string;
  fit: string;
  spark: string;
  pillBg: string;
}

const SURFACES: Record<PracticeFitSurface, SurfaceColors> = {
  light: {
    practice: "text-ink",
    fit: "text-heritage",
    spark: "text-heritage",
    pillBg: "bg-heritage/15",
  },
  dark: {
    // On a permanently-navy/photo surface: use hero-foreground (stays light
    // in BOTH themes) rather than text-ivory (which flips dark in dark mode).
    practice: "text-hero-foreground",
    fit: "text-heritage-light",
    spark: "text-heritage-light",
    pillBg: "bg-hero-foreground/10",
  },
  heritage: {
    practice: "text-ivory",
    fit: "text-ink",
    spark: "text-ivory",
    pillBg: "bg-ivory/15",
  },
  "mono-navy": {
    practice: "text-ink",
    fit: "text-ink",
    spark: "text-ink",
    pillBg: "bg-ink/10",
  },
  "mono-ivory": {
    practice: "text-ivory",
    fit: "text-ivory",
    spark: "text-ivory",
    pillBg: "bg-ivory/10",
  },
  // No color classes → "Practice", "Fit" and the sparkle all inherit the
  // parent's currentColor. Single-tone, but legible on any background.
  inherit: {
    practice: "",
    fit: "",
    spark: "",
    pillBg: "bg-current/10",
  },
};

export interface PracticeFitWordmarkProps {
  surface?: PracticeFitSurface;
  /** Show the ™ — use on first/most prominent appearance, not in UI chrome. */
  tm?: boolean;
  /** Wrap in the score-chip pill (emphasis variant). */
  pill?: boolean;
  /** Size + spacing: pass a text-* class (e.g. "text-2xl"). */
  className?: string;
}

export function PracticeFitWordmark({
  surface = "light",
  tm = false,
  pill = false,
  className,
}: PracticeFitWordmarkProps) {
  const c = SURFACES[surface];
  const inner = (
    <span className="inline-flex items-center font-sans font-extrabold leading-none tracking-[-0.03em]">
      <span className={`mr-[0.16em] flex ${c.spark}`} aria-hidden>
        <PracticeFitMark className="h-[0.6em] w-[0.6em] -translate-y-[0.02em]" />
      </span>
      <span className={c.practice}>Practice</span>
      <span className={c.fit}>
        Fit
        {tm ? (
          <sup className="ml-[0.06em] align-super text-[0.42em] font-bold">
            ™
          </sup>
        ) : null}
      </span>
    </span>
  );

  return (
    <span
      className={[
        "inline-flex items-center",
        pill ? `rounded-full px-[0.7em] py-[0.32em] ${c.pillBg}` : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      // Accessible name for screen readers; the visible mark is split spans.
      role="img"
      aria-label={tm ? "PracticeFit, trademark" : "PracticeFit"}
    >
      {inner}
    </span>
  );
}
