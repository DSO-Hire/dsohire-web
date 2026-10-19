/**
 * Stripe -> CRM sync (2026-10-19). When a DSO pays, the CRM closes the deal
 * on its own: the matching account becomes a Customer linked to the DSO,
 * the furthest-along open opportunity is marked Won with the real plan and
 * MRR, and the timeline gets a "won" entry. Plan changes update the won
 * opportunity; a cancellation marks the account Churned.
 *
 * Server only. Called from the Stripe webhook (with the service-role
 * client) and from the CRM's manual "Link to DSO" action (also with the
 * service-role client, after requireCrmAdmin passed). The crm_* tables
 * FORCE row level security, but FORCE only stops the table OWNER from
 * skipping policies; a role with BYPASSRLS skips them regardless. Supabase's
 * service_role has rolbypassrls = true and full grants on the crm tables
 * (verified on prod 2026-10-19), so these writes go through.
 *
 * Idempotent: Stripe redelivers events and sends several per checkout.
 *  - A "won" event carries meta.subscription_id; once one exists for this
 *    subscription the won path never runs again.
 *  - Every state change is a conditional update (stage <> 'won', the old
 *    plan values, status <> 'churned'), and the timeline entry is written
 *    only when that update actually changed a row, so two concurrent
 *    deliveries log once.
 *  - A newly created won opportunity checks for a sibling created by a
 *    concurrent delivery and removes itself if it lost the race.
 *  - Account creation leans on the unique index on crm_accounts.dso_id.
 *
 * Callers must treat every function here as best-effort: wrap in try/catch
 * so a CRM problem can never fail a payment.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PRICING_TIERS, isPricingTier, type BillingPeriod, type PricingTier } from "@/lib/stripe/prices";
import { findAccountMatch, pickOpportunityToWin } from "./match";

// The project's Supabase clients are untyped; accept any of them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface SubscriptionSyncInput {
  dsoId: string;
  tier: PricingTier | string | null;
  billing: BillingPeriod | null;
  /** Stripe subscription status (active, trialing, past_due, canceled, ...). */
  status: string;
  /** Actual monthly value in dollars, when known from the Stripe price. */
  mrr: number | null;
  stripeSubscriptionId: string | null;
  /** auth user id for crm_events.created_by; null = system (Stripe). */
  actorId?: string | null;
  /** "stripe" from the webhook, "link" from the manual link action. */
  via?: "stripe" | "link";
  /** Skip demo DSOs (default true). */
  skipDemo?: boolean;
}

export type SyncResult =
  | { action: "skipped"; reason: string }
  | { action: "won" | "created_won" | "plan_changed" | "unchanged" | "churned"; accountId: string };

const PAID = new Set(["active", "trialing"]);
const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

const PLAN_NAME: Record<string, string> = { solo: "Solo", growth: "Growth", scale: "Scale", enterprise: "Enterprise" };

type DsoRow = {
  id: string;
  name: string;
  website: string | null;
  headquarters_state: string | null;
  practice_count: number | null;
  is_demo: boolean | null;
  deleted_at: string | null;
};

type AccountRow = { id: string; name: string; website: string | null; status: string; dso_id: string | null };

type OppRow = {
  id: string;
  name: string;
  stage: string;
  custom_stages: string[] | null;
  plan_tier: string | null;
  billing: string | null;
  mrr: number | string | null;
  stage_changed_at: string | null;
  created_at: string | null;
  won_at: string | null;
  created_by: string | null;
};

function listMonthly(tier: string | null, billing: string | null): number | null {
  if (!tier || !isPricingTier(tier)) return null;
  const t = PRICING_TIERS[tier];
  return billing === "annual" ? t.annualMonthlyEquivalent : t.monthlyPrice;
}

function planText(tier: string | null, billing: string | null, mrr: number | null): string {
  const parts = [tier ? PLAN_NAME[tier] ?? tier : "Plan", billing ?? null, mrr !== null ? `$${mrr.toLocaleString("en-US")}/mo` : null];
  return parts.filter(Boolean).join(", ");
}

function numOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

