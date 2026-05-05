/**
 * KpiTile — enhanced metric tile with optional sparkline + trend pill +
 * secondary signal line + (NEW) clickable navigation.
 *
 * v3 redesign brings two upgrades to this primitive:
 *
 *   1. Tonal variant — a cream-fill background with a heritage left rule
 *      so the tile bank reads as a system instead of four white boxes.
 *
 *   2. Clickable navigation — when `href` is passed, the tile becomes a
 *      Link with a chevron in the top-right, a hover lift, and a route
 *      label at the bottom telling the operator exactly where the click
 *      will land. Every click on a KpiTile should *go somewhere useful* —
 *      the dashboard is a launchpad, not a museum.
 *
 * Visual structure (clickable variant):
 *
 *   ┌─────────────────────────── ▸ ┐  ← chevron (top-right)
 *   │ ▣ Open Jobs                  │  ← icon-cluster eyebrow
 *   │                              │
 *   │ 9                            │  ← big value
 *   │                              │
 *   │ Across 4 locations.          │  ← optional hint
 *   │                              │
 *   │ ╱╲╲╱─╲                       │  ← optional sparkline
 *   │ ↗ +2 · vs last week          │  ← optional trend pill
 *   │ ─────────────────────────    │
 *   │ Manage jobs ▸                │  ← route label (only when href)
 *   └──────────────────────────────┘
 */

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Sparkline } from "./sparkline";
import { TrendPill } from "./trend-pill";

interface KpiTileProps {
  /** Lucide icon component. */
  icon: React.ComponentType<{ className?: string }>;
  /** Big value (string so we can pre-format $/% etc.). */
  value: string;
  /** Primary label below the icon (eyebrow style). */
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
  /** Background variant. Default tonal (cream + heritage left rule). */
  tone?: "white" | "tonal";
  /** When set, renders the tile as a Link with chevron + route label. */
  href?: string;
  /** Bottom CTA label, e.g. "Manage jobs". Only shown when href is set. */
  routeLabel?: string;
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
  tone = "tonal",
  href,
  routeLabel,
}: KpiTileProps) {
  const showTrend = typeof delta === "number";
  const showSpark = Array.isArray(spark) && spark.length > 0;
  const isClickable = Boolean(href);

  // Tonal cream + heritage left rule is the default v3 look. The "white"
  // variant is kept as an escape hatch for the rare surface that wants
  // a flat treatment.
  const baseBg =
    tone === "tonal" ? "bg-cream border-l-4 border-heritage" : "bg-white";
  const hoverBg =
    tone === "tonal" ? "hover:bg-ivory-deep" : "hover:bg-cream/40";

  const body = (
    <>
      {/* Chevron (top-right) — only on clickable tiles. The tile body itself
          handles the click; the chevron is just visual affordance. */}
      {isClickable && (
        <ChevronRight className="absolute top-4 right-4 h-4 w-4 text-slate-meta group-hover:text-heritage group-hover:translate-x-1 transition-all" />
      )}

      {/* Icon + label cluster */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="h-7 w-7 bg-heritage/10 flex items-center justify-center flex-shrink-0">
          <Icon className="h-3.5 w-3.5 text-heritage-deep" />
        </div>
        <div className="text-[10px] font-extrabold tracking-[2.2px] uppercase text-heritage-deep">
          {label}
        </div>
      </div>

      {/* Big value */}
      <div className="text-[56px] font-black tracking-[-2.5px] leading-[0.95] text-ink mb-2">
        {value}
      </div>

      {/* Optional secondary signal line */}
      {hint && (
        <div className="text-[12px] text-slate-body tracking-[0.2px] leading-snug">
          {hint}
        </div>
      )}

      {/* Optional sparkline + trend pill row */}
      {(showSpark || showTrend) && (
        <div className="flex items-center gap-3 flex-wrap mt-3">
          {showSpark && (
            <Sparkline data={spark as number[]} width={100} height={28} />
          )}
          {showTrend && (
            <TrendPill
              delta={delta as number}
              label={deltaLabel}
              intent={trendIntent}
            />
          )}
        </div>
      )}

      {/* Route label — only on clickable tiles. Pushes to the bottom. */}
      {isClickable && routeLabel && (
        <div className="mt-auto pt-3.5 flex items-center gap-1.5 text-[9px] font-bold tracking-[1.6px] uppercase text-slate-meta group-hover:text-heritage-deep transition-colors border-t border-black/5">
          {routeLabel}
          <ChevronRight className="h-2.5 w-2.5" strokeWidth={3} />
        </div>
      )}
    </>
  );

  const className = `group relative p-6 sm:p-7 ${baseBg} ${hoverBg} flex flex-col transition-colors ${
    isClickable ? "cursor-pointer" : ""
  }`;

  if (isClickable) {
    return (
      <Link href={href as string} className={className}>
        {body}
      </Link>
    );
  }

  return <div className={className}>{body}</div>;
}
