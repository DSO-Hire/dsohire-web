/**
 * Stripe pricing config — single source of truth for tier prices, IDs,
 * billing periods, and tier helpers across the app.
 *
 * Public ladder (locked 2026-05-20, repositioning): Solo / Growth / Scale /
 * Enterprise. Replaces the prior Starter / Growth / Enterprise ladder.
 *
 *   Solo        $399/mo   ($359/mo billed annually)  — 5 listings · 3 seats
 *   Growth      $699/mo   ($629/mo billed annually)  — 20 listings · 10 seats   [most popular]
 *   Scale       $1,499/mo ($1,349/mo billed annually)— unlimited · unlimited
 *   Enterprise  $2,999/mo ($2,699/mo billed annually)— unlimited · unlimited
 *
 * Annual plans are billed yearly at ~10% off the monthly rate.
 *
 * Practice Fit + AI candidate matching now ship at Solo and up (moved down
 * from the old Growth gate) — the differentiator should be visible to every
 * paying customer. Pipeline depth (cross-job inbox, license tracking, funnel
 * reports, rejection suggester, custom email templates, priority support)
 * starts at Growth. Per-location analytics start at Scale. Governance /
 * security (audit log, SSO, SOC 2, BAA, CSM, SLA) is Enterprise.
 *
 * Charter Customer Program (non-advertised, back-pocket) layers a CHARTER20 /
 * CHARTER15 coupon on top of any tier purchase — see
 * `Business Plan & Strategy/Pricing_Repositioning_Memo.md`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * STRIPE PRICE IDs — ACTION REQUIRED
 * ─────────────────────────────────────────────────────────────────────────
 * The amounts below changed, so the old test-mode Price IDs are stale (Stripe
 * prices are immutable — a new amount requires a new Price object). Eight new
 * test-mode prices must be created in the Stripe dashboard (4 tiers × monthly
 * + annual) and pasted into the *_REPLACE placeholders below. Until then,
 * /pricing renders correctly (display reads the amounts, not the IDs) but
 * Checkout will error. Live IDs get added at soft-launch (set STRIPE_LIVE_MODE
 * = "1" in Vercel Production once populated).
 */

export type PricingTier = "solo" | "growth" | "scale" | "enterprise";
export type BillingPeriod = "monthly" | "annual";

export interface TierConfig {
  id: PricingTier;
  name: string;
  tagline: string;
  description: string;
  /** Monthly plan, billed monthly. */
  monthlyPrice: number; // dollars (display)
  monthlyPriceCents: number; // cents (Stripe arithmetic)
  /** Annual plan, billed yearly (~10% off). */
  annualPrice: number; // yearly total, dollars (display)
  annualPriceCents: number; // yearly total, cents (Stripe arithmetic)
  /** Per-month equivalent of the annual plan, for the toggle's headline price. */
  annualMonthlyEquivalent: number; // dollars
  features: string[];
  /** Stripe Price IDs — test mode for now; live IDs added at soft launch. */
  stripePriceIdTest: string; // monthly
  stripePriceIdTestAnnual: string; // annual
  stripePriceIdLive?: string; // monthly
  stripePriceIdLiveAnnual?: string; // annual
  /** Stripe Product IDs — kept for metadata lookups and admin tooling. */
  stripeProductIdTest?: string;
  badge?: string;
}

