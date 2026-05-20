/**
 * /pricing — full pricing page driven from src/lib/stripe/prices.ts.
 *
 * Differs from the pricing teaser on the landing page:
 *   - Adds a monthly/annual billing toggle (annual = ~10% off)
 *   - Adds a "compare features" matrix at full detail
 *   - Adds an FAQ section
 *   - Adds a final CTA band
 *
 * The selected billing period lives in the `period` search param so the page
 * stays server-rendered; only the toggle control is a client component.
 */

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import {
  getAllTiers,
  isBillingPeriod,
  type TierConfig,
  type PricingTier,
  type BillingPeriod,
} from "@/lib/stripe/prices";
import { BillingPeriodToggle } from "./billing-period-toggle";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { SALES_EMAIL } from "@/lib/contact";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Flat monthly subscription pricing for DSO Hire. Solo $399 · Growth $699 · Scale $1,499 · Enterprise $2,999. Save 10% with annual billing. Multi-location dental hiring, no per-listing fees, no placement fees.",
};

interface PricingPageProps {
  // `next` is propagated from /employer/sign-in when a deep-link redirect
  // bounced an unauthenticated user here first. We carry it through the
  // tier-card sign-up CTAs so the post-signup redirect returns them to
  // wherever they were trying to go. `period` drives the billing toggle.
  searchParams: Promise<{ next?: string; period?: string }>;
}

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const sp = await searchParams;
  const tiers = getAllTiers();
  const nextParam = sp.next?.trim() || null;
  const period: BillingPeriod = isBillingPeriod(sp.period) ? sp.period : "monthly";
  return (
    <div>
      <PricingHero />
      <TierGrid tiers={tiers} nextParam={nextParam} period={period} />
      <CompareMatrix tiers={tiers} period={period} />
      <FAQ />
      <FinalCta nextParam={nextParam} />
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
        Pick the tier that matches your footprint. Every tier includes
        multi-location posting and Practice Fit. Cancel or change tiers anytime.
      </p>
    </section>
  );
}

/* ───────── Tier grid ───────── */

function TierGrid({
  tiers,
  nextParam,
  period,
}: {
  tiers: TierConfig[];
  nextParam: string | null;
  period: BillingPeriod;
}) {
  return (
    <section className="px-6 sm:px-14 max-w-[1240px] mx-auto">
      <div className="mb-9">
        <BillingPeriodToggle period={period} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[var(--rule)] border border-[var(--rule)]">
        {tiers.map((tier) => (
          <TierCard
            key={tier.id}
            tier={tier}
            nextParam={nextParam}
            period={period}
          />
        ))}
      </div>
      <p className="mt-10 text-[14px] text-slate-body text-center leading-relaxed">
        All tiers include multi-location posting, Practice Fit, candidate
        dashboards, and Stripe-secured billing.{" "}
        <strong className="text-ink font-bold">
          No per-listing fees. No placement fees. Ever.
        </strong>
      </p>
    </section>
  );
}