async function insertEvent(
  db: Db,
  ev: {
    account_id: string;
    opportunity_id?: string | null;
    kind: "won" | "field_change";
    body: string;
    meta: Record<string, unknown>;
    actorId: string | null;
  },
): Promise<void> {
  const { error } = await db.from("crm_events").insert({
    account_id: ev.account_id,
    opportunity_id: ev.opportunity_id ?? null,
    contact_id: null,
    kind: ev.kind,
    body: ev.body,
    meta: ev.meta,
    occurred_at: new Date().toISOString(),
    created_by: ev.actorId,
  });
  if (error) throw new Error(`crm_events insert failed: ${error.message}`);
}

/* ---------------- account resolution ---------------- */

async function findLinkedAccount(db: Db, dsoId: string): Promise<AccountRow | null> {
  const { data, error } = await db
    .from("crm_accounts")
    .select("id, name, website, status, dso_id")
    .eq("dso_id", dsoId)
    .maybeSingle();
  if (error) throw new Error(`crm_accounts lookup failed: ${error.message}`);
  return (data as AccountRow | null) ?? null;
}

async function resolveAccount(db: Db, dso: DsoRow, actorId: string | null): Promise<AccountRow> {
  const linked = await findLinkedAccount(db, dso.id);
  if (linked) return linked;

  // Conservative auto-match against unlinked, live accounts.
  const { data: candidates, error } = await db
    .from("crm_accounts")
    .select("id, name, website, status, dso_id")
    .is("dso_id", null)
    .is("archived_at", null)
    .limit(5000);
  if (error) throw new Error(`crm_accounts candidates failed: ${error.message}`);
  const match = findAccountMatch(dso, (candidates ?? []) as AccountRow[]);
  if (match) {
    const { data: upd, error: linkErr } = await db
      .from("crm_accounts")
      .update({ dso_id: dso.id, updated_at: new Date().toISOString() })
      .eq("id", match.id)
      .is("dso_id", null)
      .select("id, name, website, status, dso_id");
    if (!linkErr && upd && upd.length) return upd[0] as AccountRow;
    // Lost a race (someone linked this DSO or this account meanwhile).
    const again = await findLinkedAccount(db, dso.id);
    if (again) return again;
    // Account got linked to another DSO: fall through and create.
  }

  const base = {
    website: dso.website,
    hq_state: dso.headquarters_state ? dso.headquarters_state.slice(0, 40) : null,
    locations:
      dso.practice_count !== null && dso.practice_count >= 0 && dso.practice_count <= 5000 ? dso.practice_count : null,
    source: "inbound",
    status: "customer",
    dso_id: dso.id,
    created_by: actorId,
  };
  const name = (dso.name || "DSO Hire customer").slice(0, 160);
  for (const candidateName of [name, `${name.slice(0, 145)} (DSO Hire)`]) {
    const { data: ins, error: insErr } = await db
      .from("crm_accounts")
      .insert({ ...base, name: candidateName })
      .select("id, name, website, status, dso_id")
      .single();
    if (!insErr && ins) {
      await insertEvent(db, {
        account_id: (ins as AccountRow).id,
        kind: "field_change",
        body: "Account created from a DSO Hire subscription",
        meta: { field: "account", from: null, to: "created", via: "stripe", dso_id: dso.id },
        actorId,
      }).catch(() => undefined);
      return ins as AccountRow;
    }
    if (insErr?.code !== "23505") throw new Error(`crm_accounts insert failed: ${insErr?.message}`);
    // Unique violation: either a concurrent delivery created the linked
    // account (dso_id index) or the name is taken by another live account.
    const again = await findLinkedAccount(db, dso.id);
    if (again) return again;
  }
  throw new Error(`could not create a CRM account for dso ${dso.id}`);
}

/* ---------------- public API ---------------- */

