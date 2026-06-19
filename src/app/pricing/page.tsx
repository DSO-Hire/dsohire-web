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
import { ArrowRight } from "lucide-react";
import {
  getAllTiers,
  isBillingPeriod,
  type TierConfig,
  type PricingTier,
  type BillingPeriod,
} from "@/lib/stripe/prices";
import { BillingPeriodToggle } from "./billing-period-toggle";
import { PlanFinder } from "./plan-finder";
import { CompareMatrixAccordion } from "./compare-matrix-accordion";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { MotionMount } from "@/components/marketing/motion";
import { RoiCalculator } from "@/components/marketing/roi-calculator";
import { SALES_EMAIL } from "@/lib/contact";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
  // Default to annual — retention-first. Monthly stays one toggle-click away.
  const period: BillingPeriod = isBillingPeriod(sp.period) ? sp.period : "annual";
  // Is this an already-authenticated employer who still needs a plan? If so,
  // the tier card they click *is* their choice — route it straight into
  // checkout instead of bouncing them back through the sign-up funnel. We only
  // do this when they have no live subscription, so we never push an active
  // customer into a second checkout (tier changes on an active plan run through
  // the billing portal).
  const authedNeedsCheckout = await employerNeedsCheckout();
  return (
    <div>
      {/* #115 FOH-1 — /pricing doesn't use SiteShell (own minimal nav), so
          the reveal observer must mount here explicitly. Without it,
          [data-reveal] content stays hidden (the Day-31 "gray slab" bug). */}
      <MotionMount />
      <PricingHero />
      {/* #115 FOH-5 — lead with outcomes, not capacity: the visitor's own
          agency math vs our flat fee, before the tier cards. */}
      <RoiCalculator
        tiers={tiers.map((t) => ({
          id: t.id,
          name: t.name,
          annualMonthly: t.annualMonthlyEquivalent,
        }))}
      />
      <TierGrid
        tiers={tiers}
        nextParam={nextParam}
        period={period}
        authedNeedsCheckout={authedNeedsCheckout}
      />
      {/* #115 Model 03 (Day 32) — 3-tap honest tier recommender, parked
          between the cards and the full matrix to catch comparison paralysis. */}
      <PlanFinder />
      <CompareMatrix tiers={tiers} period={period} />
      <FAQ />
      <FinalCta nextParam={nextParam} />
    </div>
  );
}

/**
 * True when the visitor is a signed-in employer (has a dso_users row) who does
 * not yet have a live subscription — i.e. someone who should land in checkout,
 * not the sign-up form, when they pick a tier. Anonymous visitors short-circuit
 * on the cookie check (no DB round-trip).
 */
async function employerNeedsCheckout(): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return false;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  // No subscription at all, or one that never finished checkout, means they
  // still need to pick + pay.
  return !sub || (sub.status as string) === "incomplete";
}

/* ───────── Hero ───────── */

function PricingHero() {
  return (
    <section className="pt-[120px] pb-12 px-6 sm:px-14 max-w-[1240px] mx-auto">
      <div data-reveal className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Pricing
      </div>
      <h1
        data-reveal
        style={{ "--mk-delay": "70ms" } as React.CSSProperties}
        className="text-4xl sm:text-6xl font-extrabold tracking-[-2px] leading-[1.05] text-ink mb-5 max-w-[820px]"
      >
        One flat fee. Sized to your footprint.
      </h1>
      <p
        data-reveal
        style={{ "--mk-delay": "140ms" } as React.CSSProperties}
        className="text-lg text-slate-body leading-[1.7] max-w-[640px]"
      >
        Pick the tier that matches your footprint. Every tier includes
        multi-location posting and PracticeFit. Cancel or change tiers anytime.
      </p>
    </section>
  );
}

/* ───────── Tier grid ─────────
 *
 * 2026-05-26 — Restructured per Cam direction (mom walkthrough). Solo and the
 * DSO tiers serve two different audiences (owner-operator dentists vs.
 * scaling dental groups); rendering them side-by-side in a 4-up confused both.
 * Solo now sits in its own standout section above, with explicit audience
 * framing, and Growth / Scale / Enterprise live as a 3-up DSO grid below.
 * The compare matrix downstream still shows all four columns for full
 * apples-to-apples comparison.
 */

