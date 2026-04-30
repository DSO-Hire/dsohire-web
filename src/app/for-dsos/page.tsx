/**
 * /for-dsos — long-form pitch page for DSO operators.
 *
 * Audience: COO / VP HR / Director of Recruiting at DSOs running 10–50
 * practices, currently using DentalPost or staffing agencies.
 *
 * Goal: convert from "browsing" to "Talk to Cameron" or "Apply for Founding".
 */

import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "For DSOs",
  description:
    "Why mid-market DSOs running 10–50 practice locations should switch from DentalPost or staffing agencies to a flat-fee job board built for operators.",
};

export default function ForDsosPage() {
  return (
    <SiteShell>
      <Hero />
      <ProblemSection />
      <RoiMath />
      <FeatureBreakdown />
      <FoundingCallout />
      <FinalCta />
    </SiteShell>
  );
}

/* ───────── Hero ───────── */

function Hero() {
  return (
    <section className="pt-[140px] pb-20 px-6 sm:px-14 max-w-[1240px] mx-auto">
      <div className="flex items-center gap-3.5 mb-8">
        <span className="block w-7 h-px bg-heritage" />
        <span className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep">
          For DSO Operators
        </span>
      </div>

      <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-7 max-w-[920px]">
        Stop paying placement fees on roles you&apos;d hire anyway.
      </h1>
      <p className="text-lg sm:text-xl text-slate-body leading-relaxed max-w-[640px] mb-10">
        Mid-market DSOs running 10–50 practices spend $50K–$300K a year on
        per-listing fees and 15–25% staffing-agency placement charges. DSO Hire
        replaces all of it with one flat monthly subscription.
      </p>

      <div className="flex flex-wrap items-center gap-3.5">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
        >
          See Pricing
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="mailto:cam@dsohire.com"
          className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
        >
          Talk to Cameron
        </Link>
      </div>
    </section>
  );
}

/* ───────── The problem ───────── */

