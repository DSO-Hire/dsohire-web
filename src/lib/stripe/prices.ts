/**
 * Stripe pricing config — single source of truth for tier prices, IDs,
 * and rate-lock rules across the app.
 *
 * Public ladder: Starter / Growth / Enterprise.
 *
 * Founding tier was retired from public pricing on 2026-05-05 (see
 * `Business Plan & Strategy/Pricing_Repositioning_Memo.md`). Replacement is
 * the Charter Customer Program — a non-advertised back-pocket sales tool
 * deployed by Cam selectively via a Stripe coupon (CHARTER20 or CHARTER15)
 * on top of a Starter or Growth purchase. Cap = 5. No public surface.
 *
 * The legacy Founding test-mode Stripe Product / Price IDs
 * (prod_UQu8absG1IMXnF / price_1TS2Ig0uFxwSh1Fn1g8PGMGJ) need to be archived
 * manually in the Stripe dashboard — see hand-off note Cam received with
 * this change.
 *
 * Live Price IDs get added at Phase 2 Week 6 (soft launch). Until then,
 * test-mode IDs are used in dev/preview/production.
 */

export type PricingTier = "starter" | "growth" | "enterprise";

export interface TierConfig {
  id: PricingTier;
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number; // dollars (display)
  monthlyPriceCents: number; // cents (Stripe arithmetic)
  features: string[];
  /** Stripe Price IDs — test mode for now; live IDs added at Phase 2 Week 6. */
  stripePriceIdTest: string;
  stripePriceIdLive?: string;
  /** Stripe Product IDs — kept for metadata lookups and admin tooling. */
  stripeProductIdTest?: string;
  badge?: string;
}

export const PRICING_TIERS: Record<PricingTier, TierConfig> = {
  starter: {
    id: "starter",
    name: "Starter",
    tagline: "Built for DSOs with 10–20 practices",
    description: "DSOs with 10–20 practices, up to 50 active listings",
    monthlyPrice: 499,
    monthlyPriceCents: 49900,
    features: [
      "Up to 50 active listings · 10 admin seats",
      "Unlimited multi-location posting",
      "AI Job Description generator (dental-context)",
      "Curated dental screening Q library",
      "Branded company page + map view",
    ],
    stripePriceIdTest: "price_1TS2J80uFxwSh1Fn95SvEUrt",
    stripeProductIdTest: "prod_UQu7SsQTQmBbEm",
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "Built for DSOs with 20–35 practices",
    description: "DSOs with 20–35 practices, unlimited listings, full hiring platform",
    monthlyPrice: 999,
    monthlyPriceCents: 99900,
    features: [
      "Unlimited listings · unlimited admin seats",
      "Application kanban + bulk actions + scorecards",
      "State license verification + 60-day alerts",
      "AI candidate matching + Smart Fit Score",
      "Per-location dashboards + salary benchmarks",
    ],
    stripePriceIdTest: "price_1TS2JY0uFxwSh1FnH7Q4dgKm",
    stripeProductIdTest: "prod_UQu7wAVpO2pFyE",
    badge: "Most popular",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    tagline: "Built for DSOs with 35+ practices",
    description: "DSOs with 35+ practices, account management included",
    monthlyPrice: 1499,
    monthlyPriceCents: 149900,
    features: [
      "Everything in Growth",
      "Dedicated CSM + SLA (H2 2026)",
      "SSO / SAML / audit log (H2 2026)",
      "REST API + custom integrations (H2 2026)",
      "BAA-readiness for HIPAA workflows",
    ],
    stripePriceIdTest: "price_1TS2KN0uFxwSh1FnVWdnRMFC",
    stripeProductIdTest: "prod_UQu6Qv3pak8pJv",
  },
};

/** Display order for /pricing page (left-to-right). */
export const PRICING_TIER_ORDER: PricingTier[] = [
  "starter",
  "growth",
  "enterprise",
];

/**
 * Resolve the Stripe Price ID for the current environment.
 *
 * Reads STRIPE_LIVE_MODE from env. Set it to "1" in Vercel Production scope
 * once live-mode prices are populated (Phase 2 Week 6). Until then, test
 * IDs are used everywhere.
 */
export function getStripePriceId(tier: PricingTier): string {
  const isLive = process.env.STRIPE_LIVE_MODE === "1";
  const config = PRICING_TIERS[tier];
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
 * a `subscription.created` event references a price).
 */
export function tierFromStripePriceId(priceId: string): PricingTier | null {
  const isLive = process.env.STRIPE_LIVE_MODE === "1";
  const key = isLive ? "stripePriceIdLive" : "stripePriceIdTest";
  for (const tier of PRICING_TIER_ORDER) {
    if (PRICING_TIERS[tier][key] === priceId) return tier;
  }
  return null;
}
