/**
 * Tool: lookup_subscription_status
 *
 * Returns the asking DSO's current subscription tier + status. Use
 * when the user asks about plan/tier-gated features ("am I on Growth
 * yet?", "does my plan include X?").
 */

import { getActiveSubscription } from "@/lib/billing/subscription";
import type { ToolHandler } from "./types";

export const lookupSubscriptionStatus: ToolHandler = {
  schema: {
    name: "lookup_subscription_status",
    description:
      "Returns the asking user's DSO subscription tier (solo / growth / scale / enterprise) and status (active / trialing / past_due / etc). Use when the user asks about tier-gated features or upgrade questions.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  async run(_input, ctx) {
    if (!ctx.dsoId) {
      return {
        tier: null,
        status: "no_dso",
        note: "Asking user has no DSO membership — they're either a candidate or mid-invite.",
      };
    }

    const sub = await getActiveSubscription(ctx.supabase, ctx.dsoId);
    if (!sub) {
      return {
        tier: null,
        status: "no_subscription",
        note: "DSO has no active subscription record. They may be on a free trial or pre-payment state.",
      };
    }

    return {
      tier: sub.tier,
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end ?? null,
      current_period_end: sub.current_period_end ?? null,
    };
  },
};
