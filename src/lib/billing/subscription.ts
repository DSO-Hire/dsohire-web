/**
 * Billing helpers — feature gating around subscription status.
 *
 * The single source of truth for "can this DSO use paid features right now?"
 * is `getActiveSubscription`. Currently active means status in
 * ('active', 'trialing'). past_due is treated as not-active for feature
 * gating but the user still sees the row in /employer/billing so they can
 * fix their card.
 *
 * Usage:
 *   const supabase = await createSupabaseServerClient();
 *   const sub = await getActiveSubscription(supabase, dsoUser.dso_id);
 *   if (!sub) redirect("/employer/billing");
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface SubscriptionSummary {
  id: string;
  tier: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Returns the subscription row IF its status currently allows paid feature
 * use. Otherwise returns null. Use this before any feature that should be
 * gated behind a working subscription (post a job, edit a job, etc.).
 */
export async function getActiveSubscription(
  supabase: SupabaseClient,
  dsoId: string
): Promise<SubscriptionSummary | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("id, tier, status, current_period_end, cancel_at_period_end")
    .eq("dso_id", dsoId)
    .maybeSingle();

  if (!data) return null;
  const status = data.status as string;
  if (!ACTIVE_STATUSES.has(status)) return null;

  return {
    id: data.id as string,
    tier: data.tier as string,
    status,
    current_period_end: (data.current_period_end as string | null) ?? null,
    cancel_at_period_end: (data.cancel_at_period_end as boolean) ?? false,
  };
}

/**
 * Returns the subscription row regardless of status — for surfaces that
 * need to know "what's the state?" not "can they do X?". The dashboard's
 * billing banner uses this so it can render different copy for past_due
 * vs incomplete vs canceled.
 */
export async function getSubscriptionAnyStatus(
  supabase: SupabaseClient,
  dsoId: string
): Promise<SubscriptionSummary | null> {
  const { data } = await supabase
    .from("subscriptions")
    .select("id, tier, status, current_period_end, cancel_at_period_end")
    .eq("dso_id", dsoId)
    .maybeSingle();

  if (!data) return null;
  return {
    id: data.id as string,
    tier: data.tier as string,
    status: data.status as string,
    current_period_end: (data.current_period_end as string | null) ?? null,
    cancel_at_period_end: (data.cancel_at_period_end as boolean) ?? false,
  };
}

/**
 * Helper for server actions that need to fail-fast when the user tries to
 * mutate something requiring an active subscription. Returns an error
 * string if blocked, null if OK to proceed.
 */
export async function requireActiveSubscriptionError(
  supabase: SupabaseClient,
  dsoId: string
): Promise<string | null> {
  const sub = await getActiveSubscription(supabase, dsoId);
  if (sub) return null;
  return "Your subscription isn't active. Visit Billing to activate or update payment.";
}
