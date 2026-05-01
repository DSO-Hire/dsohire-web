/**
 * /pricing — full pricing page driven from src/lib/stripe/prices.ts.
 *
 * Differs from the pricing teaser on the landing page:
 *   - Adds a "compare features" matrix at full detail
 *   - Adds an FAQ section
 *   - Adds a final CTA band
 *   - Each tier card includes the founding-only-5 cap visible on the Founding card
 */

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import {
  getAllTiers,
  type TierConfig,
  type PricingTier,
} from "@/lib/stripe/prices";
import { FaqAccordion } from "./faq-accordion";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Flat monthly subscription pricing for DSO Hire. Founding $299 · Starter $499 · Growth $999 · Enterprise $1,499. Unlimited multi-location postings, no placement fees.",
};

export default function PricingPage() {
  const tiers = getAllTiers();
  return (
    <div>
      <PricingHero />
      <TierGrid tiers={tiers} />
      <CompareMatrix tiers={tiers} />
      <FAQ />
      <FinalCta />
    </div>
  );
}

/* ───────── Hero ───────── */

function PricingHero() {
  return (
    <section className="pt-[120px] pb-12 px-6 sm:px-14 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Pricing
      </div>
      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5 max-w-[820px]">
        One flat fee. Sized to your footprint.
      </h1>
      <p className="text-lg text-slate-body leading-[1.7] max-w-[640px]">
        Pick the tier that matches your practice count. All tiers include unlimited
        multi-location posting. Cancel or change tiers anytime.
      </p>
    </section>
  );
}

/* ───────── Tier grid ───────── */

function TierGrid({ tiers }: { tiers: TierConfig[] }) {
  return (
    <section className="px-6 sm:px-14 max-w-[1240px] mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        {tiers.map((tier) => (
          <TierCard key={tier.id} tier={tier} />
        ))}
      </div>
      <p className="mt-10 text-[13px] text-slate-body text-center leading-relaxed">
        All tiers include unlimited multi-location posting, candidate dashboards, and
        Stripe-secured billing.{" "}
        <strong className="text-ink font-bold">
          No per-listing fees. No placement fees. Ever.
        </strong>
      </p>
    </section>
  );
}