export async function syncCrmFromSubscription(db: Db, input: SubscriptionSyncInput): Promise<SyncResult> {
  const status = String(input.status || "");
  if (ENDED.has(status)) return syncCrmOnCancel(db, { dsoId: input.dsoId, actorId: input.actorId, via: input.via });
  if (!PAID.has(status)) return { action: "skipped", reason: `status ${status}` };

  const actorId = input.actorId ?? null;
  const via = input.via ?? "stripe";
  const subId = input.stripeSubscriptionId ?? null;
  const tier = input.tier && isPricingTier(input.tier) ? input.tier : null;
  const billing = input.billing ?? null;
  const mrr = numOrNull(input.mrr) ?? listMonthly(tier, billing);

  const { data: dsoData, error: dsoErr } = await db
    .from("dsos")
    .select("id, name, website, headquarters_state, practice_count, is_demo, deleted_at")
    .eq("id", input.dsoId)
    .maybeSingle();
  if (dsoErr) throw new Error(`dsos lookup failed: ${dsoErr.message}`);
  const dso = dsoData as DsoRow | null;
  if (!dso) return { action: "skipped", reason: "dso not found" };
  if ((input.skipDemo ?? true) && dso.is_demo) return { action: "skipped", reason: "demo dso" };

  const account = await resolveAccount(db, dso, actorId);
  const now = new Date().toISOString();

  // Customer status (a resubscribe from churned is worth a timeline line).
  if (account.status !== "customer") {
    const { data: upd } = await db
      .from("crm_accounts")
      .update({ status: "customer", updated_at: now })
      .eq("id", account.id)
      .neq("status", "customer")
      .select("id");
    if (upd && upd.length && account.status === "churned") {
      await insertEvent(db, {
        account_id: account.id,
        kind: "field_change",
        body: "Subscription restarted",
        meta: { field: "status", from: "churned", to: "customer", via },
        actorId,
      });
    }
  }

  const { data: oppData, error: oppErr } = await db
    .from("crm_opportunities")
    .select("id, name, stage, custom_stages, plan_tier, billing, mrr, stage_changed_at, created_at, won_at, created_by")
    .eq("account_id", account.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (oppErr) throw new Error(`crm_opportunities lookup failed: ${oppErr.message}`);
  const opps = (oppData ?? []) as OppRow[];

  // Already closed for this subscription? Then only plan changes matter.
  let wonEventOppId: string | null = null;
  let alreadyWonForSub = false;
  if (subId) {
    const { data: evs } = await db
      .from("crm_events")
      .select("id, opportunity_id")
      .eq("account_id", account.id)
      .eq("kind", "won")
      .eq("meta->>subscription_id", subId)
      .limit(1);
    if (evs && evs.length) {
      alreadyWonForSub = true;
      wonEventOppId = (evs[0] as { opportunity_id: string | null }).opportunity_id;
    }
  }

  const planFields = { plan_tier: tier, billing, mrr };
  const wonMeta = (from: string | null) => ({ from, to: "won", via, subscription_id: subId, plan_tier: tier, billing, mrr });

  if (!alreadyWonForSub) {
    const target = pickOpportunityToWin(opps);
    if (target) {
      const { data: upd, error: updErr } = await db
        .from("crm_opportunities")
        .update({ stage: "won", stage_changed_at: now, won_at: now, updated_at: now, ...planFields })
        .eq("id", target.id)
        .not("stage", "in", "(won,lost)")
        .select("id");
      if (updErr) throw new Error(`crm_opportunities win failed: ${updErr.message}`);
      if (upd && upd.length) {
        await insertEvent(db, {
          account_id: account.id,
          opportunity_id: target.id,
          kind: "won",
          body: `Won: subscribed to ${planText(tier, billing, mrr)}`,
          meta: wonMeta(target.stage),
          actorId,
        });
        return { action: "won", accountId: account.id };
      }
      // A concurrent delivery won it first; nothing more to do.
      return { action: "unchanged", accountId: account.id };
    }

    const hasWon = opps.some((o) => o.stage === "won");
    if (!hasWon) {
      const { data: ins, error: insErr } = await db
        .from("crm_opportunities")
        .insert({
          account_id: account.id,
          name: account.name.slice(0, 160),
          stage: "won",
          stage_changed_at: now,
          won_at: now,
          close_probability: 100,
          created_by: actorId,
          ...planFields,
        })
        .select("id, created_at")
        .single();
      if (insErr || !ins) throw new Error(`crm_opportunities insert failed: ${insErr?.message}`);
      const mine = ins as { id: string; created_at: string };
      // Concurrent deliveries can both get here; keep only the oldest.
      const { data: siblings } = await db
        .from("crm_opportunities")
        .select("id, created_at")
        .eq("account_id", account.id)
        .eq("stage", "won")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      const first = ((siblings ?? []) as { id: string }[])[0];
      if (first && first.id !== mine.id) {
        await db.from("crm_opportunities").delete().eq("id", mine.id);
        return { action: "unchanged", accountId: account.id };
      }
      await insertEvent(db, {
        account_id: account.id,
        opportunity_id: mine.id,
        kind: "won",
        body: `Won: subscribed to ${planText(tier, billing, mrr)}`,
        meta: wonMeta(null),
        actorId,
      });
      return { action: "created_won", accountId: account.id };
    }
    // Already won (by hand before the payment landed, or an earlier
    // subscription): record this subscription against the latest won
    // opportunity once, so later deliveries take the plan-sync path and
    // never close a newer open opportunity, then sync its plan fields.
    const latestWon = [...opps.filter((o) => o.stage === "won")].sort(
      (x, y) => (Date.parse(y.won_at ?? "") || 0) - (Date.parse(x.won_at ?? "") || 0),
    )[0];
    if (latestWon && subId) {
      await insertEvent(db, {
        account_id: account.id,
        opportunity_id: latestWon.id,
        kind: "won",
        body: `Payment confirmed: subscribed to ${planText(tier, billing, mrr)}`,
        meta: wonMeta("won"),
        actorId,
      });
      wonEventOppId = latestWon.id;
    }
  }

  // Plan sync on the won opportunity tied to this subscription (else the
  // most recently won one). On a first confirmation of a hand-won deal the
  // "won" line above already tells the story, so the plan update is quiet.
  const quietPlanUpdate = !alreadyWonForSub;
  const won = opps.filter((o) => o.stage === "won");
  const target =
    (wonEventOppId ? won.find((o) => o.id === wonEventOppId) : undefined) ??
    [...won].sort((x, y) => (Date.parse(y.won_at ?? "") || 0) - (Date.parse(x.won_at ?? "") || 0))[0];
  if (!target) return { action: "unchanged", accountId: account.id };

  const oldMrr = numOrNull(target.mrr);
  const changed = target.plan_tier !== tier || target.billing !== billing || oldMrr !== mrr;
  if (!changed || tier === null) return { action: "unchanged", accountId: account.id };

  let q = db.from("crm_opportunities").update({ ...planFields, updated_at: now }).eq("id", target.id);
  q = target.plan_tier === null ? q.is("plan_tier", null) : q.eq("plan_tier", target.plan_tier);
  q = target.billing === null ? q.is("billing", null) : q.eq("billing", target.billing);
  q = oldMrr === null ? q.is("mrr", null) : q.eq("mrr", oldMrr);
  const { data: upd, error: updErr } = await q.select("id");
  if (updErr) throw new Error(`crm_opportunities plan update failed: ${updErr.message}`);
  if (!upd || !upd.length) return { action: "unchanged", accountId: account.id };
  if (quietPlanUpdate) return { action: "won", accountId: account.id };

  await insertEvent(db, {
    account_id: account.id,
    opportunity_id: target.id,
    kind: "field_change",
    body: `Plan changed: ${planText(target.plan_tier, target.billing, oldMrr)} to ${planText(tier, billing, mrr)}`,
    meta: {
      field: "plan",
      from: { plan_tier: target.plan_tier, billing: target.billing, mrr: oldMrr },
      to: { plan_tier: tier, billing, mrr },
      via,
      subscription_id: subId,
    },
    actorId,
  });
  return { action: "plan_changed", accountId: account.id };
}

export async function syncCrmOnCancel(
  db: Db,
  input: { dsoId: string; actorId?: string | null; via?: "stripe" | "link" },
): Promise<SyncResult> {
  const account = await findLinkedAccount(db, input.dsoId);
  if (!account) return { action: "skipped", reason: "no linked account" };
  if (account.status === "churned") return { action: "unchanged", accountId: account.id };

  const { data: upd, error } = await db
    .from("crm_accounts")
    .update({ status: "churned", updated_at: new Date().toISOString() })
    .eq("id", account.id)
    .neq("status", "churned")
    .select("id");
  if (error) throw new Error(`crm_accounts churn failed: ${error.message}`);
  if (!upd || !upd.length) return { action: "unchanged", accountId: account.id };

  await insertEvent(db, {
    account_id: account.id,
    kind: "field_change",
    body: "Subscription canceled",
    meta: { field: "status", from: account.status, to: "churned", via: input.via ?? "stripe" },
    actorId: input.actorId ?? null,
  });
  return { action: "churned", accountId: account.id };
}
