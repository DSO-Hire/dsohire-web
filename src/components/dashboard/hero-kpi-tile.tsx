/**
 * HeroKpiTile — the navy-fill flagship tile that anchors the dashboard
 * KPI grid. Reserves the leftmost column of the grid and visually
 * dominates so the operator's eye lands on the action item first.
 *
 * Anatomy:
 *
 *   ╭───────────────────────────────╮
 *   │ ●  AWAITING REVIEW         ▸  │  ← eyebrow + chevron
 *   │ ┃ Live                        │  ← live tag (heritage-soft)
 *   │ ┃                             │
 *   │ ┃ 12  +3 since 9 AM           │  ← giant value + delta-since pill
 *   │ ┃                             │
 *   │ ┃ Three are at locations      │  ← multi-line hint
 *   │ ┃ where you've shortlisted    │
 *   │ ┃                             │
 *   │ ┃ ╱╲╲╱─╲╲╱─╲                  │  ← hero sparkline
 *   │ ┃                             │
 *   │ ┃ ▮▮▮▮ ▮▮ ▮▮ ▮                │  ← stage distribution strip
 *   │ ┃ NEW  REV INT OFF            │
 *   │ ┃ 8    4   3   1              │
 *   │ ┃ ────────────────────────    │
 *   │ ┃ Open inbox →                │  ← cta link
 *   ╰───────────────────────────────╯
 *
 * The heritage gradient rule down the left edge ties the navy tile to
 * the rest of the brand vocabulary; the radial gradient on the navy
 * background gives the tile real depth instead of a flat block.
 *
 * Subcomponents are kept inline (StageStrip, LiveTag) because they're
 * not used outside this tile.
 */

import Link from "next/link";
import { ChevronRight, ArrowRight } from "lucide-react";

interface StageBucket {
  key: string;
  label: string;
  count: number;
}

interface HeroKpiTileProps {
  /** Eyebrow label, e.g. "Awaiting Review". */
  label: string;
  /** Big value (string so we can format "12" or "—" or "1.4d"). */
  value: string;
  /** Optional inline pill rendered next to the value (e.g. "+3 since 9 AM"). */
  deltaSince?: string;
  /** Multi-line hint text below the value. */
  hint?: string;
  /** When true, renders the small "Live" pulse tag above the value. */
  live?: boolean;
  /** Optional sparkline data. Renders if present. */
  spark?: number[];
  /** Optional stage distribution strip. */
  stageStrip?: StageBucket[];
  /** Stage strip max — used to scale bar widths. Defaults to max count. */
  stageStripMax?: number;
  /** CTA link config — destination + label. Required (the tile is always clickable). */
  href: string;
  ctaLabel: string;
}

