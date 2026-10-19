"use server";

/* Proposals (crm_quotes, 2026-10-19). A proposal is one plan, one billing
   choice and one monthly price for one opportunity, printable from
   /crm/opportunities/[id]/proposal/[quoteId]. Pricing is value-led with no
   discounts: every plan quotes its list price from prices.ts (via
   planMonthly); only Enterprise takes a custom monthly figure.

   Every action re-checks the caller (superadmin + aal2) and returns {error}
   for the record's Proposals card to show inline; RLS enforces the same
   rule again underneath. Marking a proposal sent logs an email event and,
   when the opportunity is still before the Proposal stage, moves it there
   through writeOpportunityStage, the same core the pipeline uses, so the
   stage_change event matches every other stage move. Accepted only logs a
   note: the Stripe payment is what wins the deal. */

import { requireCrmAdmin } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { isBillingPeriod, isPricingTier } from "@/lib/stripe/prices";
import { PLAN_LABELS, effectiveStages, planMonthly, todayIso } from "../format";
import { revalidateOpportunity, writeOpportunityStage } from "./_lib/server";

type Result = { error: string | null };

const EXPIRED = "Your CRM session expired. Sign in again with your second factor.";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ["draft", "sent", "accepted", "declined", "expired"] as const;
type QuoteStatus = (typeof STATUSES)[number];

export type QuoteInput = {
  opportunity_id: string;
  plan_tier: string;
  billing: string;
  monthly_price?: string | number | null;
  locations?: string | number | null;
  contact_id?: string | null;
  valid_until: string;
  intro?: string | null;
  notes?: string | null;
};

function textOrNull(v: unknown, max: number): string | null {
  const t = String(v ?? "").trim();
  return t ? t.slice(0, max) : null;
}

export async function createQuote(input: QuoteInput): Promise<Result & { id?: string; number?: number }> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (!input || typeof input !== "object") return { error: "Nothing to save." };
  const oppId = String(input.opportunity_id ?? "");
  if (!UUID_RE.test(oppId)) return { error: "Missing opportunity." };

  const plan = String(input.plan_tier ?? "");
  const billing = String(input.billing ?? "");
  if (!isPricingTier(plan)) return { error: "Pick a plan." };
  if (!isBillingPeriod(billing)) return { error: "Pick monthly or annual billing." };
  const list = planMonthly(plan, billing);
  if (list === null) return { error: "That plan has no list price." };

  /* List price for every plan; Enterprise alone may carry a custom figure. */
  let price = list;
  if (plan === "enterprise") {
    const raw = String(input.monthly_price ?? "").replace(/[$,\s]/g, "");
    if (raw) {
      const v = Number(raw);
      if (!Number.isFinite(v) || v <= 0 || v > 1_000_000)
        return { error: "Enterprise price per month must be between $1 and $1,000,000." };
      price = Math.round(v * 100) / 100;
    }
  }

  let locations: number | null = null;
  const locRaw = String(input.locations ?? "").replace(/[,\s]/g, "");
  if (locRaw) {
    const v = Number(locRaw);
    if (!Number.isInteger(v) || v < 1 || v > 5000) return { error: "Locations must be a whole number from 1 to 5,000." };
    locations = v;
  }

  const validUntil = String(input.valid_until ?? "").trim();
  if (!DATE.test(validUntil) || !Number.isFinite(Date.parse(validUntil)))
    return { error: "Valid until is not a valid date." };
  if (validUntil < todayIso()) return { error: "Valid until is in the past." };

  const { data: opp, error: oppErr } = await s.supabase
    .from("crm_opportunities")
    .select("id, account_id")
    .eq("id", oppId)
    .maybeSingle();
  if (oppErr) return { error: crmDbMessage(oppErr, "The proposal") };
  if (!opp) return { error: "That opportunity no longer exists." };
  const accountId = String(opp.account_id);

  let contactId: string | null = null;
  const cRaw = String(input.contact_id ?? "");
  if (cRaw) {
    if (!UUID_RE.test(cRaw)) return { error: "Unknown contact." };
    const { data: c } = await s.supabase
      .from("crm_contacts")
      .select("id")
      .eq("id", cRaw)
      .eq("account_id", accountId)
      .maybeSingle();
    if (!c) return { error: "That contact is not on this account." };
    contactId = cRaw;
  }

  const { data: row, error } = await s.supabase
    .from("crm_quotes")
    .insert({
      opportunity_id: oppId,
      account_id: accountId,
      contact_id: contactId,
      plan_tier: plan,
      billing,
      monthly_price: price,
      locations,
      valid_until: validUntil,
      intro: textOrNull(input.intro, 2000),
      notes: textOrNull(input.notes, 2000),
      status: "draft",
      created_by: s.me,
    })
    .select("id, number")
    .single();
  if (error) return { error: crmDbMessage(error, "The proposal") };
  revalidateOpportunity(oppId, accountId);
  return { error: null, id: String(row.id), number: Number(row.number) };
}

