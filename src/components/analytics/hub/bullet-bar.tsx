/**
 * BulletBar — "your value vs. market" comparison bar (Phase 3).
 *
 * Stephen-Few-style bullet: the filled bar is YOUR figure, the vertical
 * marker is the MARKET median (the qualitative benchmark). Server-safe.
 * Every figure is labeled with the market value, its scope (state/national),
 * and the data vintage so it self-explains and never reads as a naked bar.
 */

export function BulletBar({
  label,
  yourValue,
  marketValue,
  unit = "/hr",
  caption,
}: {
  label: string;
  yourValue: number | null;
  marketValue: number | null;
  unit?: string;
  caption: string;
}) {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
  const scaleMax = Math.max(yourValue ?? 0, marketValue ?? 0) * 1.25 || 1;
  const yourPct = yourValue != null ? Math.min(100, (yourValue / scaleMax) * 100) : 0;
  const marketPct =
    marketValue != null ? Math.min(100, (marketValue / scaleMax) * 100) : null;

  // Color the bar by how your pay sits vs market: at/above = heritage (good
  // for attracting talent), meaningfully below = amber flag.
  const belowMarket =
    yourValue != null && marketValue != null && yourValue < marketValue * 0.95;
  const barColor = belowMarket ? "#EF9F27" : "var(--color-heritage, #4D7A60)";

  return (
    <div className="py-3 border-b border-[var(--rule)] last:border-0">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[13px] font-bold text-ink">{label}</span>
        <span className="text-[12px] tabular-nums">
          {yourValue != null ? (
            <span className="font-bold text-ink">
              {fmt(yourValue)}
              {unit}
            </span>
          ) : (
            <span className="text-slate-meta">no postings</span>
          )}
          {marketValue != null && (
            <span className="text-slate-meta">
              {" "}
              vs {fmt(marketValue)}
              {unit} market
            </span>
          )}
        </span>
      </div>
      <div className="relative h-6 bg-cream border border-[var(--rule)]">
        {yourValue != null && (
          <div
            className="absolute left-0 top-0 bottom-0"
            style={{ width: `${yourPct}%`, background: barColor }}
          />
        )}
        {marketPct != null && (
          <div
            className="absolute top-[-3px] bottom-[-3px] w-[2px] bg-ink"
            style={{ left: `${marketPct}%` }}
            title="Market median"
          />
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-meta leading-snug">{caption}</p>
    </div>
  );
}
