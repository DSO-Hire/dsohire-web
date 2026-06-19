"use client";

/**
 * PortfolioTable — the multi-location rollup (Phase 2). The DSO-buyer's
 * killer view: every practice side by side, sortable on any column, with a
 * time-to-fill heatmap so the laggards pop out. Clicking a row drills the
 * whole hub into that practice (?loc=<id>).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { CrossLocationRow } from "@/lib/analytics/metrics";

type SortKey =
  | "name"
  | "open_roles"
  | "apps_30d"
  | "hires_quarter"
  | "avg_time_to_fill_days";

function ttfTone(days: number | null): { bg: string; text: string } {
  if (days === null) return { bg: "transparent", text: "var(--slate-meta, #8a8676)" };
  if (days <= 30) return { bg: "rgba(99,153,34,0.14)", text: "#3B6D11" };
  if (days <= 60) return { bg: "rgba(239,159,39,0.16)", text: "#854F0B" };
  return { bg: "rgba(216,90,48,0.16)", text: "#993C1D" };
}

export function PortfolioTable({
  rows,
  window,
}: {
  rows: CrossLocationRow[];
  window: string;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("avg_time_to_fill_days");
  const [asc, setAsc] = useState(false);

  const sorted = [...rows].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (sortKey === "name") {
      av = a.name.toLowerCase();
      bv = b.name.toLowerCase();
    } else {
      // nulls sort last regardless of direction
      av = a[sortKey] ?? Number.POSITIVE_INFINITY;
      bv = b[sortKey] ?? Number.POSITIVE_INFINITY;
    }
    if (av < bv) return asc ? -1 : 1;
    if (av > bv) return asc ? 1 : -1;
    return 0;
  });

  const setSort = (k: SortKey) => {
    if (k === sortKey) setAsc((p) => !p);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };

  const arrow = (k: SortKey) => (sortKey === k ? (asc ? " ▲" : " ▼") : "");

  const cols: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
    { key: "name", label: "Practice", align: "left" },
    { key: "open_roles", label: "Open roles", align: "right" },
    { key: "apps_30d", label: "Apps · 30d", align: "right" },
    { key: "hires_quarter", label: "Hires · qtr", align: "right" },
    { key: "avg_time_to_fill_days", label: "Time-to-fill", align: "right" },
  ];

  return (
    <section className="border border-[var(--rule)] bg-card p-6 overflow-x-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          Practice comparison
        </div>
        <span className="text-[10px] text-slate-meta uppercase tracking-[1px]">
          Click a row to scope the hub to that practice
        </span>
      </div>
      <table className="w-full text-[13px] min-w-[560px]">
        <thead>
          <tr className="text-[10px] font-bold tracking-[1px] uppercase text-slate-meta border-b border-[var(--rule)]">
            {cols.map((c) => (
              <th
                key={c.key}
                className={`py-2 ${c.align === "right" ? "text-right" : "text-left"} cursor-pointer select-none hover:text-ink`}
                onClick={() => setSort(c.key)}
              >
                {c.label}
                {arrow(c.key)}
              </th>
            ))}
            <th className="py-2 w-6" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const tone = ttfTone(r.avg_time_to_fill_days);
            return (
              <tr
                key={r.location_id}
                onClick={() =>
                  router.push(
                    `/employer/analytics?tab=overview&window=${window}&loc=${r.location_id}`
                  )
                }
                className="border-b border-[var(--rule)] last:border-0 cursor-pointer hover:bg-cream/50 group"
              >
                <td className="py-2.5 pr-2">
                  <div className="font-semibold text-ink truncate max-w-[220px]">
                    {r.name}
                  </div>
                  {(r.city || r.state) && (
                    <div className="text-[11px] text-slate-meta">
                      {[r.city, r.state].filter(Boolean).join(", ")}
                    </div>
                  )}
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink">
                  {r.open_roles.toLocaleString()}
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink">
                  {r.apps_30d.toLocaleString()}
                </td>
                <td className="py-2.5 text-right tabular-nums text-ink">
                  {r.hires_quarter.toLocaleString()}
                </td>
                <td className="py-2.5 text-right">
                  <span
                    className="inline-block px-2 py-0.5 text-[12px] font-bold tabular-nums"
                    style={{ background: tone.bg, color: tone.text }}
                  >
                    {r.avg_time_to_fill_days !== null
                      ? `${Math.round(r.avg_time_to_fill_days)}d`
                      : "—"}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <ArrowRight className="h-3.5 w-3.5 text-slate-meta group-hover:text-heritage group-hover:translate-x-0.5 transition-all inline" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
