/**
 * /employer/checkout — sign-up step 3.
 *
 * After OTP verification (step 2) the user lands here. We:
 *   1. Confirm they're signed in and have a DSO
 *   2. Bail out if they already have an active subscription (skip checkout)
 *   3. Read their requested tier from user_metadata
 *   4. Create a Stripe Checkout session for that tier
 *   5. Redirect to Stripe-hosted checkout
 *
 * Stripe success → /employer/checkout/success?session_id={CHECKOUT_SESSION_ID}
 * Stripe cancel  → /employer/checkout?canceled=1 (this same page; we render
 *                  a re-entry CTA instead of auto-redirecting again)
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { EmployerShell } from "@/components/employer/employer-shell";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import {
  PRICING_TIERS,
  getStripePriceId,
  type PricingTier,
} from "@/lib/stripe/prices";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activate your subscription",
};

interface PageProps {
  searchParams: Promise<{ canceled?: string; tier?: string }>;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

function isPricingTier(v: string): v is PricingTier {
  return v === "starter" || v === "growth" || v === "enterprise";
}

export default async function CheckoutPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/sign-up");

  // If they already have any active subscription, skip checkout entirely.
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id, status")
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  if (existing && (existing.status as string) !== "incomplete") {
    redirect("/employer/dashboard");
  }

  // Resolve the tier they picked at sign-up.
  const metadataTier = (user.user_metadata?.requested_tier as string) ?? "";
  const queryTier = (sp.tier as string) ?? "";
  const tier = isPricingTier(queryTier)
    ? queryTier
    : isPricingTier(metadataTier)
      ? metadataTier
      : "starter";

  const tierConfig = PRICING_TIERS[tier];

  // If user came back here via Stripe's cancel_url, render a re-entry screen
  // rather than auto-redirecting them into another Checkout session.
  if (sp.canceled === "1") {
    return (
      <EmployerShell active="billing">
        <div className="max-w-[640px]">
          <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
            Activate your subscription
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink">
            No worries — pick up where you left off.
          </h1>
          <p className="mt-4 text-base text-slate-body leading-[1.7]">
            You closed the Stripe checkout before completing payment. Your
            account is still set up; we just need an active subscription before
            you can post jobs.
          </p>
          <div className="mt-6 border border-[var(--rule-strong)] bg-cream/60 p-6">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep mb-2">
              Selected plan
            </div>
            <div className="text-[20px] font-extrabold tracking-[-0.4px] text-ink">
              {tierConfig.name}
            </div>
            <div className="text-[13px] text-slate-body mt-1">
              ${tierConfig.monthlyPrice}/month · {tierConfig.tagline}
            </div>
          </div>
          <form action={createCheckoutSession} className="mt-6">
            <input type="hidden" name="tier" value={tier} />
            <button
              type="submit"
              className="inline-flex items-center gap-2.5 px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors"
            >
              Resume Checkout
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-4 text-[12px] text-slate-meta">
            Need a different plan?{" "}
            <Link
              href="/pricing"
              className="text-heritage hover:text-heritage-deep underline underline-offset-2 font-semibold"
            >
              Compare plans
            </Link>
            {" "}or email{" "}
            <a
              href="mailto:cam@dsohire.com"
              className="text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              cam@dsohire.com
            </a>
            .
          </p>
        </div>
      </EmployerShell>
    );
  }

  // Default path: create session + redirect
  const sessionUrl = await buildCheckoutUrl({
    tier,
    dsoId: dsoUser.dso_id,
    userId: user.id,
    userEmail: user.email ?? "",
    fullName: (dsoUser.full_name as string | null) ?? null,
  });

  if (!sessionUrl) {
    return (
      <EmployerShell active="billing">
        <div className="max-w-[640px]">
          <h1 className="text-3xl font-extrabold tracking-[-1px] text-ink mb-4">
            Stripe checkout is temporarily unavailable.
          </h1>
          <p className="text-[14px] text-slate-body leading-relaxed mb-6">
            Something went wrong creating your checkout session. Refresh to
            retry, or email{" "}
            <a
              href="mailto:cam@dsohire.com"
              className="text-heritage hover:text-heritage-deep underline underline-offset-2 font-semibold"
            >
              cam@dsohire.com
            </a>{" "}
            and we&apos;ll set up your subscription manually.
          </p>
        </div>
      </EmployerShell>
    );
  }

  redirect(sessionUrl);
}

/* ───────────────────────────────────────────────────────────────
 * Server actions
 * ───────────────────────────────────────────────────────────── */

async function createCheckoutSession(formData: FormData) {
  "use server";
  const tierParam = String(formData.get("tier") ?? "starter");
  const tier: PricingTier = isPricingTier(tierParam) ? tierParam : "starter";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/sign-up");

  const url = await buildCheckoutUrl({
    tier,
    dsoId: dsoUser.dso_id,
    userId: user.id,
    userEmail: user.email ?? "",
    fullName: (dsoUser.full_name as string | null) ?? null,
  });

  if (!url) {
    redirect(`/employer/checkout?canceled=1&tier=${tier}`);
  }

  redirect(url);
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

interface BuildCheckoutParams {
  tier: PricingTier;
  dsoId: string;
  userId: string;
  userEmail: string;
  fullName: string | null;
}

async function buildCheckoutUrl(params: BuildCheckoutParams): Promise<string | null> {
  try {
    const stripe = getStripe();
    const priceId = getStripePriceId(params.tier);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: params.userEmail || undefined,
      // Bind the Stripe customer + subscription to our internal IDs so the
      // webhook can resolve them without a roundtrip to our DB on every event.
      client_reference_id: params.dsoId,
      metadata: {
        dso_id: params.dsoId,
        auth_user_id: params.userId,
        tier: params.tier,
      },
      subscription_data: {
        metadata: {
          dso_id: params.dsoId,
          auth_user_id: params.userId,
          tier: params.tier,
        },
      },
      success_url: `${SITE_URL}/employer/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/employer/checkout?canceled=1&tier=${params.tier}`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
    });

    return session.url;
  } catch (err) {
    console.error("[checkout] failed to create Stripe session:", err);
    return null;
  }
}
