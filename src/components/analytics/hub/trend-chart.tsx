/**
 * TrendChart — labeled multi-series line chart for the analytics hub.
 *
 * Server-component-safe (pure SVG, no hooks). Plots one or more daily series
 * over the window with a legend + per-series total, a soft baseline grid, and
 * end-point dots. Self-explaining per the sparkline research: every series is
 * named with its total, and the title states the window — no naked lines.
 */

export interface TrendSeries {
  label: string;
  /** CSS color (hex or var()). */
  color: string;
  /** Daily values, oldest → newest. */
  data: number[];
}

export function TrendChart({
  title,
  series,
}: {
  title: string;
  series: TrendSeries[];
}) {
  const width = 720;
  const height = 180;
  const padX = 6;
  const padY = 14;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const maxLen = Math.max(1, ...series.map((s) => s.data.length));
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

  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          {title}
        </div>
        <div className="flex items-center gap-4">
          {series.map((s) => {
            const total = s.data.reduce((a, b) => a + b, 0);
            return (
              <span key={s.label} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2"
                  style={{ background: s.color }}
                />
                <span className="text-[11px] font-semibold text-slate-body">
                  {s.label}
                </span>
                <span className="text-[11px] font-bold tabular-nums text-ink">
                  {total.toLocaleString("en-US")}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {totalAll === 0 ? (
        <p className="text-[13px] text-slate-meta italic py-6 text-center">
          No activity in this window yet. Trends populate as candidates apply
          and you make hires.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          role="img"
          aria-label={title}
        >
          {/* baseline */}
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
                {last && (
                  <circle cx={last.x} cy={last.y} r={3} fill={s.color} />
                )}
              </g>
            );
          })}
        </svg>
      )}
      <div className="mt-2 flex justify-between text-[10px] text-slate-meta">
        <span>{maxLen} days ago</span>
        <span>today</span>
      </div>
    </section>
  );
}
