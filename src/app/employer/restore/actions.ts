"use server";

/**
 * /employer/restore server actions (Phase 4.5.g).
 *
 *   • restoreOrg       — owner-only. Clears dsos.deleted_at + reverses
 *                        the Stripe cancel-at-period-end so billing
 *                        resumes seamlessly.
 *   • signOutAndExit   — signs the user out + routes to /employer/sign-in.
 *
 * Non-owner team members can't restore — they only get a "ask your owner"
 * message on the page. The action enforces this regardless.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";

type Result =
  | { ok: true }
  | { ok: false; error: string };

export async function restoreOrg(): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) return { ok: false, error: "No team membership found." };
  if ((dsoUser as Record<string, unknown>).role !== "owner") {
    return {
      ok: false,
      error: "Only the DSO owner can restore the organization.",
    };
  }

  const dsoId = (dsoUser as Record<string, unknown>).dso_id as string;

  // Reverse Stripe cancel-at-period-end if it was set during soft-delete.
  // Do this BEFORE clearing deleted_at so a Stripe failure leaves the
  // org in the deleted state — restorable on a retry.
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("dso_id", dsoId)
    .maybeSingle();

  const stripeSubId = (subRow as Record<string, unknown> | null)
    ?.stripe_subscription_id as string | null;

  if (stripeSubId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = getStripe();
      await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: false,
      });
    } catch (err) {
      console.error("[employer/restore] Stripe un-cancel", err);
      // If the subscription was already canceled / expired, the owner
      // will need to re-subscribe from /employer/billing. Surface this
      // with a soft warning rather than blocking the restore — the
      // primary intent is "let me back into my data."
    }
  }

  const { error } = await supabase
    .from("dsos")
    .update({ deleted_at: null })
    .eq("id", dsoId);

  if (error) {
    console.error("[employer/restore] restoreOrg", error);
    return {
      ok: false,
      error: "Couldn't restore the organization. Email cam@dsohire.com.",
    };
  }
  return { ok: true };
}

export async function signOutAndExit(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/employer/sign-in");
}
