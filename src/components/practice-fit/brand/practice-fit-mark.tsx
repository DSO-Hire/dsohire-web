/**
 * <PracticeFitMark /> — the PracticeFit sparkle glyph (4-point).
 *
 * The brand icon for the PracticeFit feature (Direction 01, locked
 * 2026-06-03). Pure rendering, server-safe (no hooks). Defaults to
 * `currentColor` so it inherits the surrounding text color — drop it
 * straight into a chip/button and it matches the text. Pass a `tone`
 * for a fixed brand color when it stands alone.
 *
 * Sizing: scales to font-size if you give it em-based width/height
 * (e.g. className="h-[1em] w-[1em]"), or use h-3/w-3 etc.
 *
 * Master assets live in /public/brand/practicefit/ — this inline copy
 * is for in-app React surfaces.
 */
import type { SVGProps } from "react";

const TONES = {
  current: "currentColor",
  heritage: "#4D7A60",
  "heritage-light": "#6B9279",
  navy: "#14233F",
  ivory: "#F7F4ED",
} as const;

export type PracticeFitMarkTone = keyof typeof TONES;

export interface PracticeFitMarkProps
  extends Omit<SVGProps<SVGSVGElement>, "fill"> {
  /** Fixed brand color, or "current" (default) to inherit text color. */
  tone?: PracticeFitMarkTone;
  /** Accessible label. Omit for a decorative mark (aria-hidden). */
  title?: string;
}

export function PracticeFitMark({
  tone = "current",
  title,
  className,
  ...rest
}: PracticeFitMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={TONES[tone]}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      <path d="M12 1L15.3 8.7L23 12L15.3 15.3L12 23L8.7 15.3L1 12L8.7 8.7Z" />
    </svg>
  );
}
