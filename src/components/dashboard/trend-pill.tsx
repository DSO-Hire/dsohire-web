/**
 * TrendPill — small inline pill showing a delta vs. a previous period.
 *
 * Used next to KPI tile values to show direction and magnitude of change.
 * Three intents:
 *   - positive: heritage-tinted pill (good news — more apps, more jobs)
 *   - negative: red-tinted pill (red-50 / red-700)
 *   - neutral:  cream pill with slate-meta text (no change / not enough data)
 *
 * Sharp edges, no rounded corners — matches the rest of the brand voice.
 * Tracking-wide tiny caps style consistent with eyebrow labels site-wide.
 */

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

interface TrendPillProps {
  /** Numeric delta (e.g. +3, -2, 0). */
  delta: number;
  /** Optional context label rendered after the delta — e.g. "this week". */
  label?: string;
  /** Override automatic intent. Default: derived from sign of delta. */
  intent?: "positive" | "negative" | "neutral";
  /** When true (default for counts), render delta with explicit + sign. */
  showSign?: boolean;
}

export function TrendPill({
  delta,
  label,
  intent,
  showSign = true,
}: TrendPillProps) {
  const resolvedIntent =
    intent ?? (delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral");

  const styles =
    resolvedIntent === "positive"
      ? "bg-heritage/10 text-heritage-deep"
      : resolvedIntent === "negative"
        ? "bg-red-50 text-red-700"
        : "bg-cream text-slate-meta";

  const Icon =
    resolvedIntent === "positive"
      ? ArrowUpRight
      : resolvedIntent === "negative"
        ? ArrowDownRight
        : Minus;

  const formatted =
    showSign && delta > 0
      ? `+${delta}`
      : showSign && delta < 0
        ? String(delta)
        : delta === 0
          ? "0"
          : String(delta);

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.6px] whitespace-nowrap ${styles}`}
    >
      <Icon className="h-3 w-3" />
      {formatted}
      {label && <span className="font-semibold opacity-80">· {label}</span>}
    </span>
  );
}
