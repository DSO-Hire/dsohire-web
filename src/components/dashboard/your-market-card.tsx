/**
 * YourMarketCard — Day 35 (Direction A rail). Shows the candidate's local
 * pay band for their role, anchored on BLS OEWS (gov data), with an
 * honest sourcing + vintage line and the geographic level actually used.
 *
 * Renders nothing when no range is available (handled by the caller via a
 * null MarketRange) — better silence than a bad number.
 */

import Link from "next/link";
import { TrendingUp, ArrowRight } from "lucide-react";
import type { MarketRange } from "@/lib/comp/market";

function money(n: number, unit: "hourly" | "annual"): string {
  if (unit === "hourly") return `$${Math.round(n)}`;
  // annual → compact $XXk
  return `$${Math.round(n / 1000)}K`;
}

const AREA_SUFFIX: Record<MarketRange["areaLevel"], string> = {
  metro: "",
  state: "",
  national: " (national)",
};

export function YourMarketCard({
  range,
  browseHref = "/candidate/jobs",
}: {
  range: MarketRange;
  browseHref?: string;
}) {
  const unitLabel = range.unit === "hourly" ? "/hr" : "/yr";
  const band = `${money(range.p25, range.unit)}–${money(range.p75, range.unit)}`;

  return (
    <section className="border border-[var(--rule)] bg-card p-5">
      <h3 className="mb-1 flex items-center gap-2 text-[10px] font-extrabold tracking-[2px] uppercase text-heritage-deep">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        Your market
      </h3>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[22px] font-extrabold tracking-[-0.5px] text-ink leading-none">
          {band}
          <span className="text-[13px] font-bold text-slate-meta">
            {unitLabel}
          </span>
        </span>
      </div>
      <p className="mt-1 text-[12px] text-slate-meta">
        Typical 25th–75th percentile{AREA_SUFFIX[range.areaLevel]} · median{" "}
        <span className="font-bold text-ink">
          {money(range.p50, range.unit)}
          {unitLabel}
        </span>
      </p>

      {/* simple band visual */}
      <div className="relative mt-3 h-2 rounded-full bg-ivory-deep">
        <div className="absolute inset-y-0 left-[12%] right-[18%] rounded-full bg-gradient-to-r from-heritage to-[#c19a3e]" />
        <div className="absolute -top-1 left-[50%] h-4 w-[3px] -translate-x-1/2 rounded bg-ink" />
      </div>

      <Link
        href={browseHref}
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold text-heritage-deep hover:text-heritage transition-colors"
      >
        See roles in your range
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-meta">
        Source: {range.source}
        {range.vintage ? `, ${range.vintage}` : ""} · {range.areaName}. Base pay
        for W-2 roles; excludes bonuses &amp; production.
      </p>
    </section>
  );
}
