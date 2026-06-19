"use client";

/**
 * PayBenchmarkHint — read-only market pay guidance under the comp inputs
 * (gap N4). Given the job's role + primary state, fetches the BLS OEWS
 * median/mean from wage_benchmarks and shows it, plus a gentle nudge when
 * the entered range sits below market. Guidance only — never blocks.
 *
 * Self-contained + reactive: re-fetches when role/state change, recomputes
 * the comparison as the employer edits comp. Renders nothing for
 * non-benchmarkable roles (only the 3 OEWS series exist).
 */

import { useEffect, useState } from "react";
import { getMarketBenchmark, type MarketBenchmark } from "./benchmark-action";
import { normalizeToHourly } from "@/lib/analytics/benchmarks";

function num(s: string): number | null {
  const t = s.replace(/[^\d.]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Prettify the stored source slug for display (e.g. "bls_oews" → "BLS OEWS"). */
function formatSource(raw: string): string {
  if (raw.toLowerCase() === "bls_oews") return "BLS OEWS";
  return raw.replace(/_/g, " ").toUpperCase();
}

export function PayBenchmarkHint({
  roleCategory,
  state,
  locationId,
  specialty,
  compMin,
  compMax,
  compPeriod,
  accentText,
}: {
  roleCategory: string | null | undefined;
  state: string | null | undefined;
  /** Selected location id → resolves to a metro band server-side (sharpest). */
  locationId?: string | null;
  /** Dental specialty (ortho/oral-surgery/etc.) → picks the specialist SOC. */
  specialty?: string[] | null;
  compMin: string;
  compMax: string;
  compPeriod: string;
  /** Tailwind text-color class for the accent (matches the wizard). */
  accentText: string;
}) {
  const specialtyKey = (specialty ?? []).join("|");
  const [bench, setBench] = useState<MarketBenchmark | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!roleCategory) {
      setBench(null);
      return;
    }
    setLoading(true);
    getMarketBenchmark(
      roleCategory,
      state ?? null,
      locationId ?? null,
      specialtyKey ? specialtyKey.split("|") : null,
    )
      .then((b) => {
        if (!cancelled) setBench(b);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roleCategory, state, locationId, specialtyKey]);

  if (!roleCategory || loading || !bench) return null;
  const marketHourly =
    bench.median_hourly ??
    (bench.median_annual != null ? bench.median_annual / 2080 : null);
  if (marketHourly == null) return null;

  const yourHourly = normalizeToHourly(num(compMin), num(compMax), compPeriod || null);
  const below = yourHourly != null && yourHourly < marketHourly * 0.9;
  const above = yourHourly != null && yourHourly > marketHourly * 1.1;

  const scopeLabel =
    bench.scope === "metro"
      ? bench.area_name
      : bench.scope === "state" && bench.state
        ? bench.state
        : "National";

  return (
    <div className="mt-4 border border-[var(--rule)] bg-card p-3.5" aria-live="polite">
      <div className={`text-[10px] font-bold tracking-[1.5px] uppercase ${accentText}`}>
        Market pay · {bench.label} · {scopeLabel}
      </div>
      <div className="mt-1 text-[14px] text-ink">
        Median{" "}
        <span className="font-bold">${money(marketHourly)}/hr</span>
        {bench.median_annual != null && (
          <span className="text-slate-meta">
            {" "}
            (~${money(bench.median_annual)}/yr)
          </span>
        )}
        {bench.mean_hourly != null && (
          <span className="text-slate-meta">
            {" "}
            · avg ${money(bench.mean_hourly)}/hr
          </span>
        )}
      </div>
      {bench.p25_hourly != null && bench.p75_hourly != null && (
        <div className="mt-0.5 text-[12px] text-slate-meta">
          Typical range{" "}
          <span className="font-semibold text-ink">
            ${money(bench.p25_hourly)}–${money(bench.p75_hourly)}/hr
          </span>{" "}
          (25th–75th percentile)
        </div>
      )}
      {yourHourly != null && (
        <p
          className={
            "mt-1 text-[12px] leading-snug " +
            (below ? "text-warning" : above ? "text-heritage-deep" : "text-slate-body")
          }
        >
          {below
            ? `Your pay (~$${money(yourHourly)}/hr) is below the market median — consider raising it to compete for ${bench.label.toLowerCase()}s.`
            : above
              ? `Your pay (~$${money(yourHourly)}/hr) is above market — a strong, competitive offer.`
              : `Your pay (~$${money(yourHourly)}/hr) is in line with the market.`}
        </p>
      )}
      <p className="mt-1.5 text-[10px] text-slate-meta leading-snug">
        {formatSource(bench.source)} · {bench.vintage}. Guidance only — set pay using your own judgment.
      </p>
    </div>
  );
}