export function HeroKpiTile({
  label,
  value,
  deltaSince,
  hint,
  live = false,
  spark,
  stageStrip,
  stageStripMax,
  href,
  ctaLabel,
}: HeroKpiTileProps) {
  const showSpark = Array.isArray(spark) && spark.length > 1;

  return (
    <Link
      href={href}
      className="group relative overflow-hidden flex flex-col text-ivory bg-ink p-7 sm:p-8 hover:bg-ink-soft transition-colors"
      style={{
        backgroundImage:
          "radial-gradient(circle at 100% 0%, rgba(77,122,96,0.22), transparent 60%), radial-gradient(circle at 0% 100%, rgba(77,122,96,0.10), transparent 50%)",
      }}
    >
      {/* Heritage gradient left rule — visual anchor to the rest of the
          brand vocabulary on the otherwise-navy tile. */}
      <span
        className="absolute top-0 left-0 bottom-0 w-1"
        style={{
          background:
            "linear-gradient(to bottom, var(--heritage), rgba(141,184,163,1))",
        }}
        aria-hidden
      />

      {/* Chevron (top-right) — visual click affordance. */}
      <ChevronRight className="absolute top-5 right-5 h-4 w-4 text-ivory/50 group-hover:text-[var(--heritage-bright,#8db8a3)] group-hover:translate-x-1 transition-all" />

      {/* Eyebrow */}
      <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-[var(--heritage-bright,#8db8a3)] mb-1">
        {label}
      </div>

      {/* Live tag */}
      {live && (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 mb-5 self-start text-[9px] font-bold tracking-[1.5px] uppercase text-[var(--heritage-bright,#8db8a3)]"
          style={{ background: "rgba(141,184,163,0.18)" }}
        >
          <span
            className="block w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: "rgba(141,184,163,1)" }}
          />
          Live
        </div>
      )}

      {/* Giant value + optional delta-since pill */}
      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div className="text-[88px] sm:text-[96px] font-black tracking-[-4.5px] leading-[0.92] text-ivory">
          {value}
        </div>
        {deltaSince && (
          <span
            className="px-2 py-1 text-[12px] font-bold tracking-[0.4px] text-[var(--heritage-bright,#8db8a3)]"
            style={{ background: "rgba(141,184,163,0.16)" }}
          >
            {deltaSince}
          </span>
        )}
      </div>

      {/* Hint */}
      {hint && (
        <div className="text-[13px] leading-[1.55] max-w-[360px] text-ivory/70">
          {hint}
        </div>
      )}

      {/* Sparkline */}
      {showSpark && (
        <div className="my-5">
          <HeroSparkline data={spark as number[]} />
        </div>
      )}

      {/* Stage strip */}
      {stageStrip && stageStrip.length > 0 && (
        <StageStrip stages={stageStrip} explicitMax={stageStripMax} />
      )}

      {/* CTA */}
      <div className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[2px] uppercase text-[var(--heritage-bright,#8db8a3)] border-t border-ivory/10">
        <span className="pt-5">
          {ctaLabel}
        </span>
        <ArrowRight className="h-3.5 w-3.5 mt-5 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}

/* ───── Hero sparkline (bigger sibling of the standard Sparkline) ───── */

function HeroSparkline({ data }: { data: number[] }) {
  // Inline SVG sparkline tuned for the hero tile's ~64px height. Uses the
  // heritage-bright palette over a translucent fill area.
  if (data.length < 2) return null;
  const width = 400;
  const height = 64;
  const padding = 4;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = innerW / (data.length - 1);
  const points = data.map((v, i) => ({
    x: padding + i * stepX,
    y: padding + innerH - ((v - min) / range) * innerH,
  }));
  const linePath = points
    .map(
      (p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(
    2,
  )} ${(height - padding).toFixed(2)} L ${points[0].x.toFixed(2)} ${(
    height - padding
  ).toFixed(2)} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="heroSparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#8db8a3" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#8db8a3" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#heroSparkFill)" />
      <path
        d={linePath}
        fill="none"
        stroke="#8db8a3"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={3.5} fill="#8db8a3" />
    </svg>
  );
}

/* ───── Stage distribution strip ───── */

function StageStrip({
  stages,
  explicitMax,
}: {
  stages: StageBucket[];
  explicitMax?: number;
}) {
  const maxCount = explicitMax ?? Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="flex items-stretch gap-2 mt-4 flex-wrap">
      {stages.map((s) => {
        const pct = maxCount > 0 ? (s.count / maxCount) * 100 : 0;
        return (
          <div key={s.key} className="flex-1 min-w-[60px]">
            <div
              className="h-1.5 mb-1.5 relative"
              style={{ background: "rgba(247,244,237,0.14)" }}
            >
              <span
                className="absolute top-0 left-0 bottom-0"
                style={{
                  width: `${pct}%`,
                  background: "rgba(141,184,163,1)",
                }}
              />
            </div>
            <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-ivory/55">
              {s.label}
            </div>
            <div className="text-[14px] font-extrabold text-ivory mt-0.5">
              {s.count}
            </div>
          </div>
        );
      })}
    </div>
  );
}