function TierCard({ tier }: { tier: TierConfig }) {
  const isFeatured = tier.badge === "Most popular";
  return (
    <div
      className={`relative p-9 flex flex-col motion-safe:transition-all motion-safe:duration-200 ${
        isFeatured
          ? "bg-ink text-ivory"
          : "bg-white text-ink motion-safe:hover:-translate-y-1 hover:shadow-[0_12px_28px_-14px_rgba(7,15,28,0.18)] hover:bg-cream/30"
      }`}
    >
      {/* Floats above the card top edge — doesn't push content down, so all
          four cards stay aligned at the eyebrow row. */}
      {isFeatured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-heritage text-ivory text-[9px] font-bold tracking-[2px] uppercase whitespace-nowrap z-10">
          Most Popular
        </div>
      )}

      <div
        className={`text-2xl font-extrabold tracking-[-0.6px] mb-2 ${
          isFeatured ? "text-ivory" : "text-ink"
        }`}
      >
        {tier.name}
      </div>
      <div
        className={`text-xs mb-6 min-h-[34px] leading-snug ${
          isFeatured ? "text-ivory/70" : "text-slate-body"
        }`}
      >
        {tier.tagline}
      </div>

      <div className="flex items-baseline gap-1.5 mb-1.5">
        <div
          className={`text-[40px] font-extrabold tracking-[-1.5px] leading-none ${
            isFeatured ? "text-ivory" : "text-ink"
          }`}
        >
          ${tier.monthlyPrice.toLocaleString()}
        </div>
        <div
          className={`text-[13px] font-medium ${
            isFeatured ? "text-ivory/70" : "text-slate-body"
          }`}
        >
          / month
        </div>
      </div>
      <div
        className={`text-[11px] tracking-[0.4px] mb-7 min-h-[32px] leading-[1.45] ${
          isFeatured ? "text-ivory/55" : "text-slate-meta"
        }`}
      >
        {tier.id === "founding" &&
          `Limited to first ${tier.capActiveSubs ?? 5} customers · 12-month rate lock`}
        {tier.id === "starter" && "Most chosen for sub-20 location operators"}
        {tier.id === "growth" && "Unlimited listings unlocked"}
        {tier.id === "enterprise" && "Account management included"}
      </div>

      <Link
        href={`/employer/sign-up?tier=${tier.id}`}
        className={`block text-center px-4 py-3.5 text-[11px] font-bold tracking-[1.5px] uppercase mb-6 transition-colors border ${
          isFeatured
            ? "bg-heritage text-ivory border-heritage hover:bg-heritage-deep hover:border-heritage-deep"
            : "bg-ivory text-ink border-[var(--rule-strong)] hover:bg-ink hover:text-ivory hover:border-ink"
        }`}
      >
        {tier.id === "founding" && "Apply for Founding"}
        {tier.id === "starter" && "Start with Starter"}
        {tier.id === "growth" && "Choose Growth"}
        {tier.id === "enterprise" && "Contact Sales"}
      </Link>

      <ul
        className={`list-none border-t pt-4 ${
          isFeatured ? "border-white/15" : "border-[var(--rule)]"
        }`}
      >
        {tier.features.map((feature, i) => (
          <li
            key={i}
            className={`text-[12.5px] py-1.5 flex items-start gap-2 leading-snug ${
              isFeatured ? "text-ivory/90" : "text-ink"
            }`}
          >
            <span
              className={`font-extrabold flex-shrink-0 ${
                isFeatured ? "text-heritage-light" : "text-heritage-light"
              }`}
            >
              ✓
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────── Comparison matrix ───────── */

interface MatrixRow {
  feature: string;
  values: Record<PricingTier, string | boolean>;
}

interface MatrixGroup {
  label: string;
  rows: MatrixRow[];
}

const COMPARE_GROUPS: MatrixGroup[] = [
  {
    label: "Capacity",
    rows: [
      {
        feature: "Active job listings",
        values: { founding: "Up to 25", starter: "Up to 25", growth: "Unlimited", enterprise: "Unlimited" },
      },
      {
        feature: "Practice locations covered",
        values: { founding: "All", starter: "All", growth: "All", enterprise: "All" },
      },
      {
        feature: "Team members",
        values: { founding: "Up to 3", starter: "Up to 5", growth: "Unlimited", enterprise: "Unlimited" },
      },
    ],
  },
  {
    label: "Hiring tools",
    rows: [
      {
        feature: "Application kanban + status tracking",
        values: { founding: true, starter: true, growth: true, enterprise: true },
      },
      {
        feature: "Multi-location posting in one flow",
        values: { founding: true, starter: true, growth: true, enterprise: true },
      },
      {
        feature: "Custom screening questions per job",
        values: { founding: false, starter: false, growth: true, enterprise: true },
      },
      {
        feature: "Custom branding on company page",
        values: { founding: false, starter: false, growth: true, enterprise: true },
      },
      {
        feature: "Cross-job application inbox",
        values: { founding: false, starter: false, growth: true, enterprise: true },
      },
    ],
  },
  {
    label: "Support",
    rows: [
      {
        feature: "Priority email support",
        values: { founding: false, starter: false, growth: true, enterprise: true },
      },
      {
        feature: "Dedicated account manager",
        values: { founding: false, starter: false, growth: false, enterprise: true },
      },
      {
        feature: "SLA with response-time guarantees",
        values: { founding: false, starter: false, growth: false, enterprise: true },
      },
    ],
  },
  {
    label: "Founding-tier exclusives",
    rows: [
      {
        feature: "Founding-customer badge",
        values: { founding: true, starter: false, growth: false, enterprise: false },
      },
      {
        feature: "12-month rate lock",
        values: { founding: true, starter: false, growth: false, enterprise: false },
      },
    ],
  },
];

function CompareMatrix({ tiers }: { tiers: TierConfig[] }) {
  return (
    <section className="px-6 sm:px-14 pt-28 pb-20 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Side By Side
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[720px] mb-12">
        What you get at each tier.
      </h2>

      {/*
        Sticky thead trick: we need the page (not a wrapper) to be the scroll
        container for vertical sticky to work. On lg+ the table fits without
        horizontal scroll, so overflow is visible there. On smaller screens
        the wrapper falls back to overflow-x-auto for horizontal scroll, and
        the sticky header just doesn't engage — acceptable trade-off since
        comparison tables are primarily a desktop surface.
      */}
      <div className="-mx-6 sm:-mx-14 px-6 sm:px-14 overflow-x-auto lg:overflow-visible">
        <table className="w-full min-w-[860px] border-collapse">
          {/* ── Branded navy header row — sticks below the 80px nav on scroll ── */}
          <thead className="sticky top-[80px] z-20 shadow-[0_4px_12px_-8px_rgba(7,15,28,0.25)]">
            <tr className="bg-ink">
              <th className="text-left text-[10px] font-bold tracking-[2.5px] uppercase text-ivory/60 py-6 pl-5 pr-6 align-bottom rounded-tl-sm">
                Feature
              </th>
              {tiers.map((tier, idx) => {
                const isFeatured = tier.badge === "Most popular";
                const isLast = idx === tiers.length - 1;
                return (
                  <th
                    key={tier.id}
                    className={`text-left py-6 px-4 align-bottom relative ${
                      isFeatured
                        ? "bg-ink-soft border-l-2 border-r-2 border-heritage"
                        : ""
                    } ${isLast ? "rounded-tr-sm pr-5" : ""}`}
                  >
                    {isFeatured && (
                      <span className="absolute top-2.5 right-3 inline-flex items-center px-2 py-0.5 bg-heritage text-ivory text-[8px] font-bold tracking-[1.5px] uppercase">
                        Most Popular
                      </span>
                    )}
                    <div className="text-[16px] font-extrabold tracking-[-0.4px] text-ivory mb-1">
                      {tier.name}
                    </div>
                    <div className="text-[12px] font-semibold text-ivory/55">
                      ${tier.monthlyPrice.toLocaleString()}/mo
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {COMPARE_GROUPS.map((group, gi) => (
              <MatrixGroupBlock
                key={gi}
                group={group}
                tiers={tiers}
                isFirst={gi === 0}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MatrixGroupBlock({
  group,
  tiers,
  isFirst,
}: {
  group: MatrixGroup;
  tiers: TierConfig[];
  isFirst: boolean;
}) {
  return (
    <>
      {/* ── Group label band ──
          Split into per-column cells so the navy Growth column can continue
          uninterrupted through the section dividers. */}
      <tr className={isFirst ? "" : "border-t-4 border-white"}>
        <td className="bg-cream py-3 pl-5 pr-4 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          <span className="inline-flex items-center gap-2.5">
            <span className="block w-5 h-px bg-heritage" />
            {group.label}
          </span>
        </td>
        {tiers.map((tier) => {
          const isFeatured = tier.badge === "Most popular";
          return (
            <td
              key={tier.id}
              className={
                isFeatured
                  ? "bg-ink border-l-2 border-r-2 border-heritage"
                  : "bg-cream"
              }
              aria-hidden="true"
            />
          );
        })}
      </tr>
      {/* ── Group rows ── */}
      {group.rows.map((row, ri) => (
        <tr
          key={ri}
          className="border-b border-[var(--rule)] hover:bg-cream/40 transition-colors"
        >
          <td className="text-[13.5px] text-ink py-4 pl-5 pr-6 leading-snug font-medium">
            {row.feature}
          </td>
          {tiers.map((tier) => {
            const value = row.values[tier.id];
            const isFeatured = tier.badge === "Most popular";
            return (
              <td
                key={tier.id}
                className={`text-[13px] py-4 px-4 align-middle ${
                  isFeatured
                    ? "bg-ink border-l-2 border-r-2 border-heritage"
                    : ""
                }`}
              >
                {typeof value === "boolean" ? (
                  value ? (
                    <Check
                      className={`h-4 w-4 ${
                        isFeatured ? "text-ivory" : "text-heritage"
                      }`}
                      strokeWidth={3}
                    />
                  ) : (
                    <span
                      className={`text-[18px] leading-none font-light ${
                        isFeatured ? "text-ivory/30" : "text-slate-meta/30"
                      }`}
                    >
                      —
                    </span>
                  )
                ) : (
                  <span
                    className={`font-semibold ${
                      isFeatured ? "text-ivory" : "text-ink"
                    }`}
                  >
                    {value}
                  </span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

/* ───────── FAQ ───────── */

const FAQ_ITEMS = [
  {
    q: "Is there a setup fee or implementation cost?",
    a: "No. The monthly subscription is the entire cost. Sign up, pay through Stripe, and your account is live in minutes.",
  },
  {
    q: "What happens after the 12-month Founding rate lock expires?",
    a: "We'll email you about a month before your rate lock ends. Your subscription then automatically migrates to the standard tier that matches your practice count — Starter (10–20 practices), Growth (20–35), or Enterprise (35+). The Founding rate is a one-time, first-12-months offer; it isn't renewed.",
  },
  {
    q: "Can I change tiers later?",
    a: "Yes. Upgrade or downgrade anytime from your billing settings. Stripe handles prorated billing automatically.",
  },
  {
    q: "Are there per-listing or placement fees on top of the subscription?",
    a: "No. Post unlimited roles across every practice you operate. We never take a cut of placements, and we never charge per listing.",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit cards, plus ACH for Enterprise customers. Billing is monthly with automatic renewal.",
  },
  {
    q: "Do you support invoicing for Enterprise customers?",
    a: "Yes. Enterprise tier includes invoicing on net-30 terms. Reach out via cam@dsohire.com to set up your invoicing profile.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your billing portal — you'll retain access through the end of your current billing period, and you won't be charged again.",
  },
  {
    q: "Is there a free trial?",
    a: "Not currently. Founding tier ($299/mo) is intentionally priced low for early customers in exchange for a testimonial — that's our 'low-risk way to try DSO Hire' offer.",
  },
];

function FAQ() {
  return (
    <section className="bg-cream border-y border-[var(--rule)] px-6 sm:px-14 pt-24 pb-24">
      <div className="max-w-[860px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
          FAQ
        </div>
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink mb-12">
          Common questions.
        </h2>
        <FaqAccordion items={FAQ_ITEMS} />
      </div>
    </section>
  );
}

/* ───────── Final CTA ───────── */

function FinalCta() {
  return (
    <section className="bg-ivory px-6 sm:px-14 py-24 text-center">
      <div className="max-w-[680px] mx-auto">
        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-4">
          Still deciding which tier fits?
        </h2>
        <p className="text-base text-slate-body leading-[1.7] mb-8">
          Most decisions take a 15-minute conversation — no sales pitch, no
          demo gauntlet. Drop us a note and we&apos;ll get back to you the same
          business day.
        </p>
        <div className="flex flex-wrap gap-3.5 justify-center">
          <Link
            href="/employer/sign-up"
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Sign Up
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  );
}
