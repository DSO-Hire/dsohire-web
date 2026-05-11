/**
 * Cross-location benchmarking table (Phase 5C / E6.13, shipped 2026-05-11).
 *
 * Multi-location-DSO moat — surfaces per-practice-location performance
 * side-by-side on /employer/reports. Renders only when a DSO has 2+
 * locations (single-location DSOs see the surface hidden by the parent
 * page).
 *
 * Columns: location · open roles · apps · hires · avg time-to-fill.
 * Apps and hires get heritage-tinted bar fills sized proportionally to
 * the row's max so the visual ranking jumps out. Time-to-fill stays as
 * a plain number — a heatmap would compete with the bars for attention.
 */

import { MapPin, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { CrossLocationRow } from "@/lib/analytics/metrics";

interface CrossLocationTableProps {
  rows: CrossLocationRow[];
}

export function CrossLocationTable({ rows }: CrossLocationTableProps) {
  if (rows.length < 2) return null;

  const maxApps = Math.max(...rows.map((r) => r.apps_30d), 1);
  const maxHires = Math.max(...rows.map((r) => r.hires_quarter), 1);

  return (
    <section className="border border-[var(--rule)] bg-white">
      <header className="px-6 pt-5 pb-3 border-b border-[var(--rule)] flex items-center justify-between">
        <div>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            By location
          </div>
          <div className="text-[12px] text-slate-meta">
            {rows.length} practice locations · 30-day apps · 90-day hires
          </div>
        </div>
        <Link
          href="/employer/locations"
          className="text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink inline-flex items-center gap-1"
        >
          Manage locations <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10px] font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]">
              <th className="px-6 py-3 font-bold">Location</th>
              <th className="px-3 py-3 font-bold text-right">Open roles</th>
              <th className="px-3 py-3 font-bold text-right">Apps · 30d</th>
              <th className="px-3 py-3 font-bold text-right">Hires · quarter</th>
              <th className="px-6 py-3 font-bold text-right">Time-to-fill</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const cityState =
                [row.city, row.state].filter(Boolean).join(", ") || "—";
              const appsBarPct = (row.apps_30d / maxApps) * 100;
              const hiresBarPct = (row.hires_quarter / maxHires) * 100;
              return (
                <tr
                  key={row.location_id}
                  className={
                    "border-b border-[var(--rule)] last:border-b-0 " +
                    (i % 2 === 0 ? "bg-white" : "bg-cream/20")
                  }
                >
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-2">
                      <MapPin
                        className="h-3.5 w-3.5 text-slate-meta mt-1 shrink-0"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-ink truncate">
                          {row.name}
                        </div>
                        <div className="text-[11px] text-slate-meta truncate">
                          {cityState}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-4 text-right tabular-nums text-ink">
                    {row.open_roles}
                  </td>
                  <td className="px-3 py-4 text-right">
                    <CellWithBar value={row.apps_30d} pct={appsBarPct} />
                  </td>
                  <td className="px-3 py-4 text-right">
                    <CellWithBar value={row.hires_quarter} pct={hiresBarPct} />
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-ink">
                    {row.avg_time_to_fill_days !== null
                      ? `${row.avg_time_to_fill_days.toFixed(0)}d`
                      : <span className="text-slate-meta italic">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CellWithBar({ value, pct }: { value: number; pct: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="hidden md:block w-20 h-1.5 bg-cream relative overflow-hidden rounded-sm">
        <div
          className="h-full bg-heritage"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="tabular-nums text-ink font-semibold min-w-[2ch]">
        {value}
      </span>
    </div>
  );
}
