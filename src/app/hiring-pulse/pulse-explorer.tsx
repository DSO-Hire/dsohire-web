"use client";

/**
 * <PulseExplorer> — the posted-pay explorer (#115 Model 07, Day 32).
 * Client-side role switcher over server-computed stats; the band/median
 * markers reposition with a settle transition. All numbers arrive from
 * lib/marketing/market-pulse.ts (n ≥ 20 floor already applied — anything
 * rendered here earned its place).
 */

import { useState } from "react";
import type { PulseRoleStat } from "@/lib/marketing/market-pulse";

function fmt(v: number, unit: string): string {
  if (unit === "/yr") return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v)}`;
}

export function PulseExplorer({ roles }: { roles: PulseRoleStat[] }) {
  const [active, setActive] = useState(0);
  if (roles.length === 0) {
    return (
      <div className="bg-card border border-[var(--rule-strong)] px-8 py-12 text-center">
        <div className="text-[15px] font-extrabold text-ink mb-2">
          Not enough data yet — and we won&rsquo;t guess.
        </div>
        <p className="text-[13px] text-slate-body leading-[1.7] max-w-[440px] mx-auto">
          Pay statistics publish once a role has at least 20 live postings
          with visible pay. As the marketplace grows, this explorer fills in.
        </p>
      </div>
    );
  }

  const r = roles[Math.min(active, roles.length - 1)];
  const span = r.hi - r.lo || 1;
  const pct = (v: number) => `${(((v - r.lo) / span) * 100).toFixed(1)}%`;
  const widthPct = `${(((r.p75 - r.p25) / span) * 100).toFixed(1)}%`;

  return (
    <div>
      <div className="flex flex-wrap gap-2.5 mb-7">
        {roles.map((role, i) => (
          <button
            key={role.key}
            type="button"
            onClick={() => setActive(i)}
            className={`px-4 py-2 text-[12.5px] font-bold border transition-colors ${
              i === active
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-slate-body border-[var(--rule-strong)] hover:border-ink hover:text-ink"
            }`}
          >
            {role.label}
          </button>
        ))}
      </div>

      <div className="bg-card border border-[var(--rule-strong)] px-7 py-8 sm:px-9">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-7">
          <span className="text-[17px] font-extrabold tracking-[-0.3px] text-ink">
            {r.label}
          </span>
          <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-meta">
            n = {r.n} live postings with visible pay
          </span>
        </div>

        {/* distribution band */}
        <div className="relative h-[78px] mx-1">
          <div className="absolute top-[38px] inset-x-0 h-[10px] bg-ivory-deep" />
          <div
            className="absolute top-[38px] h-[10px] transition-all duration-700"
            style={{
              left: pct(r.p25),
              width: widthPct,
              background:
                "linear-gradient(90deg, var(--color-heritage-light), var(--color-heritage))",
            }}
          />
          <div
            className="absolute top-[28px] w-[3px] h-[30px] bg-ink transition-all duration-700"
            style={{ left: pct(r.median) }}
          >
            <span className="absolute -top-[24px] left-1/2 -translate-x-1/2 whitespace-nowrap text-[15px] font-extrabold tabular-nums text-ink">
              {fmt(r.median, r.unit)}
              {r.unit} median
            </span>
          </div>
          <span
            className="absolute top-[56px] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-slate-meta transition-all duration-700"
            style={{ left: pct(r.p25) }}
          >
            p25 · {fmt(r.p25, r.unit)}
          </span>
          <span
            className="absolute top-[56px] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-slate-meta transition-all duration-700"
            style={{ left: pct(r.p75) }}
          >
            p75 · {fmt(r.p75, r.unit)}
          </span>
        </div>

        <div className="flex flex-wrap justify-between gap-2 border-t border-dashed border-[var(--rule-strong)] pt-4 mt-5 text-[11px] text-slate-meta leading-[1.6]">
          <span>Band = 25th–75th percentile of posted-range midpoints</span>
          <span>
            Posted ranges, not settled salaries — and nothing publishes under
            n&nbsp;≥&nbsp;20
          </span>
        </div>
      </div>
    </div>
  );
}
