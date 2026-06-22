/**
 * Founder command-center snapshot (Tranche 1, Phase 1).
 *
 * Platform-wide aggregates for the /admin "Today" cockpit — modeled on the
 * Vantage hub-metrics shape: service-role reads, flat queries (count head:true
 * or resolve-then-filter; NO nested !inner embeds — they silently no-op under
 * RLS). Aggregate-only; no PII, no EEO. deleted_at filtered on every app table.
 *
 * Fail-safe: any sub-query that errors contributes 0 rather than throwing, so
 * the cockpit renders partial data instead of 500-ing.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { PRICING_TIERS, isPricingTier } from "@/lib/stripe/prices";

export interface NorthStar {
  activeDsos: number;
  pendingDsos: number;
  activeJobs: number;
  searchableCandidates: number;
  applications7d: number;
  applicationsPrev7d: number;
  applications30d: number;
  payingSubscriptions: number;
  trials: number;
  mrrCents: number;
  pageviews7d: number;
}

export interface QueueRow {
  key: string;
  label: string;
  count: number;
  href: string;
  /** "warn" tints rows that need attention (billing/support); "default" otherwise. */
  tone: "default" | "warn";
}

export interface CommandCenterSnapshot {
  northStar: NorthStar;
  queue: QueueRow[];
  trafficSpark: number[];
}

/** Await a head-count query; returns 0 on error so one bad query can't blank the page. */
async function safeCount(q: PromiseLike<unknown>): Promise<number> {
  try {
    const { count, error } = (await q) as {
      count: number | null;
      error: unknown;
    };
    return error ? 0 : count ?? 0;
  } catch {
    return 0;
  }
}

export async function getCommandCenterSnapshot(): Promise<CommandCenterSnapshot> {
  const admin = createSupabaseServiceRoleClient();
  const head = (table: string) =>
    admin.from(table).select("*", { count: "exact", head: true });

  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const d7 = iso(7 * 86_400_000);
  const d14 = iso(14 * 86_400_000);
  const d30 = iso(30 * 86_400_000);

  const [
    activeDsos,
    pendingDsos,
    activeJobs,
    searchableCandidates,
    applications7d,
    applicationsPrev7d,
    applications30d,
    payingSubscriptions,
    trials,
    billingAttention,
    openSupport,
  ] = await Promise.all([
    safeCount(head("dsos").eq("status", "active").is("deleted_at", null)),
    safeCount(head("dsos").eq("status", "pending").is("deleted_at", null)),
    safeCount(head("jobs").eq("status", "active").is("deleted_at", null)),
    safeCount(
      head("candidates").eq("is_searchable", true).is("deleted_at", null),
    ),
    safeCount(head("applications").gte("created_at", d7)),
    safeCount(head("applications").gte("created_at", d14).lt("created_at", d7)),
    safeCount(head("applications").gte("created_at", d30)),
    safeCount(head("subscriptions").eq("status", "active")),
    safeCount(head("subscriptions").eq("status", "trialing")),
    safeCount(head("subscriptions").in("status", ["past_due", "incomplete"])),
    safeCount(head("support_requests").in("status", ["new", "in_progress"])),
  ]);

  // MRR (v1): sum the monthly list price of each active subscription's tier.
  // Approximate — annual plans bill yearly; reconcile against Stripe later.
  let mrrCents = 0;
  try {
    const { data: subs } = await admin
      .from("subscriptions")
      .select("tier")
      .eq("status", "active");
    for (const s of (subs ?? []) as Array<{ tier: string | null }>) {
      if (isPricingTier(s.tier)) {
        mrrCents += PRICING_TIERS[s.tier].monthlyPriceCents;
      }
    }
  } catch {
    /* leave mrrCents at 0 */
  }

  // Daily pageview series (zero-filled) for the traffic spark.
  let trafficSpark: number[] = [];
  let pageviews7d = 0;
  try {
    const { data, error } = await admin.rpc("vantage_daily_pageviews", {
      p_days: 14,
    });
    if (!error && Array.isArray(data)) {
      trafficSpark = data.map((r) => Number(r.pageviews ?? 0));
      pageviews7d = trafficSpark.slice(-7).reduce((a, b) => a + b, 0);
    }
  } catch {
    /* no spark */
  }

  const queue: QueueRow[] = [
    {
      key: "pending_dsos",
      label: "DSOs pending verification",
      count: pendingDsos,
      href: "/admin/dsos?status=pending",
      tone: "default",
    },
    {
      key: "billing_attention",
      label: "Subscriptions past-due / incomplete",
      count: billingAttention,
      href: "/admin/dsos",
      tone: "warn",
    },
    {
      key: "open_support",
      label: "Open support requests",
      count: openSupport,
      href: "/admin/support/conversations",
      tone: "warn",
    },
  ];

  return {
    northStar: {
      activeDsos,
      pendingDsos,
      activeJobs,
      searchableCandidates,
      applications7d,
      applicationsPrev7d,
      applications30d,
      payingSubscriptions,
      trials,
      mrrCents,
      pageviews7d,
    },
    queue,
    trafficSpark,
  };
}
