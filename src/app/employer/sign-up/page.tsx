/**
 * /employer/sign-up — DSO subscription sign-up.
 *
 * For tonight: single-page form capturing email + DSO basics. Server action
 * uses the service-role client to create the auth user + dsos + dso_users
 * (owner role) rows in one transaction, then sends a magic link to verify
 * the email. After verification, the user lands on /employer/onboarding.
 *
 * Stripe Checkout (step 3 of the originally-planned 3-step flow) wires up
 * in Phase 2 Week 5. Until then, sign-up creates a 'pending' DSO with no
 * subscription — Cam manually verifies and activates customers.
 */

import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { SignUpForm } from "./sign-up-form";
import { BillingPeriodToggle } from "@/app/pricing/billing-period-toggle";
import {
  PRICING_TIERS,
  isPricingTier,
  isBillingPeriod,
  type BillingPeriod,
} from "@/lib/stripe/prices";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start a DSO Subscription",
  description:
    "Sign up your dental group for DSO Hire. One flat monthly fee, unlimited multi-location postings, no placement fees.",
};

interface PageProps {
  searchParams: Promise<{ tier?: string; period?: string }>;
}

export default async function SignUpPage({ searchParams }: PageProps) {
  const { tier: tierParam, period: periodParam } = await searchParams;
  const requestedTier = isPricingTier(tierParam) ? tierParam : "solo";
  const period: BillingPeriod = isBillingPeriod(periodParam)
    ? periodParam
    : "annual";
  const selectedTier = PRICING_TIERS[requestedTier];
  const isAnnual = period === "annual";
  const headlinePrice = isAnnual
    ? selectedTier.annualMonthlyEquivalent
    : selectedTier.monthlyPrice;

  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[1100px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
          Start a DSO Subscription
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-6 max-w-[820px]">
          Set up your DSO in three minutes.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px] mb-12">
          Tell us about your organization. We&apos;ll send a sign-in link to verify
          your email, then you&apos;ll add locations, invite teammates, and post
          your first job.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {/* Form */}
          <div className="bg-card p-8 sm:p-10">
            <SignUpForm initialTier={requestedTier} initialPeriod={period} />
          </div>

          {/* Tier sidebar */}
          <aside className="bg-cream p-8 sm:p-10">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
              You&apos;re Signing Up For
            </div>
            <div className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-2">
              {selectedTier.name}
            </div>
            <div className="text-[14px] text-slate-body mb-5 leading-snug">
              {selectedTier.tagline}
            </div>
            {/* Period toggle on sign-up — 2026-05-26 — so a visitor who picked
                monthly on /pricing can flip to annual (or vice versa) without
                bouncing back through the pricing page. Updates the ?period=
                URL param; server re-reads it + re-renders the sidebar + form
                hidden inputs. */}
            <div className="mb-5">
              <BillingPeriodToggle period={period} />
            </div>
            <div className="mb-6 pb-6 border-b border-[var(--rule)]">
              <div className="flex items-baseline gap-1.5">
                <div className="text-4xl font-extrabold tracking-[-1px] text-ink">
                  ${headlinePrice.toLocaleString()}
                </div>
                <div className="text-[14px] text-slate-body font-medium">/ month</div>
              </div>
              {isAnnual && (
                <div className="mt-1 text-[12px] text-slate-meta">
                  Billed annually · ${selectedTier.annualPrice.toLocaleString()}/yr
                </div>
              )}
            </div>

            <ul className="list-none space-y-2.5">
              {selectedTier.features.map((f, i) => (
                <li
                  key={i}
                  className="text-[14px] text-ink flex items-start gap-2 leading-snug"
                >
                  <span className="text-heritage-light font-extrabold flex-shrink-0">
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <p className="mt-7 pt-5 border-t border-[var(--rule)] text-[13px] text-slate-meta leading-relaxed">
              Payment via Stripe. Cancel or change tiers anytime. No setup fees
              or implementation costs.
            </p>

            <div className="mt-5">
              <Link
                href="/pricing"
                className="text-[13px] font-semibold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink underline underline-offset-2"
              >
                ← Change tier
              </Link>
            </div>
          </aside>
        </div>

        <p className="mt-10 text-[14px] text-slate-body leading-relaxed">
          Already have an account?{" "}
          <Link
            href="/employer/sign-in"
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Sign in
          </Link>
        </p>
      </section>
    </SiteShell>
  );
}
