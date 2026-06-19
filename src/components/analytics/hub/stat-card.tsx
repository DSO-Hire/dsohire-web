/**
 * StatCard — the reusable KPI tile for the analytics hub (Phase 0).
 *
 * Anatomy (per the KPI-card-anatomy research): label · value+unit · delta
 * vs prior period · optional trend microchart · optional benchmark note.
 * Server-component-safe (no hooks). The whole card is clickable when `href`
 * is provided (drill-down to the detail view / underlying records).
 *
 * Delta color tracks MEANING, not direction: pass `goodWhenUp` so an
 * inverse metric (time-to-fill, days-to-response) shows a decrease as good.
 */

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { StatValue } from "@/components/marketing/motion";

export interface StatDelta {
  /** Display string, e.g. "+12%" or "−3d". */
  label: string;
  direction: "up" | "down" | "flat";
  /** When true, "up" is good (green). When false, "down" is good. */
  goodWhenUp?: boolean;
}

export interface StatCardProps {
  label: string;
  /** Pre-formatted value, e.g. "47" or "59" or "—". */
  value: string;
  /** Small unit suffix shown after the value, e.g. "days", "%". */
  unit?: string;
  /** One-line supporting context under the value. */
  hint?: string;
  delta?: StatDelta;
  /** Daily/weekly trend microchart. */
  spark?: number[];
  /** Tiny benchmark line, e.g. "Industry ~60d". */
  benchmark?: string;
  href?: string;
}

function deltaTone(d: StatDelta): "good" | "bad" | "neutral" {
  if (d.direction === "flat") return "neutral";
  const up = d.direction === "up";
  const goodWhenUp = d.goodWhenUp ?? true;
  return up === goodWhenUp ? "good" : "bad";
}

export function StatCard({
  label,
  value,
  unit,
  hint,
  delta,
  spark,
  benchmark,
  href,
}: StatCardProps) {
  const tone = delta ? deltaTone(delta) : "neutral";
  const toneClass =
    tone === "good"
      ? "text-heritage-deep"
      : tone === "bad"
        ? "text-danger"
        : "text-slate-meta";
  const DeltaIcon =
    delta?.direction === "up"
      ? ArrowUpRight
      : delta?.direction === "down"
        ? ArrowDownRight
        : Minus;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          {label}
        </div>
        {delta && (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${toneClass}`}
          >
            <DeltaIcon className="h-3 w-3" aria-hidden />
            {delta.label}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[32px] font-extrabold tracking-[-1px] tabular-nums text-ink leading-none">
          {/* FOH-9 — integer values count up on view; formatted values render as-is. */}
          <StatValue value={value} />
        </span>
        {unit && (
          <span className="text-[13px] font-semibold text-slate-meta">
            {unit}
          </span>
        )}
      </div>

      {hint && (
        <div className="mt-1.5 text-[11px] text-slate-body leading-snug">
          {hint}
        </div>
      )}

      {spark && spark.length > 1 && (
        <div className="mt-3">
          <MiniTrend data={spark} />
        </div>
      )}

      {benchmark && (
        <div className="mt-2 text-[10px] font-semibold tracking-[0.3px] uppercase text-heritage-deep/70">
          {benchmark}
        </div>
      )}
    </>
  );

  const base =
    "block border border-[var(--rule)] bg-card p-5 transition-colors";
  if (href) {
    return (
      <Link href={href} className={`${base} hover:bg-cream/40 group`}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

/* ───── Mini trend microchart ───── */

function MiniTrend({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const width = 240;
  const height = 32;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = innerW / (data.length - 1);
  const pts = data.map((v, i) => ({
    x: pad + i * stepX,
    y: pad + innerH - ((v - min) / range) * innerH,
  }));
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path
        d={line}
        fill="none"
        stroke="var(--color-heritage, #4D7A60)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r={2.5} fill="var(--color-heritage, #4D7A60)" />
    </svg>
  );
}
