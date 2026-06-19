/**
 * Pipeline funnel viz (Phase 5C / E6.4, shipped 2026-05-11).
 *
 * Reusable across the per-job page + the DSO-wide reports dashboard.
 * Renders the 5-stage candidate funnel (Applied → Screening → Interview
 * → Offered → Hired) as horizontal bars sized proportionally to the
 * `Applied` row. Each row shows the count and the conversion percentage
 * from the previous stage.
 *
 * Inline SVG/CSS only — no chart library. Brand palette: heritage for
 * the bar fill, navy for emphasis text, ivory backdrop.
 */

import type { FunnelStageRow } from "@/lib/analytics/metrics";

interface FunnelChartProps {
  rows: FunnelStageRow[];
  /** Optional: count of dropped/rejected applicants for context. */
  rejected?: number;
  withdrawn?: number;
  /** Optional headline; defaults to "Pipeline funnel". */
  title?: string;
}

export function FunnelChart({
  rows,
  rejected,
  withdrawn,
  title = "Pipeline funnel",
}: FunnelChartProps) {
  const max = rows[0]?.count ?? 0;

  if (max === 0) {
    return (
      <section className="border border-[var(--rule)] bg-card p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
          {title}
        </div>
        <p className="text-[13px] text-slate-meta italic">
          No applications yet — funnel populates as candidates apply.
        </p>
      </section>
    );
  }

  return (
    <section className="border border-[var(--rule)] bg-card p-6">
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        {title}
      </div>

      <ul className="space-y-3">
        {rows.map((row, i) => {
          const widthPct = (row.count / max) * 100;
          const conversionPct = (row.conversion_from_prev * 100).toFixed(0);
          return (
            <li key={row.stage} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="font-bold text-ink">{row.label}</span>
                <span className="tabular-nums text-slate-body">
                  <strong className="text-ink">{row.count}</strong>
                  {i > 0 && (
                    <span className="ml-2 text-slate-meta">
                      ({conversionPct}% of {rows[i - 1].label.toLowerCase()})
                    </span>
                  )}
                </span>
              </div>
              <div className="h-3 bg-cream relative overflow-hidden">
                <div
                  className="h-full bg-heritage transition-all"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {(rejected !== undefined || withdrawn !== undefined) && (
        <div className="mt-5 pt-4 border-t border-[var(--rule)] flex items-center gap-4 text-[12px] text-slate-meta">
          {rejected !== undefined && (
            <span>
              Rejected: <strong className="text-ink tabular-nums">{rejected}</strong>
            </span>
          )}
          {withdrawn !== undefined && (
            <span>
              Withdrawn:{" "}
              <strong className="text-ink tabular-nums">{withdrawn}</strong>
            </span>
          )}
        </div>
      )}
    </section>
  );
}
