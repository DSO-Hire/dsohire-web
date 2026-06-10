/**
 * Stripe pricing config — single source of truth for tier prices, IDs,
 * billing periods, and tier helpers across the app.
 *
 * Public ladder (locked 2026-05-20, repositioning): Solo / Growth / Scale /
 * Enterprise. Replaces the prior Starter / Growth / Enterprise ladder.
 *
 *   Solo        $399/mo   ($359/mo billed annually)  — 5 active openings · 5 seats
 *   Growth      $699/mo   ($629/mo billed annually)  — 20 active openings · 15 seats
 *   Scale       $1,499/mo ($1,349/mo billed annually)— 100 active openings · 50 seats   [most popular]
 *   Enterprise  $2,999/mo ($2,699/mo billed annually)— unlimited · unlimited
 *
 * Caps are code-enforced (#88): the advertised number === the enforced number.
 * Seat packs (+3 seats, $99/mo) can raise the seat cap on Solo/Growth/Scale.
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
 * STRIPE PRICE IDs
 * ─────────────────────────────────────────────────────────────────────────
 * Test-mode Price IDs were created in the "DSO Hire sandbox" on 2026-05-20 and
 * are populated below — Checkout resolves both monthly + annual. Stripe prices
 * are immutable, so a future amount change needs a brand-new Price object (not
 * an edit). Live IDs get added at soft-launch (set STRIPE_LIVE_MODE = "1" in
 * Vercel Production once the live-mode prices are populated).
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
  /**
   * Hard cap on concurrent ACTIVE openings (the sum of `openings` across the
   * DSO's `status='active'` jobs). null = unlimited. The advertised number
   * MUST equal this enforced number (memo #88 §4.6). Counted, not metered.
   */
  maxActiveJobs: number | null;
  /** Hard cap on admin seats (reuses seats_used). null = unlimited. */
  maxSeats: number | null;
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
    tagline: "Privately-owned groups, 2–5 locations",
    description: "Privately-owned dental groups of 2–5 locations, up to 5 active listings",
    monthlyPrice: 399,
    monthlyPriceCents: 39900,
    annualPrice: 4308,
    annualPriceCents: 430800,
    annualMonthlyEquivalent: 359,
    features: [
      "Up to 5 active openings · 5 admin seats",
      "Multi-location posting in a single flow",
      "Practice Fit + AI candidate matching",
      "AI Job Description generator (dental-context)",
      "Branded company page + map view",
    ],
    maxActiveJobs: 5,
    maxSeats: 5,
    stripePriceIdTest: "price_1TZCQh0uFxwSh1FnO9cRurPI",
    stripePriceIdTestAnnual: "price_1TZCRL0uFxwSh1FnqaMDm06C",
  },
  growth: {
    id: "growth",
    name: "Growth",
    tagline: "Growing dental groups & DSOs",
    description: "Growing dental groups with up to 20 active listings and the full hiring platform",
    monthlyPrice: 699,
    monthlyPriceCents: 69900,
    annualPrice: 7548,
    annualPriceCents: 754800,
    annualMonthlyEquivalent: 629,
    features: [
      "Up to 20 active openings · 15 admin seats",
      "Everything in Solo, plus:",
      "Cross-job application inbox",
      "License requirements + attestation tracking",
      "Funnel reports + AI rejection suggester + priority support",
    ],
    maxActiveJobs: 20,
    maxSeats: 15,
    stripePriceIdTest: "price_1TZCRe0uFxwSh1FnqKatGAUP",
    stripePriceIdTestAnnual: "price_1TZCS20uFxwSh1Fnt8Gsc0Y2",
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
      "Up to 100 active openings · 50 admin seats",
      "Everything in Growth, plus:",
      "Per-location dashboards",
      "Cross-location benchmarking",
      "Custom approval chains (H2 2026)",
    ],
    maxActiveJobs: 100,
    maxSeats: 50,
    stripePriceIdTest: "price_1TZCSO0uFxwSh1FnGSO3OoJR",
    stripePriceIdTestAnnual: "price_1TZCSj0uFxwSh1FnkuUbRajm",
    badge: "Most popular",
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
      "Unlimited active openings · unlimited admin seats",
      "Everything in Scale, plus:",
      "Audit log with indefinite retention",
      "Dedicated CSM + SLA (H2 2026)",
      "SSO / SAML + SOC 2 (H2 2026)",
      "BAA-readiness for HIPAA workflows",
    ],
    maxActiveJobs: null,
    maxSeats: null,
    stripePriceIdTest: "price_1TZCT70uFxwSh1FnIQNZziqE",
    stripePriceIdTestAnnual: "price_1TZCTQ0uFxwSh1Fn3FCyRSvk",
  },
};

