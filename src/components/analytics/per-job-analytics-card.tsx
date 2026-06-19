/**
 * Per-job analytics card (Phase 5C / E6.1, shipped 2026-05-11).
 *
 * Renders at the top of /employer/jobs/[id], above the kanban pipeline.
 * Four headline tiles (views / 7-day views / applications / conversion)
 * + an inline-SVG sparkline of daily application counts over the last
 * 30 days. Top sources list collapses when empty.
 *
 * Server component — reads metrics directly via getPerJobAnalytics.
 * No client interactivity (sparkline is static SVG); no chart library.
 */

import { Eye, Briefcase, TrendingUp, Globe } from "lucide-react";
import type { PerJobAnalytics } from "@/lib/analytics/metrics";
import { AppsSparkline } from "./apps-sparkline";

interface PerJobAnalyticsCardProps {
  metrics: PerJobAnalytics;
}

export function PerJobAnalyticsCard({ metrics }: PerJobAnalyticsCardProps) {
  const conversionPct = (metrics.conversion_rate * 100).toFixed(1);

  return (
    <section className="mb-10 border border-[var(--rule)] bg-card">
      <header className="px-6 pt-5 pb-3 border-b border-[var(--rule)]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Performance · Last 30 days
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4">
        <Tile
          icon={Eye}
          label="Total views"
          value={metrics.views_total.toLocaleString()}
          secondary={`+${metrics.views_7d.toLocaleString()} in 7d`}
        />
        <Tile
          icon={Eye}
          label="Views · 30d"
          value={metrics.views_30d.toLocaleString()}
        />
        <Tile
          icon={Briefcase}
          label="Applications"
          value={metrics.applications_total.toLocaleString()}
          secondary={`+${metrics.applications_7d.toLocaleString()} in 7d`}
        />
        <Tile
          icon={TrendingUp}
          label="Conversion"
          value={`${conversionPct}%`}
          secondary={metrics.views_total > 0 ? "apps ÷ views" : "no views yet"}
        />
      </div>

      <div className="px-6 py-5 border-t border-[var(--rule)] grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6">
        <div>
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
            Applications · last 30 days
          </div>
          <AppsSparkline data={metrics.apps_per_day} />
        </div>
        <div>
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
            Top sources
          </div>
          {metrics.top_sources.length === 0 ? (
            <div className="flex items-start gap-2 text-[12px] text-slate-meta leading-relaxed">
              <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
              <span>
                Source attribution starts populating when candidates apply
                via tagged links (e.g.{" "}
                <code className="text-[11px] bg-cream px-1 py-0.5">
                  ?source=indeed
                </code>
                ).
              </span>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {metrics.top_sources.map((s) => (
                <li
                  key={s.source}
                  className="flex items-center justify-between text-[13px] text-ink"
                >
                  <span className="truncate">{s.source}</span>
                  <span className="font-semibold tabular-nums text-slate-body">
                    {s.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  secondary,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="px-6 py-5 border-r border-[var(--rule)] last:border-r-0 [&:nth-child(2n)]:md:border-r [&:nth-child(2n)]:border-r-0 md:[&:nth-child(2n)]:border-r">
      <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-[2px] uppercase text-slate-meta mb-2">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </div>
      <div className="text-2xl font-extrabold tracking-[-0.5px] text-ink leading-none mb-1">
        {value}
      </div>
      {secondary && (
        <div className="text-[11px] text-slate-body">{secondary}</div>
      )}
    </div>
  );
}

// Sparkline rendering moved to AppsSparkline (client component) above.
