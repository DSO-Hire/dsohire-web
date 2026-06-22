/**
 * /api/stripe/webhook — Stripe webhook handler.
 *
 * Stripe POSTs subscription + invoice events here. We verify the signature,
 * route by event type, and keep our `subscriptions` and `invoices` tables in
 * sync with Stripe's source of truth.
 *
 * Required env:
 *   STRIPE_SECRET_KEY        — used to construct the event
 *   STRIPE_WEBHOOK_SECRET    — used to verify the signature header
 *   SUPABASE_SERVICE_ROLE_KEY — for writes to subscriptions/invoices (RLS
 *                              is service-role-only on those tables)
 *
 * Events handled:
 *   - checkout.session.completed         (first-time provision)
 *   - customer.subscription.created      (upsert — fallback if checkout fires late)
 *   - customer.subscription.updated      (status, period, cancel-at-period-end)
 *   - customer.subscription.deleted      (mark canceled)
 *   - invoice.payment_succeeded          (write invoice row + activate sub)
 *   - invoice.payment_failed             (mark past_due)
 *
 * Idempotency: every write is keyed on stripe_subscription_id /
 * stripe_invoice_id with onConflict, so duplicate Stripe deliveries are safe.
 */

import { NextRequest, NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  tierFromStripePriceId,
  isPricingTier,
  isSeatPackPriceId,
  type PricingTier,
} from "@/lib/stripe/prices";
import { autoPauseOverflowForDowngrade } from "@/lib/billing/caps";
import { recordEvent, EVENT_TYPE_GOAL } from "@/lib/analytics/record-event";

// Raw body required for signature verification — opt out of any parsing.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    console.warn("[stripe-webhook] signature verification failed:", message);
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;

      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionUpsert(event.data.object);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
      case "invoice.payment_failed":
        await handleInvoiceEvent(event.data.object, event.type);
        break;

      default:
        // No-op for events we don't care about — Stripe sends a lot of them
        // by default. Log at debug level so noise stays low in prod.
        break;
    }
  } catch (err) {
    // Stripe will retry on non-2xx, so log loudly but still 200 if the event
    // is logically unrecoverable (e.g. unknown DSO). For transient errors
    // we DO want Stripe to retry — return 500.
    if (err instanceof TransientWebhookError) {
      console.error(`[stripe-webhook] transient error on ${event.type}:`, err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    console.error(`[stripe-webhook] unrecoverable error on ${event.type}:`, err);
  }

  return NextResponse.json({ received: true });
}

class TransientWebhookError extends Error {}

/* ───────────────────────────────────────────────────────────────
 * Handlers
 * ───────────────────────────────────────────────────────────── */

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  // Subscription mode only — ignore one-off payments
  if (session.mode !== "subscription") return;

  const dsoId = session.metadata?.dso_id ?? session.client_reference_id;
  const stripeSubId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  const stripeCustomerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!dsoId || !stripeSubId) {
    console.warn("[stripe-webhook] checkout.completed missing dso_id or subscription id", {
      sessionId: session.id,
    });
    return;
  }

  // Fetch the full subscription so we have current_period_start/end + tier
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(stripeSubId);

  await upsertSubscription({
    dsoId,
    subscription,
    stripeCustomerId: stripeCustomerId ?? null,
  });

  // Vantage: attribute the paid conversion back to the anonymous visitor who
  // started checkout (id passed through Stripe metadata — the webhook has no
  // user request context of its own). Fail-silent; never affects provisioning.
  const vantageVisitor = session.metadata?.vantage_visitor;
  if (vantageVisitor) {
    try {
      const visitorId = BigInt(vantageVisitor);
      const tier = session.metadata?.tier ?? null;
      // after() so the write survives once this handler returns 200 to Stripe.
      after(() =>
        recordEvent({
          eventType: EVENT_TYPE_GOAL,
          eventName: "checkout_success",
          visitorId,
          sessionId: null,
          path: null,
          referrerHost: null,
          channel: null,
          utm: { source: null, medium: null, campaign: null, term: null, content: null },
          browser: null,
          os: null,
          device: null,
          country: null,
          region: null,
          props: { tier },
        }),
      );
    } catch {
      // bad/empty visitor id → skip silently
    }
  }
}