function ProblemSection() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-24">
      <div className="max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          The Math Today
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-6">
          The two options on the market weren&apos;t built for the way you actually hire.
        </h2>
        <p className="text-base text-slate-body leading-[1.7] max-w-[640px] mb-12">
          Today&apos;s mid-market DSO has two real choices, and both punish you for
          operating at scale.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          <ProblemCard
            heading="DentalPost"
            tagline="Built for solo practices. Priced per listing."
            points={[
              "Per-listing pricing means a 30-location DSO posting an associate role at three offices pays three times",
              "No native multi-location job posting — recruiters re-enter the same job over and over",
              "No team-based employer accounts. Office managers and regional directors all need separate logins",
              "Designed around individual practice owners, not multi-site operators",
            ]}
          />
          <ProblemCard
            heading="Staffing agencies"
            tagline="Effective, but priced for one-off executive searches."
            points={[
              "15–25% of first-year salary per placement. A $200K associate dentist costs you $30–50K in placement fees alone",
              "Routine roles (hygienists, dental assistants, office managers) move slowly through agency pipelines",
              "Limited visibility into the candidate pipeline — you see who they choose to share",
              "No leverage as your hiring volume grows. Hiring 10 people doesn&apos;t get you a discount",
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function ProblemCard({
  heading,
  tagline,
  points,
}: {
  heading: string;
  tagline: string;
  points: string[];
}) {
  return (
    <div className="bg-white p-10">
      <div className="text-[22px] font-extrabold tracking-[-0.6px] text-ink mb-2">
        {heading}
      </div>
      <div className="text-[14px] text-slate-body mb-6 leading-snug">
        {tagline}
      </div>
      <ul className="list-none border-t border-[var(--rule)] pt-5">
        {points.map((point, i) => (
          <li
            key={i}
            className="text-[14px] text-slate-body py-2.5 flex items-start gap-2.5 leading-[1.55]"
          >
            <Minus className="h-4 w-4 text-slate-meta/50 flex-shrink-0 mt-0.5" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── ROI math ───────── */

function RoiMath() {
  return (
    <section className="px-6 sm:px-14 py-28 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Run The Numbers
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[760px] mb-6">
        For a 25-practice DSO, the cost case takes about a minute.
      </h2>
      <p className="text-base text-slate-body leading-[1.7] max-w-[640px] mb-12">
        These are illustrative numbers based on the average mid-market DSO we
        designed for. Plug in your own and the conclusion holds.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        <RoiCard
          label="What you spend today"
          accent="slate"
          rows={[
            { item: "DentalPost listings (15 active × $99/mo)", value: "$1,485 / mo" },
            { item: "1 staffing-agency hire/quarter ($30K avg fee)", value: "$10,000 / mo" },
            { item: "Recruiter time re-entering jobs across listings", value: "Hidden" },
          ]}
          total="≈ $11,500 / mo"
          totalLabel="Annual: ~$138,000"
        />
        <RoiCard
          label="What DSO Hire costs"
          accent="heritage"
          rows={[
            { item: "Growth tier subscription", value: "$999 / mo" },
            { item: "Per-listing fees", value: "$0" },
            { item: "Placement fees", value: "$0" },
          ]}
          total="$999 / mo"
          totalLabel="Annual: $11,988"
        />
      </div>

      <div className="mt-10 bg-ink text-ivory p-8 sm:p-10">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-light mb-3">
          Net difference
        </div>
        <div className="text-2xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-tight">
          DSO Hire pays for itself in the first month, every month, on a single
          replaced agency hire.
        </div>
      </div>
    </section>
  );
}

function RoiCard({
  label,
  rows,
  total,
  totalLabel,
  accent,
}: {
  label: string;
  rows: Array<{ item: string; value: string }>;
  total: string;
  totalLabel: string;
  accent: "slate" | "heritage";
}) {
  return (
    <div className="bg-white p-10">
      <div
        className={`text-[10px] font-bold tracking-[2.5px] uppercase mb-6 ${
          accent === "heritage" ? "text-heritage-deep" : "text-slate-body"
        }`}
      >
        {label}
      </div>
      <ul className="list-none border-t border-[var(--rule)] pb-4">
        {rows.map((row, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between gap-6 py-3.5 border-b border-[var(--rule)] text-[14px]"
          >
            <span className="text-slate-body">{row.item}</span>
            <span className="font-bold text-ink whitespace-nowrap">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
      <div className="pt-4 mt-2">
        <div className="text-3xl font-extrabold tracking-[-1px] text-ink">
          {total}
        </div>
        <div className="text-[11px] font-semibold tracking-[1.5px] uppercase text-slate-meta mt-1">
          {totalLabel}
        </div>
      </div>
    </div>
  );
}

/* ───────── Feature breakdown ───────── */

const FEATURES = [
  {
    eyebrow: "Multi-location native",
    title: "Post one role across every practice in one flow.",
    body: "Write a job description once, assign it to as many of your locations as you need, and DSO Hire renders separate location-specific listings automatically. No copy-paste, no duplicate postings.",
  },
  {
    eyebrow: "Team accounts",
    title: "Recruiters, regional managers, office managers — one DSO, one account.",
    body: "Add your hiring team to a single DSO subscription. Roles include owner, admin, and recruiter, each with their own permissions. No more sharing logins or paying per seat.",
  },
  {
    eyebrow: "Application kanban",
    title: "Move candidates through a real pipeline, not an inbox.",
    body: "Submitted → Reviewed → Interviewing → Offer → Hired. Drag, sort, filter, leave internal notes that the candidate never sees. Full audit trail of who changed what when.",
  },
  {
    eyebrow: "Built-in compliance",
    title: "Pay-range disclosure, EEO language, retention defaults.",
    body: "Listings are validated for required pay-range disclosure in California, Colorado, NY, Washington, and the dozen other jurisdictions that require it. We won't let you accidentally ship a posting that's out of compliance.",
  },
  {
    eyebrow: "Stripe-secured billing",
    title: "Subscription billing the way every DSO already does it.",
    body: "Card or ACH (Enterprise tier). Stripe handles taxes, invoices, and the customer portal. No phantom fees, no auto-renewal surprises — cancel from your billing settings whenever you want.",
  },
  {
    eyebrow: "No placement fees",
    title: "Hire whoever applies. Keep 100% of their first-year salary.",
    body: "We don't take a cut of placements. We don't charge you when a candidate accepts. The subscription is the entire cost.",
  },
];

function FeatureBreakdown() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 py-28">
      <div className="max-w-[1240px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          What You Get
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[720px] mb-12">
          Every feature was built for the way DSOs actually hire.
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {FEATURES.map((f, i) => (
            <div key={i} className="bg-white p-10">
              <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
                {f.eyebrow}
              </div>
              <div className="text-[20px] font-extrabold tracking-[-0.5px] leading-tight text-ink mb-3">
                {f.title}
              </div>
              <p className="text-[14px] text-slate-body leading-[1.65]">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── Founding callout ───────── */

function FoundingCallout() {
  return (
    <section className="bg-ink text-ivory px-6 sm:px-14 py-24">
      <div className="max-w-[1000px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 items-center">
          <div>
            <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage mb-3.5">
              Founding Customers · First 5 Only
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ivory mb-5">
              Lock $299/mo for a year in exchange for a public testimonial.
            </h2>
            <p className="text-base text-ivory/70 leading-[1.65]">
              We&apos;re onboarding the first 5 mid-market DSOs at the Founding rate
              through summer 2026. You get rate lock, a Founding-customer badge,
              and a direct line to Cameron. We get a testimonial we can use to
              recruit customer 6 onward.
            </p>
          </div>
          <div>
            <Link
              href="mailto:cam@dsohire.com?subject=Founding%20customer%20interest"
              className="inline-flex items-center justify-center w-full text-center px-8 py-5 bg-heritage text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-heritage-deep transition-colors"
            >
              Apply for Founding
            </Link>
            <ul className="list-none mt-6 space-y-2.5 text-[13px] text-ivory/70">
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-heritage flex-shrink-0 mt-0.5" />
                <span>$299/mo locked for 12 months</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-heritage flex-shrink-0 mt-0.5" />
                <span>Founding-customer badge on your DSO profile</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-heritage flex-shrink-0 mt-0.5" />
                <span>Direct support line to Cameron</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="h-4 w-4 text-heritage flex-shrink-0 mt-0.5" />
                <span>Public testimonial in exchange (mutually approved)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────── Final CTA ───────── */

function FinalCta() {
  return (
    <section className="bg-ivory px-6 sm:px-14 py-24 text-center">
      <div className="max-w-[680px] mx-auto">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-5">
          15-minute call. No demo gauntlet. No sales script.
        </h2>
        <p className="text-base text-slate-body leading-[1.7] mb-9">
          Cameron wrote the product, and Cameron answers the email. Ask the
          questions you actually want answered.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="mailto:cam@dsohire.com?subject=DSO%20Hire%20intro%20call"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Email Cameron
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
          >
            See Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}