export async function setQuoteStatus(id: string, status: string): Promise<Result> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Missing proposal." };
  if (!(STATUSES as readonly string[]).includes(status)) return { error: "Unknown proposal status." };
  const to = status as QuoteStatus;

  const { data: q, error: readErr } = await s.supabase
    .from("crm_quotes")
    .select("id, number, status, opportunity_id, account_id, contact_id, plan_tier, billing, monthly_price")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: crmDbMessage(readErr, "The proposal") };
  if (!q) return { error: "That proposal no longer exists." };
  const from = String(q.status);
  if (from === to) return { error: null };

  const oppId = String(q.opportunity_id);
  const accountId = String(q.account_id);
  const num = Number(q.number);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "sent") patch.sent_at = now;
  const { error } = await s.supabase.from("crm_quotes").update(patch).eq("id", id);
  if (error) return { error: crmDbMessage(error, "The proposal") };

  const plan = PLAN_LABELS[String(q.plan_tier)] ?? String(q.plan_tier);
  const price = `$${Number(q.monthly_price).toLocaleString("en-US")}/mo`;
  const meta = { quote_id: id, quote_number: num, status_from: from, status_to: to };
  let after: string | null = null;

  if (to === "sent") {
    const ev = await logCrmEvent(s.supabase, s.me, {
      account_id: accountId,
      opportunity_id: oppId,
      contact_id: (q.contact_id as string | null) ?? null,
      kind: "email",
      body: `Sent proposal #${num}: ${plan}, ${price}, billed ${q.billing === "annual" ? "annually" : "monthly"}`,
      meta,
    });
    if (ev.error) after = `Marked sent, but the timeline entry was not logged: ${ev.error}`;

    /* Move the opportunity up to Proposal when it is still before it. */
    const { data: opp } = await s.supabase
      .from("crm_opportunities")
      .select("stage, custom_stages")
      .eq("id", oppId)
      .maybeSingle();
    if (opp) {
      const stages = effectiveStages(opp.custom_stages as string[] | null);
      const cur = stages.indexOf(String(opp.stage));
      const target = stages.indexOf("proposal");
      if (target >= 0 && cur >= 0 && cur < target) {
        const moved = await writeOpportunityStage(s, oppId, "proposal");
        if (moved.error && !after) after = `Marked sent, but the stage did not move to Proposal: ${moved.error}`;
      }
    }
  } else if (to === "accepted" || to === "declined") {
    const ev = await logCrmEvent(s.supabase, s.me, {
      account_id: accountId,
      opportunity_id: oppId,
      contact_id: (q.contact_id as string | null) ?? null,
      kind: "note",
      body:
        to === "accepted"
          ? `Proposal #${num} accepted (${plan}, ${price}). The deal wins when the subscription payment goes through.`
          : `Proposal #${num} declined (${plan}, ${price}).`,
      meta,
    });
    if (ev.error) after = `Status saved, but the timeline entry was not logged: ${ev.error}`;
  }

  revalidateOpportunity(oppId, accountId);
  return { error: after };
}

export async function deleteQuote(id: string): Promise<Result> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Missing proposal." };
  const { data: q, error: readErr } = await s.supabase
    .from("crm_quotes")
    .select("id, status, opportunity_id, account_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: crmDbMessage(readErr, "The proposal") };
  if (!q) return { error: null };
  if (q.status !== "draft") return { error: "Only draft proposals can be deleted. Mark it expired or declined instead." };
  const { error } = await s.supabase.from("crm_quotes").delete().eq("id", id).eq("status", "draft");
  if (error) return { error: crmDbMessage(error, "The delete") };
  revalidateOpportunity(String(q.opportunity_id), String(q.account_id));
  return { error: null };
}
