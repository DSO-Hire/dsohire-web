"use client";

/**
 * RoiCalculator — #115 FOH-5, the employer-side conversion machine atop
 * /pricing. Category convention (GoTu + Cloud Dentistry both run value
 * calculators) executed in the DSO Hire voice: the visitor's own numbers,
 * our flat fees, honest math.
 *
 * Inputs (brand .dso-slider): locations · hires/year · % filled through
 * agencies · average placement fee. Output: estimated annual agency spend
 * vs the recommended tier's annual price + the one-line conclusion
 * ("one avoided placement covers N years").
 *
 * Tier prices arrive as props from the server page (single source of
 * truth = getAllTiers); nothing is hardcoded here except the agency-fee
 * range, which is labeled illustrative.
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface RoiTierInfo {
  id: string;
  name: string;
  /** Annual-billing monthly equivalent (matches the pricing page default). */
  annualMonthly: number;
}

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** Locations → recommended tier, mirroring the pricing page's framing. */
function recommendTier(locations: number, tiers: RoiTierInfo[]): RoiTierInfo {
  const id =
    locations <= 5
      ? "solo"
      : locations <= 20
        ? "growth"
        : locations <= 100
          ? "scale"
          : "enterprise";
  return tiers.find((t) => t.id === id) ?? tiers[0];
}

export function RoiCalculator({ tiers }: { tiers: RoiTierInfo[] }) {
  const [locations, setLocations] = useState(12);
  const [hiresPerYear, setHiresPerYear] = useState(10);
  const [agencyPct, setAgencyPct] = useState(30);
  const [avgFee, setAvgFee] = useState(25000);

  const tier = recommendTier(locations, tiers);
  const agencyHires = Math.round((hiresPerYear * agencyPct) / 100);
  const agencySpend = agencyHires * avgFee;
  const dsoHireAnnual = tier.annualMonthly * 12;
  const savings = agencySpend - dsoHireAnnual;
  const yearsCovered = avgFee > 0 ? avgFee / dsoHireAnnual : 0;

  return (
    <section className="px-6 sm:px-14 pb-16 max-w-[1240px] mx-auto">
      <div
        data-reveal
        className="border border-heritage/30 overflow-hidden"
        style={{ background: "var(--heritage-tint)" }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr]">
          {/* Inputs */}
          <div className="p-8 sm:p-10">
            <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
              Run Your Numbers
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] leading-[1.12] text-ink mb-7 max-w-[440px]">
              What does hiring cost you today?
            </h2>

            <CalcSlider
              label="Practice locations"
              value={locations}
              display={String(locations)}
              min={2}
              max={300}
              step={1}
              onChange={setLocations}
            />
            {/* Day 32 (Cam): "all locations" added — the old bare label read
                as per-location to some eyes; and 60/yr capped out absurdly
                low for large platforms (a 120-location group with normal
                dental turnover hires hundreds a year). */}
            <CalcSlider
              label="Hires per year — all locations"
              value={hiresPerYear}
              display={String(hiresPerYear)}
              min={5}
              max={600}
              step={5}
              onChange={setHiresPerYear}
            />
            <CalcSlider
              label="Filled through agencies / recruiters"
              value={agencyPct}
              display={`${agencyPct}%`}
              min={0}
              max={100}
              step={5}
              onChange={setAgencyPct}
            />
            <CalcSlider
              label="Average placement fee"
              value={avgFee}
              display={fmtUsd(avgFee)}
              min={5000}
              max={50000}
              step={2500}
              onChange={setAvgFee}
            />

            <p className="mt-5 text-[11.5px] text-slate-meta leading-snug max-w-[440px]">
              Illustrative math — your inputs, our flat fees. Agency placement
              fees typically run 15–25% of first-year salary; adjust the
              average to match your roles.
            </p>
          </div>

          {/* Output */}
          <div className="bg-ink text-ivory p-8 sm:p-10 flex flex-col">
            <div className="text-[10px] font-bold tracking-[3px] uppercase text-[var(--heritage-bright,#8db8a3)] mb-6">
              Your estimate
            </div>

            <div className="space-y-5 mb-7">
              <OutputRow
                label={`Agency spend / year (${agencyHires} ${agencyHires === 1 ? "hire" : "hires"})`}
                value={fmtUsd(agencySpend)}
              />
              <OutputRow
                label={`DSO Hire ${tier.name} / year (billed annually)`}
                value={fmtUsd(dsoHireAnnual)}
                accent
              />
              <div className="border-t border-ivory/15 pt-5">
                <div className="text-[11px] font-bold tracking-[1.8px] uppercase text-ivory/50 mb-1">
                  {savings >= 0 ? "Estimated kept in your pocket" : "Difference"}
                </div>
                <div
                  className="text-[44px] font-extrabold tracking-[-2px] leading-none tabular-nums"
                  style={{ color: savings >= 0 ? "#8db8a3" : "#F7F4ED" }}
                >
                  {fmtUsd(Math.abs(savings))}
                  <span className="text-[16px] font-bold text-ivory/50 ml-1.5">/yr</span>
                </div>
              </div>
            </div>

            <p className="text-[13px] text-ivory/70 leading-relaxed mb-7">
              {agencyHires > 0 ? (
                <>
                  One avoided {fmtUsd(avgFee)} placement fee covers{" "}
                  <strong className="text-ivory">
                    {yearsCovered >= 1
                      ? `${yearsCovered.toFixed(1)} years`
                      : `${Math.round(yearsCovered * 12)} months`}
                  </strong>{" "}
                  of {tier.name} — unlimited hires included.
                </>
              ) : (
                <>
                  Not using agencies? You&apos;re still replacing per-listing
                  job-board fees with one flat subscription across all{" "}
                  {locations} locations — unlimited hires included.
                </>
              )}
            </p>

            <Link
              href={`/employer/sign-up?tier=${tier.id}&period=annual`}
              className="mt-auto inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-ivory text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ivory-deep transition-colors"
            >
              Start With {tier.name}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function CalcSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <label className="text-[12px] font-bold tracking-[1.2px] uppercase text-slate-body">
          {label}
        </label>
        <span className="text-[17px] font-extrabold tracking-[-0.4px] text-ink tabular-nums">
          {display}
        </span>
      </div>
      <input
        type="range"
        className="dso-slider w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  );
}

function OutputRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[13px] text-ivory/65 leading-snug">{label}</span>
      <span
        className={`text-[20px] font-extrabold tracking-[-0.6px] tabular-nums whitespace-nowrap ${
          accent ? "text-[var(--heritage-bright,#8db8a3)]" : "text-ivory"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
