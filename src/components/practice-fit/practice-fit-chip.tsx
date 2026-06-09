/**
 * <PracticeFitChip /> — colored bucket pill (Phase 5D; #49 two-tranche colors).
 *
 * Server component. Pure rendering — caller passes the FitResult (or null).
 * Product-aware: PracticeFit results render a NAVY ramp + sparkle mark,
 * DSOFit results a HERITAGE ramp + corporate mark, with the brand name in the
 * label so color never carries the meaning alone. Darker shade = stronger.
 *
 * Two sizes: sm (kanban + list rows), md (detail headers). Renders nothing when
 * fit is null (consent off, no compute yet); caller owns any empty state.
 */

import { Building2 } from "lucide-react";
import { PracticeFitMark } from "@/components/practice-fit/brand/practice-fit-mark";
import { bucketStyle } from "@/lib/practice-fit/buckets";
import type { FitResult } from "@/lib/practice-fit/types";

export interface PracticeFitChipProps {
  fit: FitResult | null;
  size?: "sm" | "md";
  /** Show the raw 0-100 score as a small subscript next to the bucket label. */
  showScore?: boolean;
}

export function PracticeFitChip({
  fit,
  size = "sm",
  showScore = false,
}: PracticeFitChipProps) {
  if (!fit) return null;
  const product = fit.product ?? "practicefit";
  const style = bucketStyle(fit.bucket, product);
  const brand = product === "dsofit" ? "DSOFit" : "PracticeFit";
  const markClass = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";
  const mark =
    product === "dsofit" ? (
      <Building2 className={`${markClass} text-current`} />
    ) : (
      <PracticeFitMark className={markClass} />
    );

  if (size === "sm") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${style.bgClass} ${style.textClass} ${style.borderClass}`}
        title={buildChipTooltip(fit, style.label, brand)}
      >
        {mark}
        {style.label}
        {showScore && (
          <span className="font-mono text-[9px] opacity-70">{fit.score}</span>
        )}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tracking-wider uppercase ${style.bgClass} ${style.textClass} ${style.borderClass}`}
      title={buildChipTooltip(fit, style.label, brand)}
    >
      {mark}
      {brand} · {style.label}
      {showScore && (
        <span className="font-mono text-[10px] opacity-70">
          {fit.score}/100
        </span>
      )}
    </span>
  );
}

/**
 * Tooltip body — natural-language transparency, kept tight. Coverage info
 * appears only when the score is based on partial data.
 */
function buildChipTooltip(
  fit: FitResult,
  bucketLabel: string,
  brand: string
): string {
  const base = `${brand} · ${bucketLabel} · ${fit.score}/100`;
  if (fit.coverage && fit.coverage.scored_count < fit.coverage.total_count) {
    return `${base} · Based on ${fit.coverage.scored_count} of ${fit.coverage.total_count} dimensions`;
  }
  return base;
}
