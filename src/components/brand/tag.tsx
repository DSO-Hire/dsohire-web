import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

/**
 * Tag — the house chip. Square (no radius, ever), quiet, sentence case.
 *
 * House doctrine (2026-07-06 design-language sweep): color is earned —
 * heritage = fit/success/hired, gold = money/offer, brick = closed/
 * danger-adjacent, corporate = corporate-scope, and the semantic families
 * (warning/danger/success/info) for state. A chip whose meaning isn't one
 * of those semantics is `neutral`. Tones map ONLY to brand/semantic
 * tokens — never raw Tailwind palette classes.
 *
 * `accent` swaps the tinted fill for the house signature: a 2px left
 * accent bar in the tone color (echoes the deck's accent-word pattern).
 * Use it for the one chip on a card that deserves emphasis.
 *
 * Replaces shadcn <Badge> on visible surfaces; badge.tsx stays for
 * internals until the migration completes, then retires.
 */
const TAG_TONES = {
  neutral: "bg-ink/5 text-slate-body",
  heritage: "bg-heritage/10 text-heritage",
  gold: "bg-stage-bronze/10 text-stage-bronze",
  brick: "bg-stage-brick/10 text-stage-brick",
  navy: "bg-stage-navy/10 text-stage-navy",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  corporate: "bg-corporate-bg text-corporate",
} as const;

export type TagTone = keyof typeof TAG_TONES;

export function Tag({
  tone = "neutral",
  accent = false,
  className,
  ...props
}: {
  tone?: TagTone;
  /** House move: 2px left accent bar in the tone color instead of a pill. */
  accent?: boolean;
} & ComponentPropsWithoutRef<"span">) {
  return (
    <span
      data-slot="tag"
      data-tone={tone}
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap px-2 text-xs font-semibold [&>svg]:size-3 [&>svg]:shrink-0",
        TAG_TONES[tone],
        accent && "border-l-2 border-l-current pl-1.5",
        className
      )}
      {...props}
    />
  );
}