async function handleSubscriptionUpsert(subscription: Stripe.Subscription): Promise<void> {
  const dsoId =
    subscription.metadata?.dso_id ??
    (typeof subscription.customer === "object" && subscription.customer && !subscription.customer.deleted
      ? (subscription.customer.metadata?.dso_id as string | undefined)
      : undefined);

  if (!dsoId) {
    // Try to resolve via existing subscription row
    const admin = createSupabaseServiceRoleClient();
    const { data: existing } = await admin
      .from("subscriptions")
      .select("dso_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();
    if (!existing?.dso_id) {
      console.warn("[stripe-webhook] subscription.upsert missing dso_id", {
        subscriptionId: subscription.id,
      });
      return;
    }
    await upsertSubscription({
      dsoId: existing.dso_id as string,
      subscription,
      stripeCustomerId:
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    });
    return;
  }

  await upsertSubscription({
    dsoId,
    subscription,
    stripeCustomerId:
      typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
    })
    .eq("stripe_subscription_id", subscription.id);
  if (error) throw new TransientWebhookError(error.message);
}

async function handleInvoiceEvent(
  invoice: Stripe.Invoice,
  eventType: "invoice.payment_succeeded" | "invoice.payment_failed"
): Promise<void> {
  const stripeSubId = getInvoiceSubscriptionId(invoice);
  if (!stripeSubId) return;

  const admin = createSupabaseServiceRoleClient();

  // Resolve the local subscription row so we can FK the invoice
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("id")
    .eq("stripe_subscription_id", stripeSubId)
    .maybeSingle();

  if (!subRow) {
    // Subscription row may not exist yet on the very first invoice if events
    // arrive out of order — this is transient, ask Stripe to retry.
    throw new TransientWebhookError(
      `Subscription row not found for stripe_subscription_id=${stripeSubId}`
    );
  }

  // Upsert the invoice (idempotent on stripe_invoice_id)
  const { error: invoiceError } = await admin.from("invoices").upsert(
    {
      subscription_id: subRow.id as string,
      stripe_invoice_id: invoice.id ?? `inv_${Date.now()}`,
      amount_cents: invoice.amount_paid ?? invoice.amount_due ?? 0,
      currency: invoice.currency ?? "usd",
      status: invoice.status ?? "open",
      invoice_pdf_url: invoice.invoice_pdf ?? null,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      period_start: tsToIso(invoice.period_start),
      period_end: tsToIso(invoice.period_end),
      paid_at:
        eventType === "invoice.payment_succeeded"
          ? tsToIso(invoice.status_transitions?.paid_at ?? null) ?? new Date().toISOString()
          : null,
    },
    { onConflict: "stripe_invoice_id" }
  );
  if (invoiceError) throw new TransientWebhookError(invoiceError.message);

  // Refresh the subscription status to match invoice outcome
  if (eventType === "invoice.payment_succeeded") {
    await admin
      .from("subscriptions")
      .update({ status: "active" })
      .eq("id", subRow.id as string)
      .in("status", ["incomplete", "past_due", "trialing"]);
  } else if (eventType === "invoice.payment_failed") {
    await admin
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("id", subRow.id as string);
  }
}

/* ───────────────────────────────────────────────────────────────
 * Shared upsert
 * ───────────────────────────────────────────────────────────── */

interface UpsertParams {
  dsoId: string;
  subscription: Stripe.Subscription;
  stripeCustomerId: string | null;
}

async function upsertSubscription(params: UpsertParams): Promise<void> {
  const { dsoId, subscription, stripeCustomerId } = params;
  const admin = createSupabaseServiceRoleClient();

  // The PLAN item is the one whose price maps to a tier — NOT blindly data[0],
  // because a seat-pack add-on (#88) is a second line item that can land at
  // index 0. Fall back to data[0] for a legacy/unrecognized price so the
  // tier-preserve logic in resolveTier still runs.
  const items = subscription.items.data;
  const planItem =
    items.find((i) => i.price?.id && tierFromStripePriceId(i.price.id)) ??
    items[0];
  const priceId = planItem?.price?.id ?? null;
  // Sum quantities across any seat-pack line items.
  const seatPackQty = items
    .filter((i) => isSeatPackPriceId(i.price?.id))
    .reduce((sum, i) => sum + (i.quantity ?? 0), 0);
  let tier = resolveTier(subscription, priceId);
  if (tier === null) {
    // Price isn't in our map and no metadata tier — e.g. a legacy/grandfathered
    // price object left behind after a repricing (the 2026-05-20 ladder swap
    // orphaned the old "TS2" price IDs). NEVER silently default such a row to
    // Solo: that would strip a paying customer's feature access on their next
    // renewal webhook. Preserve whatever tier the existing row already has;
    // only fall to Solo for a genuinely new subscription with nothing to keep.
    const { data: existing } = await admin
      .from("subscriptions")
      .select("tier")
      .eq("dso_id", dsoId)
      .maybeSingle();
    tier = (isPricingTier(existing?.tier) ? existing?.tier : "solo") as PricingTier;
    console.warn(
      `[stripe-webhook] unrecognized price ${priceId ?? "(none)"} for dso ${dsoId}; ` +
        `preserved tier="${tier}" instead of downgrading.`
    );
  }
  const periodStart = tsToIso(planItem?.current_period_start ?? null);
  const periodEnd = tsToIso(planItem?.current_period_end ?? null);

  const { error } = await admin.from("subscriptions").upsert(
    {
      dso_id: dsoId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
      tier,
      status: subscription.status,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      seat_pack_qty: seatPackQty,
    },
    { onConflict: "dso_id" }
  );
  if (error) throw new TransientWebhookError(error.message);

  // #88 — if this plan change leaves the DSO over its active-openings cap
  // (i.e. a downgrade), auto-pause the overflow. Recoverable: the jobs page
  // shows a "choose what to reactivate" banner. Best-effort — a failure here
  // must not fail the webhook (it re-runs on the next event).
  if (subscription.status === "active" || subscription.status === "trialing") {
    try {
      await autoPauseOverflowForDowngrade(admin, dsoId, tier);
    } catch (e) {
      console.warn(
        `[stripe-webhook] downgrade auto-pause failed for dso ${dsoId}`,
        e
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function resolveTier(
  subscription: Stripe.Subscription,
  priceId: string | null
): PricingTier | null {
  // Price ID is the authoritative source — it's what actually determines
  // billing in Stripe. Customer Portal plan switches update price but NOT
  // metadata, so trusting metadata first caused upgraded subscriptions to
  // stay marked at their original tier even after the price changed
  // (regression caught 2026-05-04 when a Starter→Growth upgrade left the
  // tier column saying 'starter' while stripe_price_id pointed at Growth).
  if (priceId) {
    const tier = tierFromStripePriceId(priceId);
    if (tier) return tier;
  }
  // Fall back to metadata (set at checkout creation) — useful for the rare
  // case where the price ID isn't recognized (e.g. a one-off promo price).
  const metaTier = subscription.metadata?.tier;
  if (isPricingTier(metaTier)) {
    return metaTier;
  }
  // Unresolved — return null so the caller can preserve the existing tier
  // rather than blindly downgrading to Solo. (Previously this defaulted to
  // "solo", which silently stripped feature access from any subscription on
  // an orphaned price after a repricing — caught 2026-06-01.)
  return null;
}

function tsToIso(ts: number | null | undefined): string | null {
  if (ts === null || ts === undefined) return null;
  return new Date(ts * 1000).toISOString();
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  // Stripe's Invoice type has `subscription` on older API versions and
  // `parent.subscription_details.subscription` on newer ones. Handle both.
  const directSub = (invoice as unknown as { subscription?: string | { id: string } | null })
    .subscription;
  if (typeof directSub === "string") return directSub;
  if (directSub && typeof directSub === "object" && "id" in directSub) {
    return (directSub as { id: string }).id;
  }
  const parentSub = (
    invoice as unknown as {
      parent?: { subscription_details?: { subscription?: string | null } | null } | null;
    }
  ).parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  return null;
}