export const PRICING_TIERS: Record<PricingTier, TierConfig> = {
  solo: {
    id: "solo",
    name: "Solo",
    tagline: "Single practices & small dental groups",
    description: "Single-location practices and small groups, up to 5 active listings",
    monthlyPrice: 399,
    monthlyPriceCents: 39900,
    annualPrice: 4308,
    annualPriceCents: 430800,
    annualMonthlyEquivalent: 359,
    features: [
      "Up to 5 active listings · 3 admin seats",
      "Multi-location posting in a single flow",
      "Practice Fit + AI candidate matching",
      "AI Job Description generator (dental-context)",
      "Branded company page + map view",
    ],
    stripePriceIdTest: "price_test_solo_monthly_REPLACE",
    stripePriceIdTestAnnual: "price_test_solo_annual_REPLACE",
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "Growing DSOs & dental groups",
    description: "Growing dental groups with up to 20 active listings and the full hiring platform",
    monthlyPrice: 699,
    monthlyPriceCents: 69900,
    annualPrice: 7548,
    annualPriceCents: 754800,
    annualMonthlyEquivalent: 629,
    features: [
      "Up to 20 active listings · 10 admin seats",
      "Everything in Solo, plus:",
      "Cross-job application inbox",
      "License requirements + attestation tracking",
      "Funnel reports + AI rejection suggester + priority support",
    ],
    stripePriceIdTest: "price_test_growth_monthly_REPLACE",
    stripePriceIdTestAnnual: "price_test_growth_annual_REPLACE",
    badge: "Most popular",
  },
  scale: {
    id: "scale",
    name: "Scale",
    tagline: "Multi-location groups, built for scale",
    description: "Multi-location groups with unlimited listings and per-location analytics",
    monthlyPrice: 1499,
    monthlyPriceCents: 149900,
    annualPrice: 16188,
    annualPriceCents: 1618800,
    annualMonthlyEquivalent: 1349,
    features: [
      "Unlimited listings · unlimited admin seats",
      "Everything in Growth, plus:",
      "Per-location dashboards",
      "Cross-location benchmarking",
      "Custom approval chains (H2 2026)",
    ],
    stripePriceIdTest: "price_test_scale_monthly_REPLACE",
    stripePriceIdTestAnnual: "price_test_scale_annual_REPLACE",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "35+ practices, account management included",
    description: "Groups with 35+ practices, account management and enterprise security included",
    monthlyPrice: 2999,
    monthlyPriceCents: 299900,
    annualPrice: 32388,
    annualPriceCents: 3238800,
    annualMonthlyEquivalent: 2699,
    features: [
      "Everything in Scale, plus:",
      "Audit log with indefinite retention",
      "Dedicated CSM + SLA (H2 2026)",
      "SSO / SAML + SOC 2 (H2 2026)",
      "BAA-readiness for HIPAA workflows",
    ],
    stripePriceIdTest: "price_test_enterprise_monthly_REPLACE",
    stripePriceIdTestAnnual: "price_test_enterprise_annual_REPLACE",
  },
};

/** Display order for /pricing page (left-to-right). */
export const PRICING_TIER_ORDER: PricingTier[] = [
  "solo",
  "growth",
  "scale",
  "enterprise",
];

/** Type guard for a tier value coming from a query string or DB column. */
export function isPricingTier(v: string | null | undefined): v is PricingTier {
  return v === "solo" || v === "growth" || v === "scale" || v === "enterprise";
}

/** Type guard for a billing-period value coming from a query string. */
export function isBillingPeriod(v: string | null | undefined): v is BillingPeriod {
  return v === "monthly" || v === "annual";
}

/**
 * Resolve the Stripe Price ID for the current environment + billing period.
 *
 * Reads STRIPE_LIVE_MODE from env. Set it to "1" in Vercel Production scope
 * once live-mode prices are populated (soft launch). Until then, test IDs are
 * used everywhere.
 */
export function getStripePriceId(
  tier: PricingTier,
  period: BillingPeriod = "monthly"
): string {
  const isLive = process.env.STRIPE_LIVE_MODE === "1";
  const config = PRICING_TIERS[tier];
  if (period === "annual") {
    if (isLive && config.stripePriceIdLiveAnnual) {
      return config.stripePriceIdLiveAnnual;
    }
    return config.stripePriceIdTestAnnual;
  }
  if (isLive && config.stripePriceIdLive) {
    return config.stripePriceIdLive;
  }
  return config.stripePriceIdTest;
}

/** Get all tier configs in display order. Useful for /pricing rendering. */
export function getAllTiers(): TierConfig[] {
  return PRICING_TIER_ORDER.map((id) => PRICING_TIERS[id]);
}

/**
 * Resolve a tier from its Stripe Price ID (used in webhook handlers when
 * a `subscription.created` event references a price). Checks both the monthly
 * and annual Price IDs for each tier.
 */
export function tierFromStripePriceId(priceId: string): PricingTier | null {
  const isLive = process.env.STRIPE_LIVE_MODE === "1";
  for (const tier of PRICING_TIER_ORDER) {
    const c = PRICING_TIERS[tier];
    const ids = isLive
      ? [c.stripePriceIdLive, c.stripePriceIdLiveAnnual]
      : [c.stripePriceIdTest, c.stripePriceIdTestAnnual];
    if (ids.includes(priceId)) return tier;
  }
  return null;
}

/**
 * Resolve the billing period from a Stripe Price ID. Lets the billing page
 * and webhook label a subscription monthly vs. annual without a dedicated DB
 * column. Returns null if the price isn't recognized.
 */
export function periodFromStripePriceId(priceId: string): BillingPeriod | null {
  const isLive = process.env.STRIPE_LIVE_MODE === "1";
  for (const tier of PRICING_TIER_ORDER) {
    const c = PRICING_TIERS[tier];
    const annual = isLive ? c.stripePriceIdLiveAnnual : c.stripePriceIdTestAnnual;
    const monthly = isLive ? c.stripePriceIdLive : c.stripePriceIdTest;
    if (priceId === annual) return "annual";
    if (priceId === monthly) return "monthly";
  }
  return null;
}