function TierGrid({
  tiers,
  nextParam,
  period,
  authedNeedsCheckout,
}: {
  tiers: TierConfig[];
  nextParam: string | null;
  period: BillingPeriod;
  authedNeedsCheckout: boolean;
}) {
  const soloTier = tiers.find((t) => t.id === "solo");
  const dsoTiers = tiers.filter((t) => t.id !== "solo");
  return (
    <section id="tiers" className="px-6 sm:px-14 max-w-[1240px] mx-auto scroll-mt-[100px]">
      {/* ── Solo standout (audience = multi-location owner-operator) ── */}
      {soloTier && (
        <div className="mb-14">
          <div className="text-center max-w-[680px] mx-auto mb-7">
            <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
              Multi-location owner-operator?
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink leading-[1.15] mb-3">
              Solo — for groups of 2 to 5 locations.
            </h2>
            <p className="text-[15px] text-slate-body leading-[1.65]">
              If you&apos;re running multiple practices under one ownership,
              Solo gives you the full hiring platform at owner pricing. DSO
              Hire is built for multi-location operators — single-practice
              dentists won&apos;t get full value from the multi-location
              backbone yet, but the door&apos;s open whenever you grow.
            </p>
          </div>
          {/* Period toggle sits directly above the Solo card so it controls
              the price the visitor is staring at without scrolling. */}
          <div className="flex justify-center mb-6">
            <BillingPeriodToggle period={period} />
          </div>
          <SoloStandoutCard
            tier={soloTier}
            nextParam={nextParam}
            period={period}
            authedNeedsCheckout={authedNeedsCheckout}
          />
        </div>
      )}

      {/* ── DSO 3-up (audience = multi-practice dental groups / DSOs) ── */}
      <div className="pt-12 border-t border-[var(--rule)]">
        <div className="text-center max-w-[640px] mx-auto mb-7">
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-3">
            Scaling beyond a few practices?
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-[-0.8px] text-ink leading-[1.15] mb-3">
            Pick the tier that matches your footprint.
          </h2>
          <p className="text-[15px] text-slate-body leading-[1.65]">
            Growth, Scale, and Enterprise unlock deeper pipeline tooling,
            per-location analytics, and governance the bigger you get. Cancel
            or change tiers anytime.
          </p>
        </div>
        {/* Second period toggle — also controls ?period= URL param, so the
            user's choice persists whether they clicked it above Solo or here. */}
        <div className="flex justify-center mb-6">
          <BillingPeriodToggle period={period} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {dsoTiers.map((tier, i) => (
            <div
              key={tier.id}
              data-reveal
              style={{ "--mk-delay": `${i * 90}ms` } as React.CSSProperties}
              className="flex"
            >
              <TierCard
                tier={tier}
                nextParam={nextParam}
                period={period}
                authedNeedsCheckout={authedNeedsCheckout}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="mt-10 text-[14px] text-slate-body text-center leading-relaxed">
        Every tier includes multi-location posting, PracticeFit, candidate
        dashboards, and Stripe-secured billing.{" "}
        <strong className="text-ink font-bold">
          No per-listing fees. No placement fees. Ever.
        </strong>
      </p>
      {/* #115 Model 03 — caps honesty as a trust signal, not fine print. */}
      <p className="mt-3 text-center">
        <span
          className="inline-flex items-center gap-2 px-3.5 py-1.5 text-[10px] font-bold tracking-[1.4px] uppercase text-heritage-deep border border-heritage/30"
          style={{ background: "var(--heritage-tint)" }}
        >
          Every cap shown is the enforced cap — what we advertise is what the
          code allows
        </span>
      </p>
    </section>
  );
}

/**
 * Solo-tier standout card — wider, framed differently from the 3-up DSO grid
 * so the solo-dentist audience reads it as their card, not a downscale DSO
 * option. Two-column on lg+ (audience/price on left, features on right),
 * stacks on mobile. Reuses the same checkout/sign-up routing logic as TierCard.
 */
function SoloStandoutCard({
  tier,
  nextParam,
  period,
  authedNeedsCheckout,
}: {
  tier: TierConfig;
  nextParam: string | null;
  period: BillingPeriod;
  authedNeedsCheckout: boolean;
}) {
  const isAnnual = period === "annual";
  const headlinePrice = isAnnual
    ? tier.annualMonthlyEquivalent
    : tier.monthlyPrice;
  const params = new URLSearchParams({ tier: tier.id, period });
  if (nextParam) params.set("next", nextParam);
  const ctaHref = authedNeedsCheckout
    ? `/employer/checkout?${params.toString()}`
    : `/employer/sign-up?${params.toString()}`;
  return (
    <div className="max-w-[920px] mx-auto border-2 border-heritage/40 bg-card shadow-[0_4px_24px_-12px_rgba(7,15,28,0.12)]">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        {/* ── Left: tier name + price + CTA on heritage-tinted band ──
            Heritage-green tint (8% opacity) per Cam direction 2026-05-26 —
            visually distinguishes Solo from the navy-featured DSO tier below
            without competing with it. */}
        <div className="bg-heritage/[0.08] p-9 flex flex-col">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            {tier.name}
          </div>
          <div className="text-[14px] text-slate-body mb-7 leading-snug">
            {tier.tagline}
          </div>
          <div className="flex items-baseline gap-1.5 mb-1.5">
            <div className="text-[44px] font-extrabold tracking-[-1.5px] leading-none text-ink">
              ${headlinePrice.toLocaleString()}
            </div>
            <div className="text-[14px] font-medium text-slate-body">
              / month
            </div>
          </div>
          <div className="text-[12px] tracking-[0.4px] mb-7 leading-[1.45] text-slate-meta min-h-[18px]">
            {isAnnual
              ? `Billed annually · $${tier.annualPrice.toLocaleString()}/yr`
              : "Billed monthly · cancel anytime"}
          </div>
          <Link
            href={ctaHref}
            className="block text-center px-4 py-3.5 text-[12px] font-bold tracking-[1.5px] uppercase bg-primary text-primary-foreground border border-primary hover:bg-heritage hover:border-heritage transition-colors"
          >
            Start with Solo
          </Link>
          <p className="mt-4 text-[11.5px] text-slate-meta leading-relaxed">
            Up to 5 active listings · 3 admin seats · unlimited hiring
            managers and applications.
          </p>
        </div>

        {/* ── Right: feature list ── */}
        <div className="p-9 lg:border-l border-[var(--rule)]">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-slate-body mb-4">
            What&apos;s included
          </div>
          <ul className="list-none grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {tier.features.map((feature, i) => (
              <li
                key={i}
                className="text-[13.5px] text-ink py-1 flex items-start gap-2 leading-snug"
              >
                <span
                  aria-hidden="true"
                  className="font-extrabold flex-shrink-0 text-heritage"
                >
                  ✓
                </span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TierCard({
  tier,
  nextParam,
  period,
  authedNeedsCheckout,
}: {
  tier: TierConfig;
  nextParam: string | null;
  period: BillingPeriod;
  authedNeedsCheckout: boolean;
}) {
  const isFeatured = tier.badge === "Most popular";
  const isAnnual = period === "annual";
  const headlinePrice = isAnnual ? tier.annualMonthlyEquivalent : tier.monthlyPrice;
  // 2026-05-26 — CTA verbs scale energy with the tier (start → step → power →
  // build). Enterprise reads as design-your-own rather than transactional
  // "Contact Sales", which felt like a deflection. Solo's stays "Start with"
  // since it's the literal entry point.
  const ctaLabel: Record<PricingTier, string> = {
    solo: "Start with Solo",
    growth: "Step up to Growth",
    scale: "Power up with Scale",
    enterprise: "Build your Enterprise",
  };
  const monthlyDescriptor: Record<PricingTier, string> = {
    solo: "For privately-owned 2–5 location groups",
    growth: "Most chosen for growing groups",
    scale: "Unlimited listings + per-location analytics",
    enterprise: "Account management included",
  };
  // Always carry the explicit period so the user's choice survives into
  // sign-up/checkout regardless of those pages' own defaults.
  const params = new URLSearchParams({ tier: tier.id, period });
  if (nextParam) params.set("next", nextParam);
  // A signed-in employer without a live plan goes straight to checkout with the
  // tier they just clicked — that click is the choice. New visitors keep the
  // sign-up funnel (they need an account first).
  const ctaHref = authedNeedsCheckout
    ? `/employer/checkout?${params.toString()}`
    : `/employer/sign-up?${params.toString()}`;
  return (
    <div
      className={`relative p-9 flex flex-col flex-1 w-full motion-safe:transition-all motion-safe:duration-200 ${
        isFeatured
          ? "bg-hero text-hero-foreground"
          : "bg-card text-ink motion-safe:hover:-translate-y-1 hover:shadow-[0_12px_28px_-14px_rgba(7,15,28,0.18)] hover:bg-cream/30"
      }`}
    >
      {/* Floats above the card top edge — doesn't push content down, so all
          four cards stay aligned at the eyebrow row. */}
      {isFeatured && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-heritage text-primary-foreground text-[9px] font-bold tracking-[2px] uppercase whitespace-nowrap z-10">
          Most Popular
        </div>
      )}

      <div
        className={`text-2xl font-extrabold tracking-[-0.6px] mb-2 ${
          isFeatured ? "text-hero-foreground" : "text-ink"
        }`}
      >
        {tier.name}
      </div>
      <div
        className={`text-xs mb-6 min-h-[34px] leading-snug ${
          isFeatured ? "text-hero-foreground/70" : "text-slate-body"
        }`}
      >
        {tier.tagline}
      </div>

      <div className="flex items-baseline gap-1.5 mb-1.5">
        <div
          className={`text-[40px] font-extrabold tracking-[-1.5px] leading-none ${
            isFeatured ? "text-hero-foreground" : "text-ink"
          }`}
        >
          ${headlinePrice.toLocaleString()}
        </div>
        <div
          className={`text-[14px] font-medium ${
            isFeatured ? "text-hero-foreground/70" : "text-slate-body"
          }`}
        >
          / month
        </div>
      </div>
      <div
        className={`text-[12px] tracking-[0.4px] mb-7 min-h-[32px] leading-[1.45] ${
          isFeatured ? "text-hero-foreground/55" : "text-slate-meta"
        }`}
      >
        {isAnnual
          ? `Billed annually · $${tier.annualPrice.toLocaleString()}/yr`
          : monthlyDescriptor[tier.id]}
      </div>

      <Link
        href={ctaHref}
        className={`block text-center px-4 py-3.5 text-[12px] font-bold tracking-[1.5px] uppercase mb-6 transition-colors border ${
          isFeatured
            ? "bg-heritage text-primary-foreground border-heritage hover:bg-heritage-deep hover:border-heritage-deep"
            : "bg-ivory text-ink border-[var(--rule-strong)] hover:bg-primary hover:text-primary-foreground hover:border-primary"
        }`}
      >
        {ctaLabel[tier.id]}
      </Link>

      <ul
        className={`list-none border-t pt-4 ${
          isFeatured ? "border-hero-foreground/15" : "border-[var(--rule)]"
        }`}
      >
        {tier.features.map((feature, i) => (
          <li
            key={i}
            className={`text-[13.5px] py-1.5 flex items-start gap-2 leading-snug ${
              isFeatured ? "text-hero-foreground/90" : "text-ink"
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
 *   - PracticeFit + AI candidate matching ship at Solo and up (the
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
        // #88 — these two rows mirror the ENFORCED caps in lib/billing/caps.ts
        // (advertised cap = enforced cap, locked rule). Keep in sync.
        feature: "Active job openings",
        values: { solo: "Up to 5", growth: "Up to 20", scale: "Up to 100", enterprise: "Unlimited" },
      },
      {
        feature: "Practice locations covered",
        values: { solo: "All", growth: "All", scale: "All", enterprise: "All" },
      },
      {
        feature: "Team members (admin seats)",
        values: { solo: "Up to 5", growth: "Up to 15", scale: "Up to 50", enterprise: "Unlimited" },
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
        // N12 Phase 2 shipped 2026-06-03: pending-offer queue, owner/admin
        // sign-off, out-of-range + above-ceiling routing, per-teammate grants.
        feature: "Offer approval chains + comp guardrails",
        values: { solo: false, growth: false, scale: true, enterprise: true },
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
        feature: "PracticeFit — AI candidate match-to-job",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "PracticeFit Score (1–100)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        // DSOFit shipped 2026-06-09 — corporate-side sibling of PracticeFit.
        feature: "DSOFit — corporate-role fit scoring (finance, ops, HR, IT)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
      },
      {
        feature: "AI rejection-reason suggester",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        // N13 shipped 2026-06-02 (Scale+): triggers → conditions → actions.
        feature: "Automation rules (if-this-then-that on your pipeline)",
        values: { solo: false, growth: false, scale: true, enterprise: true },
      },
      {
        // N16 v2 shipped 2026-06-03 (Scale+): multi-step nurture sequences.
        feature: "Drip sequences (multi-step candidate nurture)",
        values: { solo: false, growth: false, scale: true, enterprise: true },
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
        // #83 shipped 2026-06-10: per-teammate capability editor (Growth+);
        // role presets enforce on every tier.
        feature: "Per-teammate permissions (Dentrix-style overrides)",
        values: { solo: false, growth: true, scale: true, enterprise: true },
      },
      {
        // #83 Phase 4 shipped 2026-06-10 — no tier gate.
        feature: "Confidential searches (restrict a posting to named teammates)",
        values: { solo: true, growth: true, scale: true, enterprise: true },
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
        // Tier 2 in-app AI support shipped 2026-05-27 — answers from the
        // DSO's live data with read-only tools. No tier gate.
        feature: "In-app AI assistant (answers from your live account data)",
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

  // #115 Model 03 (Day 32) — roadmap-row consolidation (the queued
  // "roadmap-row consolidation" pass): any row that isn't live for ANY
  // tier moves out of its category into one honest "On the roadmap" band
  // at the bottom, keeping its category as a suffix. Mixed rows (live for
  // some tiers, roadmapped for others) stay put — they're real today.
  // COMPARE_GROUPS stays the single source of truth.
  const ROADMAP_VALUES = new Set(["H2 2026", "Phase 6+"]);
  const isRoadmapOnly = (row: MatrixRow) =>
    Object.values(row.values).every(
      (v) => v === false || (typeof v === "string" && ROADMAP_VALUES.has(v))
    );
  const movedRows: MatrixRow[] = [];
  const currentGroups = COMPARE_GROUPS.map((g) => ({
    ...g,
    rows: g.rows.filter((row) => {
      if (isRoadmapOnly(row)) {
        movedRows.push({ ...row, feature: `${row.feature} · ${g.label}` });
        return false;
      }
      return true;
    }),
  })).filter((g) => g.rows.length > 0);
  const renderGroups: MatrixGroup[] = movedRows.length
    ? [
        ...currentGroups,
        { label: "On the roadmap — committed, not yet shipped", rows: movedRows },
      ]
    : currentGroups;

  return (
    <section className="px-6 sm:px-14 pt-28 pb-20 max-w-[1240px] mx-auto">
      <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3.5">
        Side By Side
      </div>
      <h2 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.6px] leading-[1.1] text-ink max-w-[720px] mb-12">
        What you get at each tier.
      </h2>

      {/* Model-03 accordion (Day 32 v2 — Cam's call): collapsible category
          bands w/ per-tier coverage chips replace the flat ~60-row table.
          The consolidation above still runs server-side; the client
          component only owns open/close state. */}
      <div className="-mx-6 sm:-mx-14 px-6 sm:px-14 overflow-x-auto lg:overflow-visible">
        <p className="text-[13px] text-slate-meta mb-5 max-w-[680px] leading-relaxed">
          <strong className="text-ink font-semibold">Reading this matrix:</strong>{" "}
          expand a category — the chips on each band show how much of it a
          tier includes before you open it. Checkmarks = available today, and
          every capacity number is code-enforced. Anything not yet live for
          any tier sits in the final{" "}
          <span className="font-bold tracking-[1px] uppercase text-[10px]">On the roadmap</span>{" "}
          band — labeled <span className="font-bold tracking-[1px] uppercase text-[10px]">H2 2026</span>{" "}
          (active roadmap) or <span className="font-bold tracking-[1px] uppercase text-[10px]">Phase 6+</span>{" "}
          (longer-term). We commit to features publicly so prospects see the
          platform&apos;s shape — and nothing roadmapped masquerades as shipped.
        </p>
        <CompareMatrixAccordion
          groups={renderGroups}
          tiers={tiers.map((tier) => {
            const headlinePrice = isAnnual
              ? tier.annualMonthlyEquivalent
              : tier.monthlyPrice;
            return {
              id: tier.id,
              name: tier.name,
              featured: tier.badge === "Most popular",
              priceLine: `$${headlinePrice.toLocaleString()}/mo`,
              subLine: isAnnual ? "billed annually" : null,
            };
          })}
        />
      </div>
    </section>
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
            className="inline-flex items-center gap-2.5 px-9 py-4 bg-primary text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors"
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
