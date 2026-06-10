"use server";

/**
 * #88 — seat-pack add-on actions.
 *
 * A seat pack is a +3-seat bundle sold as a SECOND recurring line item on the
 * DSO's existing Stripe subscription (Stripe auto-prorates the add/remove). We
 * mutate the subscription via the Stripe API rather than a fresh Checkout —
 * Checkout's subscription mode only CREATES subscriptions, it can't append an
 * item to an existing one. The pack price's interval must match the plan's
 * interval (Stripe rejects mixed intervals), so we resolve monthly-vs-annual
 * from the plan's price ID.
 *
 * After the Stripe mutation we write seat_pack_qty directly (service-role) so
 * the UI reflects immediately; the customer.subscription.updated webhook also
 * recomputes it, so the two converge idempotently.
 *
 * Owner/admin only. Removing a pack is blocked if it would drop the seat cap
 * below current usage — never strip a seat out from under a live teammate.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import {
  getSeatPackPriceId,
  isSeatPackPriceId,
  periodFromStripePriceId,
  tierCanBuySeatPacks,
  SEAT_PACK_SIZE,
} from "@/lib/stripe/prices";
import { resolveCaps, getSeatsUsed } from "@/lib/billing/caps";

export interface SeatPackResult {
  ok: boolean;
  message: string;
}

interface Ctx {
  dsoId: string;
  stripeSubId: string;
  tier: string;
  pricePeriod: "monthly" | "annual";
  seatPackQty: number;
}

/** Resolve + authorize the acting owner/admin and their active subscription. */
async function loadContext(): Promise<
  { ctx: Ctx } | { error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You're signed out. Sign in and try again." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { error: "No employer account found." };
  if (dsoUser.role !== "owner" && dsoUser.role !== "admin") {
    return { error: "Only owners and admins can change seats." };
  }

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("tier, status, stripe_subscription_id, stripe_price_id, seat_pack_qty")
    .eq("dso_id", dsoUser.dso_id)
    .maybeSingle();

  if (!sub || !sub.stripe_subscription_id) {
    return { error: "No active subscription. Activate a plan in Billing first." };
  }
  const status = sub.status as string;
  if (status !== "active" && status !== "trialing") {
    return { error: "Your subscription isn't active. Update billing first." };
  }
  const tier = sub.tier as string;
  if (!tierCanBuySeatPacks(tier)) {
    return { error: "Seat packs aren't available on your plan." };
  }

  const pricePeriod =
    periodFromStripePriceId((sub.stripe_price_id as string | null) ?? "") ??
    "monthly";

  return {
    ctx: {
      dsoId: dsoUser.dso_id as string,
      stripeSubId: sub.stripe_subscription_id as string,
      tier,
      pricePeriod,
      seatPackQty: (sub.seat_pack_qty as number | null) ?? 0,
    },
  };
}

/** Persist the new pack count + refresh the surfaces that show seat usage. */
async function persistAndRevalidate(dsoId: string, qty: number): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  await admin
    .from("subscriptions")
    .update({ seat_pack_qty: qty })
    .eq("dso_id", dsoId);
  revalidatePath("/employer/team");
  revalidatePath("/employer/billing");
}

/** Add one +3 seat pack to the subscription. */
export async function addSeatPack(): Promise<SeatPackResult> {
  const loaded = await loadContext();
  if ("error" in loaded) return { ok: false, message: loaded.error };
  const { ctx } = loaded;

  const packPriceId = getSeatPackPriceId(ctx.pricePeriod);
  if (!packPriceId) {
    return {
      ok: false,
      message: "Seat packs aren't configured yet. Contact support.",
    };
  }

  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(ctx.stripeSubId);
    const existing = subscription.items.data.find((i) =>
      isSeatPackPriceId(i.price?.id)
    );

    if (existing) {
      await stripe.subscriptionItems.update(existing.id, {
        quantity: (existing.quantity ?? 0) + 1,
        proration_behavior: "create_prorations",
      });
    } else {
      await stripe.subscriptionItems.create({
        subscription: ctx.stripeSubId,
        price: packPriceId,
        quantity: 1,
        proration_behavior: "create_prorations",
      });
    }

    const newQty = ctx.seatPackQty + 1;
    await persistAndRevalidate(ctx.dsoId, newQty);
    return {
      ok: true,
      message: `Added ${SEAT_PACK_SIZE} seats. Your card will be prorated for the rest of this cycle.`,
    };
  } catch (err) {
    console.error("[seat-pack] add failed:", err);
    return {
      ok: false,
      message: "Couldn't add seats just now. Try again or contact support.",
    };
  }
}

/** Remove one +3 seat pack — blocked if it would drop below current usage. */
export async function removeSeatPack(): Promise<SeatPackResult> {
  const loaded = await loadContext();
  if ("error" in loaded) return { ok: false, message: loaded.error };
  const { ctx } = loaded;

  if (ctx.seatPackQty <= 0) {
    return { ok: false, message: "You don't have any seat packs to remove." };
  }

  // Guard: the new cap must still cover everyone currently seated.
  const supabase = await createSupabaseServerClient();
  const seatsUsed = await getSeatsUsed(supabase, ctx.dsoId);
  const newCap = resolveCaps(ctx.tier, ctx.seatPackQty - 1).maxSeats;
  if (newCap !== null && seatsUsed > newCap) {
    return {
      ok: false,
      message: `You're using ${seatsUsed} seats — removing this pack would drop you to ${newCap}. Remove a teammate or pending invite first.`,
    };
  }

  try {
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(ctx.stripeSubId);
    const existing = subscription.items.data.find((i) =>
      isSeatPackPriceId(i.price?.id)
    );
    if (!existing) {
      // Stripe shows no pack item — reconcile our column to 0.
      await persistAndRevalidate(ctx.dsoId, 0);
      return { ok: true, message: "Seat packs removed." };
    }

    const currentQty = existing.quantity ?? 0;
    if (currentQty <= 1) {
      await stripe.subscriptionItems.del(existing.id, {
        proration_behavior: "create_prorations",
      });
    } else {
      await stripe.subscriptionItems.update(existing.id, {
        quantity: currentQty - 1,
        proration_behavior: "create_prorations",
      });
    }

    const newQty = Math.max(0, ctx.seatPackQty - 1);
    await persistAndRevalidate(ctx.dsoId, newQty);
    return {
      ok: true,
      message: `Removed ${SEAT_PACK_SIZE} seats. A prorated credit will apply to your next invoice.`,
    };
  } catch (err) {
    console.error("[seat-pack] remove failed:", err);
    return {
      ok: false,
      message: "Couldn't remove seats just now. Try again or contact support.",
    };
  }
}
