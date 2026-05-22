/**
 * Per-tier marketing content for the /pricing/[tier] detail pages.
 *
 * Kept separate from src/lib/stripe/prices.ts on purpose: prices.ts is the
 * checkout-critical source of truth (Stripe IDs, amounts, feature bullets),
 * while this file is the longer-form "who's the perfect fit" narrative that
 * only the tier landing pages use. Pricing/feature data is read from
 * PRICING_TIERS; this just layers the sales story on top.
 *
 * Practice-count language stays open-ended at the top (no ceiling) per the
 * brand copy rule — Solo's "2–5 locations" is a floor band for the smallest
 * tier; Enterprise is "35+".
 */

import type { PricingTier } from "@/lib/stripe/prices";

export interface TierPageContent {
  /** One-line hook under the tier name. */
  headline: string;
  /** 1–2 paragraph "who this is for" narrative. */
  whoItsFor: string;
  /** "You're a great fit if…" bullets. */
  bestIf: string[];
  /** Optional nudge down a tier. */
  considerLowerIf?: string;
  /** Optional nudge up a tier. */
  considerHigherIf?: string;
}

export const TIER_PAGE_CONTENT: Record<PricingTier, TierPageContent> = {
  solo: {
    headline: "The essentials for privately-owned groups of 2–5 locations.",
    whoItsFor:
      "Solo is for privately-owned dental groups running a handful of locations — typically two to five practices — that have outgrown posting jobs one office at a time but don't yet need a full enterprise hiring stack. You get the core platform: multi-location posting in a single flow, Practice Fit + AI candidate matching, the dental-context AI job-description generator, and a branded company page with map view — without paying for seats and reporting depth you won't use yet.",
    bestIf: [
      "You run 2–5 locations under one ownership",
      "You post a few roles at a time (up to 5 active listings)",
      "1–3 people touch hiring (3 admin seats included)",
      "You want AI matching + a branded presence without enterprise overhead",
    ],
    considerHigherIf:
      "Regularly running more than 5 open roles, or want the cross-job inbox and funnel reports? Growth is the natural step up.",
  },
  growth: {
    headline: "The full hiring platform for groups in active expansion.",
    whoItsFor:
      "Growth is the complete platform for dental groups and DSOs that are hiring continuously. It's our most popular tier because it adds the tools that matter once hiring becomes an ongoing operation: a cross-job application inbox, license-requirement and attestation tracking, funnel reporting, and the AI rejection-reason suggester — with room for up to 20 active listings and 10 admin seats, plus priority support. Everything in Solo is included.",
    bestIf: [
      "You're hiring continuously across multiple locations",
      "Up to 20 open roles at a time (20 active listings)",
      "A real hiring team — up to 10 admin seats",
      "You want pipeline reporting, license tracking, and priority support",
    ],
    considerLowerIf:
      "Just a couple of locations and a handful of roles? Solo covers the essentials for less.",
    considerHigherIf:
      "Need unlimited listings, unlimited seats, or per-location analytics? Scale unlocks them.",
  },
  scale: {
    headline: "Unlimited hiring with per-location visibility.",
    whoItsFor:
      "Scale is built for multi-location groups operating at, well, scale. It removes the caps — unlimited active listings and unlimited admin seats — and adds the visibility regional leaders need: per-location dashboards and cross-location benchmarking so you can compare practice performance side by side instead of in aggregate. It's the tier for groups where hiring is a standing operation across many sites. Everything in Growth is included.",
    bestIf: [
      "Many locations, often spread across regions",
      "Unlimited open roles and unlimited admin seats",
      "You need per-location dashboards + cross-location benchmarking",
      "Regional / area managers who each own hiring for a cluster",
    ],
    considerLowerIf:
      "If 20 listings and 10 seats still fit, Growth gives you the full platform for less.",
    considerHigherIf:
      "Need account management, SSO/SAML, SOC 2, or BAA-readiness? Enterprise adds the governance + security layer.",
  },
  enterprise: {
    headline: "Governance, security, and account management for the largest groups.",
    whoItsFor:
      "Enterprise is for the largest, most complex groups — typically 35+ practices — where hiring runs alongside real governance, security, and account-management requirements. On top of everything in Scale, it layers an audit log with indefinite retention, a dedicated customer success manager with an SLA, SSO / SAML and SOC 2, and BAA-readiness for HIPAA workflows. Some of these capabilities are on the H2 2026 roadmap; your CSM maps the rollout to your timeline.",
    bestIf: [
      "35+ practices and/or multi-region operations",
      "Procurement, security review, or compliance requirements in the buying process",
      "You want a dedicated CSM and a service-level agreement",
      "SSO/SAML, SOC 2, audit logging, and BAA-readiness matter to you",
    ],
    considerLowerIf:
      "If you don't yet need SSO, SOC 2, or a dedicated CSM, Scale gives you unlimited hiring + analytics today.",
  },
};
