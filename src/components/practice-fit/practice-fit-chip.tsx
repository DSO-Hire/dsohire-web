/**
 * <PracticeFitChip /> — colored bucket pill (Phase 5D).
 *
 * Server component. Pure rendering — no fetching here. Caller passes
 * the FitResult (or null) and the component handles the visual.
 *
 * Two sizes:
 *   • size="sm" — kanban + list rows (compact, label only on hover/title)
 *   • size="md" — application detail header + candidate job detail
 *
 * Renders nothing when fit is null (consent off, no compute yet, etc).
 * Caller is responsible for any "Practice Fit not enabled" empty state.
 */

import { Sparkles } from "lucide-react";
import { BUCKET_STYLES } from "@/lib/practice-fit/buckets";
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
  const style = BUCKET_STYLES[fit.bucket];

  if (size === "sm") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${style.bgClass} ${style.textClass} ${style.borderClass}`}
        title={`Practice Fit · ${style.label} · ${fit.score}/100`}
      >
        <Sparkles className="h-2.5 w-2.5" aria-hidden />
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
      title={`Practice Fit · ${style.label} · ${fit.score}/100`}
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      Practice Fit · {style.label}
      {showScore && (
        <span className="font-mono text-[10px] opacity-70">
          {fit.score}/100
        </span>
      )}
    </span>
  );
}
