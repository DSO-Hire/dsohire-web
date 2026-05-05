/**
 * KpiTile — enhanced metric tile with optional sparkline + trend pill +
 * secondary signal line.
 *
 * Replaces the original simple icon+number+label tiles in dashboards
 * across /employer/dashboard and /candidate/dashboard. Same chrome as
 * before (sharp edges, thin border, cream/white background, heritage
 * eyebrow), just denser content per tile.
 *
 * Typical anatomy:
 *
 *   [Icon]                    [+3 this week]      ← header row
 *   8                                              ← big value
 *   Open Jobs                                      ← label
 *   2 expiring soon                                ← secondary line
 *   ╱╲╲╱─╲                                         ← sparkline (optional)
 *
 * All optional pieces gracefully omit when not provided.
 */

import { Sparkline } from "./sparkline";
import { TrendPill } from "./trend-pill";

interface KpiTileProps {
  /** Lucide icon component. */
  icon: React.ComponentType<{ className?: string }>;
  /** Big value (string so we can pre-format $/% etc.). */
  value: string;
  /** Primary label below the value. */
  label: string;
  /** Optional secondary signal line (e.g. "2 expiring in 7d"). */
  hint?: string;
  /** Optional 7-day sparkline data, oldest first. */
  spark?: number[];
  /** Optional delta vs. last period for the trend pill. */
  delta?: number;
  /** Optional context label for the trend pill (e.g. "this week"). */
  deltaLabel?: string;
  /** Override trend intent. */
  trendIntent?: "positive" | "negative" | "neutral";
  /** Background variant. Default white. */
  tone?: "white" | "cream";
}

export function KpiTile({
  icon: Icon,
  value,
  label,
  hint,
  spark,
  delta,
  deltaLabel,
  trendIntent,
  tone = "white",
}: KpiTileProps) {
  const bg = tone === "cream" ? "bg-cream/40" : "bg-white";
  const showTrend = typeof delta === "number";
  const showSpark = Array.isArray(spark) && spark.length > 0;

  return (
    <div className={`p-6 sm:p-7 ${bg} flex flex-col gap-3 hover:bg-cream/30 transition-colors`}>
      {/* Header row — icon left, optional trend pill right */}
      <div className="flex items-start justify-between gap-3">
        <div className="h-9 w-9 bg-heritage/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-heritage-deep" />
        </div>
        {showTrend && (
          <TrendPill
            delta={delta as number}
            label={deltaLabel}
            intent={trendIntent}
          />
        )}
      </div>

      {/* Value + label */}
      <div>
        <div className="text-[40px] font-extrabold tracking-[-1.4px] leading-none text-ink mb-1.5">
          {value}
        </div>
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
          {label}
        </div>
      </div>

      {/* Optional secondary signal line */}
      {hint && (
        <div className="text-[12px] text-slate-meta tracking-[0.2px] leading-snug">
          {hint}
        </div>
      )}

      {/* Optional sparkline at the bottom of the tile */}
      {showSpark && (
        <div className="mt-auto pt-2">
          <Sparkline data={spark as number[]} width={140} height={28} />
        </div>
      )}
    </div>
  );
}