/* ─────────────────────────────────────────────────────────────────────────
 * SEAT PACKS (#88) — optional add-on that raises a DSO's seat cap by a fixed
 * bundle without forcing a full tier jump. Sold as a SECOND recurring line
 * item on the existing subscription (Stripe auto-prorates). The pack price's
 * billing interval MUST match the plan's interval — Stripe rejects mixed
 * intervals on one subscription — so we keep a monthly AND an annual price and
 * pick the one matching the subscription's period.
 *
 * Locked 2026-06-10: +3 seats per pack · $99/mo · ~$1,069/yr (≈10% annual
 * discount, mirroring the tier ladder). Available on Solo / Growth / Scale
 * (Enterprise is already unlimited). Heavy seat needs are steered to a tier
 * upgrade by the nudge guardrail; the pack is the light top-off.
 *
 * Price IDs come from ENV (not hardcoded) so they can be created in Stripe +
 * set in Vercel without a code change:
 *   STRIPE_SEAT_PACK_PRICE_TEST_MONTHLY / _TEST_ANNUAL
 *   STRIPE_SEAT_PACK_PRICE_LIVE_MONTHLY / _LIVE_ANNUAL
 * Until they're set, seatPacksConfigured() is false and the UI hides the
 * add-seats control.
 * ───────────────────────────────────────────────────────────────────────── */

/** Seats added per pack. */
export const SEAT_PACK_SIZE = 3;
/** Display price of one pack billed monthly (dollars). */
export const SEAT_PACK_MONTHLY_PRICE = 99;
/** Display price of one pack billed annually — yearly total (dollars). */
export const SEAT_PACK_ANNUAL_PRICE = 1069;
/** Tiers eligible to buy seat packs (Enterprise is already unlimited). */
export const SEAT_PACK_TIERS: PricingTier[] = ["solo", "growth", "scale"];

/** Whether a tier can purchase seat packs (capped + eligible). */
export function tierCanBuySeatPacks(tier: string | null | undefined): boolean {
  return isPricingTier(tier) && SEAT_PACK_TIERS.includes(tier);
}

/**
 * Resolve the seat-pack Stripe Price ID for the current env + billing period.
 * Returns null if the matching env var isn't set (packs not yet configured).
 */
export function getSeatPackPriceId(
  period: BillingPeriod = "monthly"
): string | null {
  const isLive = process.env.STRIPE_LIVE_MODE === "1";
  if (period === "annual") {
    return (
      (isLive
        ? process.env.STRIPE_SEAT_PACK_PRICE_LIVE_ANNUAL
        : process.env.STRIPE_SEAT_PACK_PRICE_TEST_ANNUAL) ?? null
    );
  }
  return (
    (isLive
      ? process.env.STRIPE_SEAT_PACK_PRICE_LIVE_MONTHLY
      : process.env.STRIPE_SEAT_PACK_PRICE_TEST_MONTHLY) ?? null
  );
}

/** All configured seat-pack price IDs (both intervals, current env mode). */
export function getSeatPackPriceIds(): string[] {
  return [getSeatPackPriceId("monthly"), getSeatPackPriceId("annual")].filter(
    (id): id is string => Boolean(id)
  );
}

/** True if the given Stripe price ID is one of our seat-pack prices. */
export function isSeatPackPriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return getSeatPackPriceIds().includes(priceId);
}

/** Whether seat packs are usable in the current env (price IDs are set). */
export function seatPacksConfigured(): boolean {
  return getSeatPackPriceId("monthly") !== null;
}

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
