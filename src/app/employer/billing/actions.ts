"use server";

/**
 * /employer/billing server actions.
 *
 * openCustomerPortal: creates a Stripe Customer Portal session for the
 * signed-in employer's Stripe customer and redirects to it. Stripe-hosted
 * portal handles cancel, payment-method updates, plan changes, invoice
 * history, etc. We just need to provide the customer ID and a return URL.
 *
 * The portal must be configured once in the Stripe dashboard
 * (Settings → Billing → Customer Portal) — feature toggles, branding, etc.
 * Stripe surfaces a clear error if it isn't configured yet.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export async function openCustomerPortal() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) redirect("/employer/sign-up");

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  const stripeCustomerId = sub?.stripe_customer_id as string | undefined;
  if (!stripeCustomerId) {
    // No subscription yet — bounce them to checkout instead.
    redirect("/employer/checkout");
  }

  let portalUrl: string;
  try {
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${SITE_URL}/employer/billing`,
    });
    portalUrl = session.url;
  } catch (err) {
    console.error("[billing] failed to create portal session:", err);
    redirect("/employer/billing?portal_error=1");
  }

  redirect(portalUrl);
}
