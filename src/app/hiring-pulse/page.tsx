/**
 * /hiring-pulse — the Dental Hiring Pulse (#115 Model 07, Day 32).
 *
 * Live, public dental-hiring market data: posted-pay explorer by role,
 * demand by state, marketplace counters — computed from the live public
 * job inventory at render time (lib/marketing/market-pulse.ts). The
 * industry's reference data runs on annual surveys; this page runs on
 * the database, with hard honesty floors (n ≥ 20 per role stat, page
 * degrades to a "warming up" state when inventory is thin).
 *
 * Why it exists: SEO compounding ("dental hygienist pay [state]" class
 * queries), PR hooks (a citable quarterly Pulse), and PE-diligence
 * credibility — a marketplace confident enough to publish its own data.
 *
 * v2 follow-ups (queued, NOT here): aggregated candidate-priority signals
 * (needs privacy review + service-role aggregates), quarterly report email
 * capture, per-state deep pages.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import { CountUp } from "@/components/marketing/motion";
import {
  getMarketPulse,
  type PulseSnapshot,
} from "@/lib/marketing/market-pulse";
import { PulseExplorer } from "./pulse-explorer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dental Hiring Pulse — live dental job market data",
  description:
    "What dental roles actually pay and where demand is hottest — live data from real openings on DSO Hire. Posted-pay percentiles by role, demand by state, updated continuously.",
};

// Live data — recompute periodically, not per-request.
export const revalidate = 3600;

export default async function HiringPulsePage() {
  const pulse = await getMarketPulse();
  return (
    <SiteShell>
      <Hero pulse={pulse} />
      {pulse.showPulse ? (
        <>
          <PayExplorerSection pulse={pulse} />
          <DemandSection pulse={pulse} />
        </>
      ) : (
        <WarmingUp />
      )}
      <ClosingCta />
    </SiteShell>
  );
}

function Hero({ pulse }: { pulse: PulseSnapshot }) {
  return (
    <section className="relative pt-[140px] pb-16 px-6 sm:px-14 overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse at 50% 10%, #000, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 10%, #000, transparent 72%)",
        }}
      />
      <div className="relative max-w-[1080px] mx-auto text-center">
        <span
          data-reveal
          className="inline-flex items-center gap-2.5 border border-heritage/30 px-4 py-2 mb-6"
          style={{ background: "var(--heritage-tint)" }}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-heritage opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
          </span>
          <span className="text-[10px] font-bold tracking-[1.6px] uppercase text-heritage-deep">
            Live marketplace data · recomputed hourly
          </span>
        </span>
        <h1
          data-reveal
          style={{ "--mk-delay": "70ms" } as React.CSSProperties}
          className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5"
        >
          The Dental Hiring{" "}
          <em className="not-italic text-heritage-light">Pulse.</em>
        </h1>
        <p
          data-reveal
          style={{ "--mk-delay": "140ms" } as React.CSSProperties}
          className="text-lg text-slate-body leading-relaxed max-w-[620px] mx-auto"
        >
          What dental roles actually pay and where demand is hottest —
          computed from real, live openings. Not last year&rsquo;s survey.
        </p>

        {pulse.showPulse && (
          <div
            data-reveal
            style={{ "--mk-delay": "200ms" } as React.CSSProperties}
            className="flex flex-wrap justify-center gap-x-14 gap-y-5 mt-11"
          >
            <HeroStat value={pulse.totalJobs} label="Open roles tracked" />
            <HeroStat value={pulse.statesCovered} label="States with openings" />
            <HeroStat value={pulse.groupsHiring} label="Dental groups hiring" />
          </div>
        )}
      </div>
    </section>
  );
}

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-[38px] font-extrabold tracking-[-1.5px] leading-none text-ink tabular-nums">
        <CountUp to={value} duration={900} />
      </div>
      <div className="mt-1.5 text-[10px] font-bold tracking-[1.6px] uppercase text-slate-meta">
        {label}
      </div>
    </div>
  );
}

function PayExplorerSection({ pulse }: { pulse: PulseSnapshot }) {
  return (
    <section
      className="border-y border-[var(--rule)] px-6 sm:px-14 py-20"
      style={{ background: "var(--color-cream)" }}
    >
      <div className="max-w-[1080px] mx-auto">
        <div
          data-reveal
          className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5"
        >
          Posted-pay explorer
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "60ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-4"
        >
          What the market is offering, right now.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "120ms" } as React.CSSProperties}
          className="text-[15px] text-slate-body leading-[1.7] max-w-[600px] mb-9"
        >
          Computed from pay ranges on live postings. Pick a role — only roles
          with enough data to be trustworthy appear at all.
        </p>
        <div data-reveal style={{ "--mk-delay": "180ms" } as React.CSSProperties}>
          <PulseExplorer roles={pulse.roles} />
        </div>
      </div>
    </section>
  );
}

function DemandSection({ pulse }: { pulse: PulseSnapshot }) {
  const max = pulse.states[0]?.count ?? 1;
  return (
    <section className="px-6 sm:px-14 py-20">
      <div className="max-w-[1080px] mx-auto">
        <div
          data-reveal
          className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5"
        >
          Where demand is
        </div>
        <h2
          data-reveal
          style={{ "--mk-delay": "60ms" } as React.CSSProperties}
          className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-4"
        >
          Openings by state.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "120ms" } as React.CSSProperties}
          className="text-[15px] text-slate-body leading-[1.7] max-w-[600px] mb-9"
        >
          States light up as groups join — watching this grid fill in is the
          growth story, live.
        </p>
        <div
          data-reveal
          style={{ "--mk-delay": "180ms" } as React.CSSProperties}
          className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2"
        >
          {pulse.states.map((s) => (
            <div
              key={s.state}
              className={`relative border px-3 py-3 ${
                s.count >= max * 0.4
                  ? "border-heritage/40"
                  : "border-[var(--rule-strong)] bg-cream"
              }`}
              style={
                s.count >= max * 0.4
                  ? { background: "var(--heritage-tint)" }
                  : undefined
              }
            >
              <span
                aria-hidden
                className="absolute top-0 left-0 right-0 h-[3px] bg-heritage"
                style={{ opacity: Math.max(0.12, s.count / max) }}
              />
              <div className="text-[16px] font-extrabold tracking-[-0.3px] text-ink">
                {s.state}
              </div>
              <div className="text-[10.5px] text-slate-meta mt-0.5 tabular-nums">
                {s.count} open {s.count === 1 ? "role" : "roles"}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-[12px] text-slate-meta leading-[1.6]">
          A role posted across practices in multiple states counts in each
          state it&rsquo;s hiring in.
        </p>
      </div>
    </section>
  );
}

function WarmingUp() {
  return (
    <section className="px-6 sm:px-14 py-24">
      <div className="max-w-[640px] mx-auto text-center border border-[var(--rule-strong)] bg-cream px-10 py-14">
        <h2 className="text-[20px] font-extrabold tracking-[-0.4px] text-ink mb-3">
          The Pulse is warming up.
        </h2>
        <p className="text-[14px] text-slate-body leading-[1.75]">
          This page publishes live market statistics only when there&rsquo;s
          enough inventory to be trustworthy — no projections, no padding.
          Check back as the marketplace grows, or browse what&rsquo;s live
          right now.
        </p>
        <Link
          href="/jobs"
          className="inline-flex items-center gap-2 mt-7 px-6 py-3 bg-ink text-ivory text-[11px] font-bold tracking-[1.6px] uppercase hover:bg-ink-soft transition-colors"
        >
          Browse Dental Jobs
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="relative bg-ink text-ivory px-6 sm:px-14 py-20 text-center overflow-hidden">
      <div
        aria-hidden
        className="absolute pointer-events-none"
        style={{
          top: "50%",
          left: "50%",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(77,122,96,0.12), transparent 65%)",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div className="relative max-w-[720px] mx-auto">
        <h2
          data-reveal
          className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.1] mb-4"
        >
          This data comes from somewhere.
        </h2>
        <p
          data-reveal
          style={{ "--mk-delay": "60ms" } as React.CSSProperties}
          className="text-[15px] text-ivory/60 leading-[1.7] max-w-[520px] mx-auto mb-9"
        >
          Every number on this page is a real opening at a real dental group —
          posted direct, no agencies. Join either side of it.
        </p>
        <div
          data-reveal
          style={{ "--mk-delay": "120ms" } as React.CSSProperties}
          className="flex flex-wrap gap-3.5 justify-center"
        >
          <Link
            href="/jobs"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-ivory text-ink text-[12px] font-bold tracking-[1.8px] uppercase hover:bg-ivory-deep transition-colors"
          >
            Browse Dental Jobs
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/for-dental-groups"
            className="inline-flex items-center px-7 py-[13px] border border-ivory/35 text-ivory text-[12px] font-bold tracking-[1.8px] uppercase hover:border-heritage-light hover:text-heritage-light transition-colors"
          >
            Hire On DSO Hire
          </Link>
        </div>
      </div>
    </section>
  );
}
