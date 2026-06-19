"use client";

/**
 * TrendChart — labeled, interactive multi-series daily line chart for the
 * analytics hub. Hovering a day shows a tooltip explaining exactly what that
 * point is (date + each series' value); clicking drills into the applications
 * screen. Self-explaining per the sparkline research — no naked lines.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface TrendSeries {
  label: string;
  color: string;
  data: number[];
}

export function TrendChart({
  title,
  series,
  clickHref = "/employer/applications",
}: {
  title: string;
  series: TrendSeries[];
  clickHref?: string;
}) {
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);

  const width = 720;
  const height = 180;
  const padX = 6;
  const padY = 14;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const len = Math.max(1, ...series.map((s) => s.data.length));
  const maxVal = Math.max(1, ...series.flatMap((s) => s.data));
  const totalAll = series.reduce(
    (sum, s) => sum + s.data.reduce((a, b) => a + b, 0),
    0
  );

  const pointsFor = (data: number[]) => {
    const n = Math.max(1, data.length - 1);
    return data.map((v, i) => ({
      x: padX + (i / n) * innerW,
      y: padY + innerH - (v / maxVal) * innerH,
    }));
  };
  const pathFor = (data: number[]) =>
    pointsFor(data)
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");

  const today = new Date();
  const dateFor = (i: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (len - 1 - i));
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <section className="border border-[var(--rule)] bg-card p-6">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          {title}
        </div>
        <div className="flex items-center gap-4">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2" style={{ background: s.color }} />
              <span className="text-[11px] font-semibold text-slate-body">
                {s.label}
              </span>
              <span className="text-[11px] font-bold tabular-nums text-ink">
                {s.data.reduce((a, b) => a + b, 0).toLocaleString("en-US")}
              </span>
            </span>
          ))}
        </div>
      </div>

      {totalAll === 0 ? (
        <p className="text-[13px] text-slate-meta italic py-6 text-center">
          No activity in this window yet. Trends populate as candidates apply
          and you make hires.
        </p>
      ) : (
        <div
          className="relative cursor-pointer"
          style={{ height }}
          onMouseLeave={() => setHover(null)}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            preserveAspectRatio="none"
            className="absolute inset-0"
            aria-label={title}
            role="img"
          >
            <line
              x1={padX}
              y1={padY + innerH}
              x2={width - padX}
              y2={padY + innerH}
              stroke="var(--rule, #e5e1d8)"
              strokeWidth={1}
            />
            {series.map((s) => {
              const pts = pointsFor(s.data);
              const last = pts[pts.length - 1];
              const hp = hover != null ? pts[hover] : null;
              return (
                <g key={s.label}>
                  <path
                    d={pathFor(s.data)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={1.8}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {last && <circle cx={last.x} cy={last.y} r={3} fill={s.color} />}
                  {hp && (
                    <circle
                      cx={hp.x}
                      cy={hp.y}
                      r={4}
                      fill="#fff"
                      stroke={s.color}
                      strokeWidth={2}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Invisible hover/click columns (one per day) */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: len }).map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${dateFor(i)} details`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onClick={() => router.push(clickHref)}
                className={
                  "flex-1 h-full focus:outline-none " +
                  (hover === i ? "bg-cream/60" : "")
                }
              />
            ))}
          </div>

          {/* Tooltip */}
          {hover != null && (
            <div
              className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 whitespace-nowrap border border-[var(--rule-strong)] bg-hero text-hero-foreground px-3 py-2 text-[11px] shadow-sm"
              style={{ left: `${((hover + 0.5) / len) * 100}%` }}
            >
              <div className="font-bold tracking-[0.5px] mb-0.5">
                {dateFor(hover)}
              </div>
              {series.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5" style={{ background: s.color }} />
                  {s.label}:{" "}
                  <span className="font-bold tabular-nums">
                    {s.data[hover] ?? 0}
                  </span>
                </div>
              ))}
              <div className="mt-1 text-[9px] text-hero-foreground/60 uppercase tracking-[1px]">
                Click to open applications
              </div>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex justify-between text-[10px] text-slate-meta">
        <span>{len} days ago</span>
        <span>today</span>
      </div>
    </section>
  );
}
