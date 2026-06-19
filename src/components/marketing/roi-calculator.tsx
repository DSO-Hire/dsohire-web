"use client";

/**
 * RoiCalculator — #115 FOH-5, the employer-side conversion machine atop
 * /pricing. v2 (Day 32, Cam ask): hiring spend modeled as TWO channels —
 * agencies/recruiters (placement fees) AND job boards (per-listing fees).
 * v1 only modeled agencies, which showed $0 savings to the board-only
 * groups the platform serves best.
 *
 * Inputs (brand .dso-slider): locations + hires/year, then a slider pair
 * per channel under mini section headers. Output: per-channel rows, a
 * "today's total vs DSO Hire" stacked-bar picture (the argument lands
 * visually before the numbers are read), and a channel-aware payback
 * line — including the strongest version: when listings spend ALONE
 * covers the subscription, we say so.
 *
 * Tier prices arrive as props from the server page (single source of
 * truth = getAllTiers); nothing is hardcoded here except the illustrative
 * fee ranges, which the caption labels as such.
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
  // Channel 1 — agencies / recruiters
  const [agencyPct, setAgencyPct] = useState(30);
  const [avgFee, setAvgFee] = useState(25000);
  // Channel 2 — job boards / per-listing fees (Day 32)
  const [listings, setListings] = useState(10);
  const [costPerListing, setCostPerListing] = useState(350);

  const tier = recommendTier(locations, tiers);
  const agencyHires = Math.round((hiresPerYear * agencyPct) / 100);
  const agencySpend = agencyHires * avgFee;
  const boardSpend = listings * costPerListing * 12;
  const todayTotal = agencySpend + boardSpend;
  const dsoHireAnnual = tier.annualMonthly * 12;
  const savings = todayTotal - dsoHireAnnual;
  const feeYearsCovered = avgFee > 0 ? avgFee / dsoHireAnnual : 0;
  const boardCoversPct =
    dsoHireAnnual > 0 ? Math.round((boardSpend / dsoHireAnnual) * 100) : 0;

  // Bar widths — both bars share one scale so the contrast is honest.
  const maxVal = Math.max(todayTotal, dsoHireAnnual, 1);
  const pct = (v: number) =>
    v <= 0 ? 0 : Math.max((v / maxVal) * 100, 1.75); // floor keeps tiny segments visible

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
            <CalcSlider
              label="Hires per year — all locations"
              value={hiresPerYear}
              display={String(hiresPerYear)}
              min={5}
              max={600}
              step={5}
              onChange={setHiresPerYear}
            />

            <ChannelLabel n="01" label="Agencies & recruiters" />
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

            <ChannelLabel n="02" label="Job boards & per-listing fees" />
            <CalcSlider
              label="Listings running at a time"
              value={listings}
              display={String(listings)}
              min={0}
              max={150}
              step={1}
              onChange={setListings}
            />
            <CalcSlider
              label="Avg monthly cost per listing"
              value={costPerListing}
              display={fmtUsd(costPerListing)}
              min={50}
              max={1000}
              step={25}
              onChange={setCostPerListing}
            />

            <p className="mt-5 text-[11.5px] text-slate-meta leading-snug max-w-[440px]">
              Illustrative math — your inputs, our flat fees. Agency placement
              fees typically run 15–25% of first-year salary; sponsored
              listings on the major boards commonly run $200–$600 per posting
              per month. Adjust both to match your reality.
            </p>
          </div>

          {/* Output */}
          <div className="bg-hero text-hero-foreground p-8 sm:p-10 flex flex-col">
            <div className="text-[10px] font-bold tracking-[3px] uppercase text-[var(--heritage-bright,#8db8a3)] mb-6">
              Your estimate
            </div>

            <div className="space-y-4 mb-6">
              <OutputRow
                label={`Agency spend / year (${agencyHires} ${agencyHires === 1 ? "hire" : "hires"})`}
                value={fmtUsd(agencySpend)}
              />
              <OutputRow
                label={`Job-board spend / year (${listings} ${listings === 1 ? "listing" : "listings"})`}
                value={fmtUsd(boardSpend)}
              />
              <div className="border-t border-hero-foreground/15 pt-4">
                <OutputRow
                  label="Your hiring spend today / year"
                  value={fmtUsd(todayTotal)}
                />
              </div>
              <OutputRow
                label={`DSO Hire ${tier.name} / year (billed annually)`}
                value={fmtUsd(dsoHireAnnual)}
                accent
              />
            </div>

            {/* ── The picture: your stack vs our line ── */}
            {todayTotal > 0 && (
              <div className="mb-6" aria-hidden>
                <BarRow label="Today">
                  {agencySpend > 0 && (
                    <span
                      className="h-full bg-ivory/40 transition-all duration-500"
                      style={{ width: `${pct(agencySpend)}%` }}
                      title={`Agencies: ${fmtUsd(agencySpend)}`}
                    />
                  )}
                  {boardSpend > 0 && (
                    <span
                      className="h-full bg-ivory/20 transition-all duration-500"
                      style={{ width: `${pct(boardSpend)}%` }}
                      title={`Job boards: ${fmtUsd(boardSpend)}`}
                    />
                  )}
                </BarRow>
                <BarRow label="DSO Hire">
                  <span
                    className="h-full transition-all duration-500"
                    style={{
                      width: `${pct(dsoHireAnnual)}%`,
                      background: "var(--heritage-bright, #8db8a3)",
                    }}
                    title={`DSO Hire ${tier.name}: ${fmtUsd(dsoHireAnnual)}`}
                  />
                </BarRow>
                <div className="flex gap-4 mt-2 text-[9px] font-bold tracking-[1px] uppercase text-hero-foreground/40">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-ivory/40" /> Agencies
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-ivory/20" /> Job boards
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="w-2 h-2"
                      style={{ background: "var(--heritage-bright, #8db8a3)" }}
                    />{" "}
                    Flat fee
                  </span>
                </div>
              </div>
            )}

            <div className="border-t border-hero-foreground/15 pt-4 mb-6">
              <div className="text-[11px] font-bold tracking-[1.8px] uppercase text-hero-foreground/50 mb-1">
                {savings >= 0 ? "Estimated kept in your pocket" : "Difference"}
              </div>
              <div
                className="text-[44px] font-extrabold tracking-[-2px] leading-none tabular-nums"
                style={{ color: savings >= 0 ? "#8db8a3" : "#F7F4ED" }}
              >
                {fmtUsd(Math.abs(savings))}
                <span className="text-[16px] font-bold text-hero-foreground/50 ml-1.5">/yr</span>
              </div>
            </div>

            {/* Channel-aware payback line — strongest true claim wins. */}
            <p className="text-[13px] text-hero-foreground/70 leading-relaxed mb-7">
              {boardSpend >= dsoHireAnnual && listings > 0 ? (
                <>
                  Your job-board spend <strong className="text-hero-foreground">alone</strong>{" "}
                  more than covers {tier.name} — every avoided placement fee
                  after that is pure savings. Unlimited postings included.
                </>
              ) : agencyHires > 0 ? (
                <>
                  One avoided {fmtUsd(avgFee)} placement fee covers{" "}
                  <strong className="text-hero-foreground">
                    {feeYearsCovered >= 1
                      ? `${feeYearsCovered.toFixed(1)} years`
                      : `${Math.round(feeYearsCovered * 12)} months`}
                  </strong>{" "}
                  of {tier.name}
                  {boardSpend > 0 && boardCoversPct >= 10 ? (
                    <>
                      {" "}
                      — and your listings spend already covers{" "}
                      <strong className="text-hero-foreground">{boardCoversPct}%</strong>{" "}
                      of it before that.
                    </>
                  ) : (
                    <> — unlimited hires included.</>
                  )}
                </>
              ) : listings > 0 ? (
                <>
                  Trading {listings} per-listing fees for one flat subscription
                  covers{" "}
                  <strong className="text-hero-foreground">
                    {Math.min(boardCoversPct, 100)}%
                  </strong>{" "}
                  of {tier.name} — with unlimited postings across all{" "}
                  {locations} locations instead of a meter running on each one.
                </>
              ) : (
                <>
                  Filling every role with zero agency and zero board spend?
                  Impressive. DSO Hire still adds the pipeline, PracticeFit
                  matching, and automation those channels never gave you.
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

function ChannelLabel({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 mt-7 mb-4">
      <span className="text-[9px] font-extrabold tracking-[1.5px] text-heritage-deep">
        {n}
      </span>
      <span className="text-[11px] font-bold tracking-[2px] uppercase text-ink">
        {label}
      </span>
      <span className="flex-1 h-px bg-heritage/25" />
    </div>
  );
}

function BarRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-1.5">
      <span className="w-[64px] shrink-0 text-[9px] font-bold tracking-[1.2px] uppercase text-hero-foreground/50 text-right">
        {label}
      </span>
      <span className="flex-1 h-[16px] bg-ivory/[0.07] flex gap-px overflow-hidden">
        {children}
      </span>
    </div>
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
      <span className="text-[13px] text-hero-foreground/65 leading-snug">{label}</span>
      <span
        className={`text-[20px] font-extrabold tracking-[-0.6px] tabular-nums whitespace-nowrap ${
          accent ? "text-[var(--heritage-bright,#8db8a3)]" : "text-hero-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
