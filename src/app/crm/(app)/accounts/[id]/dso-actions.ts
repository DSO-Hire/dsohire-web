"use server";

/* Link / unlink a CRM account to a DSO Hire customer (2026-10-19). Both
   re-verify the caller (superadmin + aal2) and write through the session
   client, so RLS enforces the same rule underneath. Linking a DSO that
   already pays runs the same sync the Stripe webhook runs, so the account
   turns Customer and the open opportunity closes Won. That sync and the
   subscription read use the service-role client, only after the CRM gate
   passed (subscriptions has no CRM read policy). */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { syncCrmFromSubscription } from "@/lib/crm/stripe-sync";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { isPricingTier, periodFromStripePriceId } from "@/lib/stripe/prices";

function back(id: string, error?: string): never {
  redirect(error ? `/crm/accounts/${id}?error=${encodeURIComponent(error.slice(0, 400))}` : `/crm/accounts/${id}`);
}

export async function linkAccountToDso(fd: FormData): Promise<void> {
  const accountId = String(fd.get("account_id") ?? "");
  const dsoId = String(fd.get("dso_id") ?? "");
  if (!UUID_RE.test(accountId)) redirect("/crm/accounts");
  if (!UUID_RE.test(dsoId)) back(accountId, "Pick a DSO to link.");
  const s = await requireCrmAdmin();
  if (!s) back(accountId, "Your CRM session expired. Sign in again with your second factor.");

  const [{ data: acct }, { data: dso }] = await Promise.all([
    s.supabase.from("crm_accounts").select("id, name, dso_id, archived_at").eq("id", accountId).maybeSingle(),
    s.supabase.from("dsos").select("id, name, is_demo, deleted_at").eq("id", dsoId).maybeSingle(),
  ]);
  const a = acct as { id: string; name: string; dso_id: string | null; archived_at: string | null } | null;
  const d = dso as { id: string; name: string; is_demo: boolean | null; deleted_at: string | null } | null;
  if (!a) redirect("/crm/accounts");
  if (a.archived_at) back(accountId, "Restore the account before linking it.");
  if (a.dso_id) back(accountId, "This account is already linked. Unlink it first.");
  if (!d || d.deleted_at) back(accountId, "That DSO was not found.");
  if (d.is_demo) back(accountId, "Demo DSOs cannot be linked.");

  const { data: upd, error } = await s.supabase
    .from("crm_accounts")
    .update({ dso_id: dsoId, updated_at: new Date().toISOString() })
    .eq("id", accountId)
    .is("dso_id", null)
    .select("id");
  if (error) {
    back(accountId, error.code === "23505" ? `${d.name} is already linked to another account.` : crmDbMessage(error, "The link"));
  }
  if (!upd || !upd.length) back(accountId, "This account was linked by someone else meanwhile. Refresh and check.");

  await logCrmEvent(s.supabase, s.me, {
    account_id: accountId,
    kind: "field_change",
    body: `Linked to DSO Hire customer ${d.name}`,
    meta: { field: "dso", from: null, to: dsoId, via: "manual" },
  });

  // Already paying (or already canceled)? Bring the CRM in line now.
  try {
    const admin = createSupabaseServiceRoleClient();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("tier, status, stripe_price_id, stripe_subscription_id")
      .eq("dso_id", dsoId)
      .maybeSingle();
    const row = sub as { tier: string | null; status: string | null; stripe_price_id: string | null; stripe_subscription_id: string | null } | null;
    if (row?.status) {
      await syncCrmFromSubscription(admin, {
        dsoId,
        tier: isPricingTier(row.tier) ? row.tier : null,
        billing: row.stripe_price_id ? periodFromStripePriceId(row.stripe_price_id) : null,
        status: row.status,
        mrr: null, // list price for the plan; the next Stripe event fills the exact amount
        stripeSubscriptionId: row.stripe_subscription_id,
        actorId: s.me,
        via: "link",
      });
    }
  } catch (e) {
    console.error(`[crm] sync after linking ${accountId} to dso ${dsoId} failed`, e);
    revalidatePath(`/crm/accounts/${accountId}`);
    back(accountId, "Linked, but the subscription sync failed. The next Stripe event will retry it.");
  }

  revalidatePath(`/crm/accounts/${accountId}`);
  revalidatePath("/crm/accounts");
  revalidatePath("/crm/pipeline");
  back(accountId);
}

export async function unlinkAccountFromDso(fd: FormData): Promise<void> {
  const accountId = String(fd.get("account_id") ?? "");
  if (!UUID_RE.test(accountId)) redirect("/crm/accounts");
  const s = await requireCrmAdmin();
  if (!s) back(accountId, "Your CRM session expired. Sign in again with your second factor.");

  const { data: acct } = await s.supabase.from("crm_accounts").select("id, dso_id").eq("id", accountId).maybeSingle();
  const a = acct as { id: string; dso_id: string | null } | null;
  if (!a) redirect("/crm/accounts");
  if (!a.dso_id) back(accountId);

  const { error } = await s.supabase
    .from("crm_accounts")
    .update({ dso_id: null, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) back(accountId, crmDbMessage(error, "The unlink"));

  await logCrmEvent(s.supabase, s.me, {
    account_id: accountId,
    kind: "field_change",
    body: "Unlinked from its DSO Hire customer",
    meta: { field: "dso", from: a.dso_id, to: null, via: "manual" },
  });

  revalidatePath(`/crm/accounts/${accountId}`);
  back(accountId);
}