function TierCard({
  tier,
  nextParam,
  period,
}: {
  tier: TierConfig;
  nextParam: string | null;
  period: BillingPeriod;
}) {
  const isFeatured = tier.badge === "Most popular";
  const isAnnual = period === "annual";
  const headlinePrice = isAnnual ? tier.annualMonthlyEquivalent : tier.monthlyPrice;
  const ctaLabel: Record<PricingTier, string> = {
    solo: "Start with Solo",
    growth: "Choose Growth",
    scale: "Choose Scale",
    enterprise: "Contact Sales",
  };
  const monthlyDescriptor: Record<PricingTier, string> = {
    solo: "For single & small group practices",
    growth: "Most chosen for growing groups",
    scale: "Unlimited listings + per-location analytics",
    enterprise: "Account management included",
  };
  const params = new URLSearchParams({ tier: tier.id });
  if (period === "annual") params.set("period", "annual");
  if (nextParam) params.set("next", nextParam);
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
          ${headlinePrice.toLocaleString()}
        </div>
        <div
          className={`text-[14px] font-medium ${
            isFeatured ? "text-ivory/70" : "text-slate-body"
          }`}
        >
          / month
        </div>
      </div>
      <div
        className={`text-[12px] tracking-[0.4px] mb-7 min-h-[32px] leading-[1.45] ${
          isFeatured ? "text-ivory/55" : "text-slate-meta"
        }`}
      >
        {isAnnual
          ? `Billed annually · $${tier.annualPrice.toLocaleString()}/yr`
          : monthlyDescriptor[tier.id]}
      </div>

      <Link
        href={`/employer/sign-up?${params.toString()}`}
        className={`block text-center px-4 py-3.5 text-[12px] font-bold tracking-[1.5px] uppercase mb-6 transition-colors border ${
          isFeatured
            ? "bg-heritage text-ivory border-heritage hover:bg-heritage-deep hover:border-heritage-deep"
            : "bg-ivory text-ink border-[var(--rule-strong)] hover:bg-ink hover:text-ivory hover:border-ink"
        }`}
      >
        {ctaLabel[tier.id]}
      </Link>

      <ul
        className={`list-none border-t pt-4 ${
          isFeatured ? "border-white/15" : "border-[var(--rule)]"
        }`}
      >
        {tier.features.map((feature, i) => (
          <li
            key={i}
            className={`text-[13.5px] py-1.5 flex items-start gap-2 leading-snug ${
              isFeatured ? "text-ivory/90" : "text-ink"
            }`}
          >
            <span
              aria-hidden="true"
              className="font-extrabold flex-shrink-0 text-heritage-light"
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

/**
 * Tier-feature matrix re-laddered 2026-05-20 for the Solo / Growth / Scale /
 * Enterprise repositioning. Governing decisions:
 *   - Capacity: Solo 5 listings · 3 seats; Growth 20 · 10; Scale & Enterprise
 *     unlimited · unlimited. Hiring managers + applications stay uncapped.
 *   - Practice Fit + AI candidate matching ship at Solo and up (the
 *     differentiator is visible to every paying customer).
 *   - Pipeline depth (cross-job inbox, license tracking, funnel reports,
 *     rejection suggester, priority support) starts at Growth.
 *   - Per-location analytics start at Scale.
 *   - Governance / security (audit log, SSO, SOC 2, BAA, CSM, SLA) is Enterprise.
 *   - CE tracking is universally free for candidates. Annual DSO Hiring Report
 *     is fully public from launch.
 *
 * Soft-label values ("H2 2026", "Phase 6+", "Public", "Candidate-side") render
 * de-emphasized vs. capacity values — see MatrixGroupBlock cell renderer.
 */
const COMPARE_GROUPS: MatrixGroup[] = [
  {
    label: "Capacity",
    rows: [
      {
        feature: "Active job listings",
        values: { solo: "Up to 5", growth: "Up to 20", scale: "Unlimited", enterprise: "Unlimited" },
      },
      {
        feature: "Practice locations covered",
        values: { solo: "All", growth: "All", scale: "All", enterprise: "All" },
      },
      {
        feature: "Team members (admin seats)",
        values: { solo: "Up to 3", growth: "Up to 10", scale: "Unlimited", enterprise: "Unlimited" },
      },
      {
        feature: "Hiring managers (per-location, scoped)",
        values: { solo: "Unlimited", growth: "Unlimited", scale: "Unlimited", enterprise: "Unlimited" },
      },
      {
        feature: "Applications received",
        values: { solo: "Uncapped", growth: "Uncapped", scale: "Uncapped", enterprise: "Uncapped" },
      },
    ],
  },
  {
    label: "Hiring workflow",
    rows: [
      {
        feature: "Multi-location posting in one flow",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Custom screening questions per job",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Curated dental screening Q library by role",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "List view of applications + filters + tags",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Kanban / pipeline view",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Bulk actions on applications",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Internal team comments + @mentions",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Candidate scorecards (dental rubrics)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Cross-job application inbox",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Custom approval chains by role/location",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "Interview scheduling",
    rows: [
      {
        feature: "Calendar integration (Google + Outlook)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Self-serve candidate booking link",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Panel scheduling (multi-interviewer)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "AI scheduling agent (best-slot)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "Verification & credentialing",
    rows: [
      {
        feature: "License requirements + attestation tracking",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "License expiration alerts (60-day)",
        values: { solo: false, growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Background check integration (Checkr)",
        values: { solo: false, growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Drug screen integration",
        values: { solo: false, growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "State board license verification",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
      {
        feature: "Malpractice insurance tracking",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
      {
        feature: "CE compliance reporting (employer-side)",
        values: { solo: false, growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "Communication & offers",
    rows: [
      {
        feature: "Templated email replies + auto-reply on apply",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Custom email templates",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Two-way SMS to candidates",
        values: { solo: "H2 2026", growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Offer letter templates + e-signature",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Custom approval chain for offers",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "Branding & distribution",
    rows: [
      {
        feature: "Branded company page (logo + colors + locations)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Map view of locations (privacy-aware)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Google for Jobs schema",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Photos / leadership bios",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Indeed / LinkedIn / Facebook cross-post",
        values: { solo: "H2 2026", growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Custom domain (careers.yourdso.com)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Multi-brand support (parent + sub-brands)",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "Analytics & insights",
    rows: [
      {
        feature: "Per-job views / applies / conversion",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Source attribution per candidate",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Funnel report by stage + time-to-fill",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Per-location dashboards",
        values: { solo: false, growth: false, scale: true, enterprise: true },
      },
      {
        feature: "Cross-location benchmarking",
        values: { solo: false, growth: false, scale: true, enterprise: true },
      },
      {
        feature: "Anonymized salary benchmarks (per role/state)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Custom report builder + exports",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "AI / automation",
    rows: [
      {
        feature: "AI Job Description generator (dental-context)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Practice Fit — AI candidate match-to-job",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Practice Fit Score (1–100)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "AI rejection-reason suggester",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "AI Interview Assistant (record + summarize)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Voice-memo screener answers (novel)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Agentic sourcing copilot",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "Integrations",
    rows: [
      {
        feature: "Zapier / Make webhooks",
        values: { solo: "H2 2026", growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Slack / Teams notifications",
        values: { solo: false, growth: "H2 2026", scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "HRIS handoff (Gusto / Rippling / BambooHR / Workday)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "REST API access",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
      {
        feature: "Practice management software integration",
        values: { solo: false, growth: false, scale: false, enterprise: "Phase 6+" },
      },
    ],
  },
  {
    label: "Compliance & security",
    rows: [
      {
        feature: "EEO self-ID (optional, candidate-side)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "OFCCP / EEOC aggregate exports",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "GDPR / CCPA tooling",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Two-factor authentication",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Role-based access control (custom roles)",
        values: { solo: false, growth: false, scale: "H2 2026", enterprise: "H2 2026" },
      },
      {
        feature: "Audit log",
        values: { solo: false, growth: false, scale: false, enterprise: true },
      },
      {
        feature: "SSO / SAML",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
      {
        feature: "SOC 2 Type II",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
      {
        feature: "BAA-readiness (HIPAA-aware)",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
    ],
  },
  {
    label: "Industry-specific",
    rows: [
      {
        feature: "Dental role taxonomy + DSO-aware filters",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "DSO Hire employer profile badge",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Annual DSO Hiring Report",
        values: { solo: "Public", growth: "Public", scale: "Public", enterprise: "Public" },
      },
      {
        feature: "CE credit tracking (free for all candidates)",
        values: { solo: "Candidate-side", growth: "Candidate-side", scale: "Candidate-side", enterprise: "Candidate-side" },
      },
    ],
  },
  {
    label: "Support",
    rows: [
      {
        feature: "Email support",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Priority support response",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "Dedicated CSM",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
      {
        feature: "SLA with response-time guarantees",
        values: { solo: false, growth: false, scale: false, enterprise: "H2 2026" },
      },
    ],
  },
];

function CompareMatrix({
  tiers,
  period,
}: {
  tiers: TierConfig[];
  period: BillingPeriod;
}) {
  const isAnnual = period === "annual";
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
        <p className="text-[13px] text-slate-meta mb-5 max-w-[680px] leading-relaxed">
          <strong className="text-ink font-semibold">Reading this matrix:</strong>{" "}
          checkmarks = available today. <span className="font-bold tracking-[1px] uppercase text-[10px]">H2 2026</span> =
          on the active roadmap, ships across the second half of 2026.{" "}
          <span className="font-bold tracking-[1px] uppercase text-[10px]">Phase 6+</span> =
          on the longer-term roadmap, scheduled after first $5K MRR. We commit to
          features publicly so prospects see the platform&apos;s shape, not just
          its current state.
        </p>
        <table className="w-full min-w-[1040px] border-collapse">
          {/* ── Branded navy header row — sticks below the 80px nav on scroll ── */}
          <thead className="sticky top-[80px] z-20 shadow-[0_4px_12px_-8px_rgba(7,15,28,0.25)]">
            <tr className="bg-ink">
              <th className="text-left text-[10px] font-bold tracking-[2.5px] uppercase text-ivory/60 py-6 pl-5 pr-6 align-bottom rounded-tl-sm">
                Feature
              </th>
              {tiers.map((tier, idx) => {
                const isFeatured = tier.badge === "Most popular";
                const isLast = idx === tiers.length - 1;
                const headlinePrice = isAnnual
                  ? tier.annualMonthlyEquivalent
                  : tier.monthlyPrice;
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
                    <div className="text-[13px] font-semibold text-ivory/55">
                      ${headlinePrice.toLocaleString()}/mo
                    </div>
                    {isAnnual && (
                      <div className="text-[10px] font-bold tracking-[1px] uppercase text-ivory/40 mt-0.5">
                        billed annually
                      </div>
                    )}
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
          <td className="text-[14.5px] text-ink py-4 pl-5 pr-6 leading-snug font-medium">
            {row.feature}
          </td>
          {tiers.map((tier) => {
            const value = row.values[tier.id];
            const isFeatured = tier.badge === "Most popular";
            // Soft labels = roadmap markers ("H2 2026", "Phase 6+") and modality
            // labels ("Public", "Candidate-side") that aren't capacity values and
            // shouldn't compete visually with the "Up to 5" / "Unlimited" cells.
            const isSoftLabel =
              typeof value === "string" &&
              /^(H[12] 20\d{2}|Phase \d|Public|Candidate-side|Coming)/.test(value);
            return (
              <td
                key={tier.id}
                className={`text-[14px] py-4 px-4 align-middle ${
                  isFeatured
                    ? "bg-ink border-l-2 border-r-2 border-heritage"
                    : ""
                }`}
              >
                {typeof value === "boolean" ? (
                  value ? (
                    <>
                      <Check
                        aria-hidden="true"
                        className={`h-4 w-4 ${
                          isFeatured ? "text-ivory" : "text-heritage"
                        }`}
                        strokeWidth={3}
                      />
                      <span className="sr-only">Included</span>
                    </>
                  ) : (
                    <span
                      className={`text-[18px] leading-none font-light ${
                        isFeatured ? "text-ivory/30" : "text-slate-meta/30"
                      }`}
                    >
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Not included</span>
                    </span>
                  )
                ) : isSoftLabel ? (
                  <span
                    className={`text-[10px] font-bold tracking-[1.5px] uppercase whitespace-nowrap ${
                      isFeatured ? "text-ivory/55" : "text-slate-meta"
                    }`}
                  >
                    {value}
                  </span>
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
    q: "How does annual billing work?",
    a: "Switch the toggle to Annual and you're billed once a year at roughly 10% off the monthly rate — about a month and a half free. You can start monthly and move to annual (or back) anytime from your billing settings.",
  },
  {
    q: "Can I change tiers later?",
    a: "Yes. Upgrade or downgrade anytime from your billing settings. Stripe handles prorated billing automatically.",
  },
  {
    q: "Are there per-listing or placement fees on top of the subscription?",
    a: "No. The subscription is the entire cost — we never charge per listing, and we never take a cut of placements. Active-listing counts are tier-based (Solo: up to 5; Growth: up to 20; Scale and Enterprise: unlimited).",
  },
  {
    q: "What payment methods do you accept?",
    a: "All major credit cards, plus ACH for Enterprise customers. Billing is monthly or annual with automatic renewal.",
  },
  {
    q: "Do you support invoicing for Enterprise customers?",
    a: `Yes. Enterprise tier includes invoicing on net-30 terms. Reach out via ${SALES_EMAIL} to set up your invoicing profile.`,
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel from your billing portal — you'll retain access through the end of your current billing period, and you won't be charged again.",
  },
  {
    q: "Is there a free trial?",
    a: "Not currently. We hold pricing transparent and flat — no trial, but you can cancel anytime from your billing portal with no penalty.",
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

function FinalCta({ nextParam }: { nextParam: string | null }) {
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
            href={
              nextParam
                ? `/employer/sign-up?next=${encodeURIComponent(nextParam)}`
                : "/employer/sign-up"
            }
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
          >
            Sign Up
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center px-9 py-[15px] border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[2px] uppercase hover:border-ink transition-colors"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </section>
  );
}
