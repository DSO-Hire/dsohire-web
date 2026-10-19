"use server";

/* Pipeline-board server actions, ported from EDC's setDealStage,
   markDealLostInline and createDeal. The board's client calls the first two
   directly and shows the returned {error} inline; New opportunity is a form
   that redirects to the new record. Stage writes share one core with the
   opportunity record (../opportunities/_lib/server.ts). */

import { redirect } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { revalidateOpportunity, writeOpportunityStage } from "../opportunities/_lib/server";

const EXPIRED = "Your CRM session expired. Sign in again with your second factor.";

/* Drag-and-drop drop target, the card's move menu, and Undo. */
export async function setOpportunityStage(id: string, stage: string): Promise<{ error: string | null }> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Missing opportunity." };
  if (typeof stage !== "string" || !stage || stage.length > 40) return { error: "Unknown stage." };
  if (stage === "lost") return { error: "Pick a reason before marking an opportunity lost." };
  const res = await writeOpportunityStage(s, id, stage);
  return { error: res.error };
}

/* The board's Lost drop zone and "Mark lost" menu item. */
export async function markOpportunityLostInline(
  id: string,
  reasonKey: string,
  note: string,
): Promise<{ error: string | null }> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "Missing opportunity." };
  const res = await writeOpportunityStage(s, id, "lost", {
    reason: String(reasonKey ?? ""),
    note: String(note ?? "").trim().slice(0, 2000) || null,
  });
  return { error: res.error };
}

function fail(message: string): never {
  redirect(`/crm/pipeline?error=${encodeURIComponent(message)}#new`);
}

/* New opportunity: on an existing account, or on a new account typed in. */
export async function createOpportunity(fd: FormData) {
  const s = await requireCrmAdmin();
  if (!s) fail(EXPIRED);
  const str = (k: string) => String(fd.get(k) ?? "").trim();
  const name = str("name").replace(/\s+/g, " ").slice(0, 160);
  const accountRaw = str("account_id");
  const newAccount = str("new_account").replace(/\s+/g, " ").slice(0, 160);
  const tier = str("plan_tier");
  const billing = str("billing");
  const mrrRaw = str("mrr").replace(/[$,\s]/g, "");
  const mrr = mrrRaw ? Number(mrrRaw) : null;
  if (mrr !== null && (!Number.isFinite(mrr) || mrr < 0 || mrr > 99_999_999)) fail("Monthly value must be a positive amount.");
  const tc = str("target_close");
  const target_close = /^\d{4}-\d{2}-\d{2}$/.test(tc) ? tc : null;
  /* admin_users is own-row readable, so the only owner to pick is me (or nobody) */
  const owner_id = str("owner_id") === "" ? null : s.me;

  let accountId = UUID_RE.test(accountRaw) ? accountRaw : null;
  let accountName: string | null = null;
  if (accountId) {
    const { data } = await s.supabase.from("crm_accounts").select("id, name").eq("id", accountId).maybeSingle();
    if (!data) fail("That account no longer exists.");
    accountName = String(data.name);
  } else if (newAccount.length >= 2) {
    const { data: existing } = await s.supabase
      .from("crm_accounts")
      .select("id, name")
      .ilike("name", newAccount)
      .is("archived_at", null)
      .limit(1)
      .maybeSingle();
    if (existing) {
      accountId = String(existing.id);
      accountName = String(existing.name);
    } else {
      const res = await s.supabase
        .from("crm_accounts")
        .insert({ name: newAccount, source: "other", owner_id: s.me, created_by: s.me })
        .select("id, name")
        .single();
      if (res.error || !res.data) fail(crmDbMessage(res.error, "The account"));
      accountId = String(res.data.id);
      accountName = String(res.data.name);
      await logCrmEvent(s.supabase, s.me, { account_id: accountId, kind: "import", body: "Account added from the pipeline" });
    }
  } else {
    fail("Pick the account this opportunity is for, or type a new account name.");
  }

  const { data, error } = await s.supabase
    .from("crm_opportunities")
    .insert({
      account_id: accountId,
      name: name || accountName,
      owner_id,
      plan_tier: ["solo", "growth", "scale", "enterprise"].includes(tier) ? tier : null,
      billing: ["monthly", "annual"].includes(billing) ? billing : null,
      mrr,
      target_close,
      notes: str("notes").slice(0, 20000) || null,
      created_by: s.me,
    })
    .select("id")
    .single();
  if (error || !data) fail(crmDbMessage(error, "The opportunity"));
  const id = String(data.id);
  await logCrmEvent(s.supabase, s.me, {
    account_id: accountId!,
    opportunity_id: id,
    kind: "import",
    body: `Opportunity opened: ${name || accountName}`,
  });
  revalidateOpportunity(id, accountId);
  redirect(`/crm/opportunities/${id}`);
}
