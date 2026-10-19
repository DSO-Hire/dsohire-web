"use server";

/*
 * Inbox actions (2026-10-19), ported from the EDC CRM's lead triage
 * (sellers/actions.ts setLeadStatus / assignLead / bulkTriage /
 * attachSubmissionToSeller) and convertSubmission (actions.ts).
 *
 * marketing_leads stays read-only: every triage fact lives in
 * crm_lead_triage. Each action re-checks the caller (superadmin + aal2),
 * then RLS enforces the same rule underneath. Failures bounce back to the
 * inbox with ?error= so ActionError can say what did not save.
 *
 * "use server" rule: this module exports only async functions.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmAdmin, type CrmSession } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { LEAD_KIND_LABELS, SALES_LEAD_KINDS, channelOf, demoKeyOf } from "../format";
import {
  DQ_REASON,
  LEAD_SELECT,
  SETTABLE_TRIAGE,
  contextSentence,
  ilikeExact,
  leadDemoFor,
  leadEmail,
  leadLocations,
  leadMessage,
  leadPhone,
  safeReturnQs,
  type Lead,
} from "./lib";

const INBOX = "/crm/inbox";

type Supa = CrmSession["supabase"];

function backOf(formData: FormData): string {
  const qs = safeReturnQs(formData.get("return_qs"));
  return qs ? `${INBOX}?${qs}` : INBOX;
}

function fail(back: string, msg: string): never {
  redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
}

async function session(back: string): Promise<CrmSession> {
  const s = await requireCrmAdmin();
  if (!s) fail(back, "Your CRM session expired. Sign in again with your second factor.");
  return s;
}

/* Owners: me, or nobody. Other admins' rows in admin_users are not
   readable from an admin session, so an id we cannot verify is refused. */
function ownerFrom(raw: unknown, me: string): string | null | undefined {
  const v = String(raw ?? "").trim();
  if (!v) return undefined;
  if (v === "none") return null;
  if (v === "me" || v === me) return me;
  return undefined;
}

type TriagePrev = {
  lead_id: string;
  status: string;
  status_changed_at: string | null;
  first_contacted_at: string | null;
};

function statusPatch(prev: TriagePrev | undefined, status: string, reason: string | null, now: string) {
  const changed = (prev?.status ?? "new") !== status;
  return {
    status,
    disqualify_reason: status === "disqualified" ? reason : null,
    status_changed_at: changed ? now : (prev?.status_changed_at ?? now),
    first_contacted_at:
      prev?.first_contacted_at ?? (status === "contacted" || status === "qualified" ? now : null),
  };
}

function revalidateInbox() {
  revalidatePath(INBOX);
  revalidatePath("/crm", "layout");
}

/* ---------------- single-lead status ---------------- */

export async function setLeadStatus(formData: FormData) {
  const back = backOf(formData);
  const { supabase } = await session(back);
  const lead_id = String(formData.get("lead_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!UUID_RE.test(lead_id)) fail(back, "That lead is not valid.");
  if (!SETTABLE_TRIAGE.includes(status)) fail(back, "Pick New, Contacted, Qualified or Disqualified.");
  const reason = String(formData.get("disqualify_reason") ?? "") || null;
  if (status === "disqualified" && (!reason || !(reason in DQ_REASON))) fail(back, "Pick a reason to disqualify.");

  const { data: prev, error: readErr } = await supabase
    .from("crm_lead_triage")
    .select("lead_id, status, status_changed_at, first_contacted_at")
    .eq("lead_id", lead_id)
    .maybeSingle();
  if (readErr) fail(back, crmDbMessage(readErr, "The lead status"));
  if (prev?.status === "converted") fail(back, "That lead is already converted. Work it from the account.");
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("crm_lead_triage")
    .upsert(
      { lead_id, ...statusPatch((prev as TriagePrev | null) ?? undefined, status, reason, now) },
      { onConflict: "lead_id" },
    );
  if (error) fail(back, crmDbMessage(error, "The lead status"));
  revalidateInbox();
  redirect(back);
}

export async function assignLead(formData: FormData) {
  const back = backOf(formData);
  const { supabase, me } = await session(back);
  const lead_id = String(formData.get("lead_id") ?? "");
  if (!UUID_RE.test(lead_id)) fail(back, "That lead is not valid.");
  const owner = ownerFrom(formData.get("owner_id") || "none", me);
  if (owner === undefined) fail(back, "Pick yourself or Unassigned.");
  const { error } = await supabase
    .from("crm_lead_triage")
    .upsert({ lead_id, owner_id: owner }, { onConflict: "lead_id" });
  if (error) fail(back, crmDbMessage(error, "The owner"));
  revalidateInbox();
  redirect(back);
}

/* ---------------- bulk triage ---------------- */

export async function bulkTriage(formData: FormData) {
  const back = backOf(formData);
  const { supabase, me } = await session(back);
  const ids = [...new Set(formData.getAll("ids").map(String))].filter((v) => UUID_RE.test(v));
  if (!ids.length) fail(back, "Tick at least one lead first.");
  if (ids.length > 100) fail(back, "Bulk changes are capped at 100 leads at a time.");
  const status = String(formData.get("status") ?? "") || null;
  const ownerRaw = String(formData.get("owner_id") ?? "");
  const owner = ownerRaw ? ownerFrom(ownerRaw, me) : undefined;
  if (ownerRaw && owner === undefined) fail(back, "Pick yourself or Unassigned.");
  const reason = String(formData.get("disqualify_reason") ?? "") || null;
  if (status && !SETTABLE_TRIAGE.includes(status)) fail(back, "Pick New, Contacted, Qualified or Disqualified.");
  if (status === "disqualified" && (!reason || !(reason in DQ_REASON))) fail(back, "Pick a reason to disqualify.");
  if (!status && owner === undefined) fail(back, "Pick a status or an owner to apply.");

  const { data: prevRows, error: readErr } = await supabase
    .from("crm_lead_triage")
    .select("lead_id, status, status_changed_at, first_contacted_at")
    .in("lead_id", ids);
  if (readErr) fail(back, crmDbMessage(readErr, "The bulk change"));
  const prev = new Map(((prevRows ?? []) as TriagePrev[]).map((r) => [r.lead_id, r]));
  const now = new Date().toISOString();

  const rows = ids
    .filter((id) => !status || prev.get(id)?.status !== "converted")
    .map((id) => ({
      lead_id: id,
      ...(status ? statusPatch(prev.get(id), status, reason, now) : {}),
      ...(owner !== undefined ? { owner_id: owner } : {}),
    }));
  if (rows.length) {
    const { error } = await supabase.from("crm_lead_triage").upsert(rows, { onConflict: "lead_id" });
    if (error) fail(back, crmDbMessage(error, "The bulk change"));
  }
  revalidateInbox();
  redirect(back);
}

/* ---------------- convert and link ---------------- */

async function readLead(supabase: Supa, back: string, id: string): Promise<Lead> {
  if (!UUID_RE.test(id)) fail(back, "That lead is not valid.");
  const { data, error } = await supabase.from("marketing_leads").select(LEAD_SELECT).eq("id", id).maybeSingle();
  if (error) fail(back, crmDbMessage(error, "The lead"));
  if (!data) fail(back, "That lead no longer exists.");
  const lead = data as unknown as Lead;
  if (!SALES_LEAD_KINDS.includes(lead.kind)) fail(back, "That lead is not a sales lead.");
  return lead;
}

/* Claim the triage row: insert if absent, then flip to converted only if it
   is not converted yet. A double click finds nothing to flip. Returns a
   release() that puts the prior status back if a later write fails. */
async function claimLead(
  supabase: Supa,
  back: string,
  lead_id: string,
): Promise<{ release: () => Promise<void> }> {
  const pre = await supabase
    .from("crm_lead_triage")
    .select("status, status_changed_at")
    .eq("lead_id", lead_id)
    .maybeSingle();
  if (pre.error) fail(back, crmDbMessage(pre.error, "The conversion"));
  const prior = (pre.data ?? null) as { status: string; status_changed_at: string | null } | null;
  if (prior?.status === "converted") fail(back, "That lead is already converted.");
  await supabase.from("crm_lead_triage").upsert({ lead_id }, { onConflict: "lead_id", ignoreDuplicates: true });
  const now = new Date().toISOString();
  const { data: claimed, error } = await supabase
    .from("crm_lead_triage")
    .update({ status: "converted", disqualify_reason: null, status_changed_at: now })
    .eq("lead_id", lead_id)
    .neq("status", "converted")
    .select("lead_id");
  if (error) fail(back, crmDbMessage(error, "The conversion"));
  if (!claimed?.length) fail(back, "That lead is already converted.");
  return {
    release: async () => {
      await supabase
        .from("crm_lead_triage")
        .update({
          status: prior?.status && prior.status !== "converted" ? prior.status : "new",
          status_changed_at: prior?.status_changed_at ?? now,
        })
        .eq("lead_id", lead_id);
    },
  };
}

function leadEventMeta(lead: Lead, extra: Record<string, unknown> = {}) {
  return {
    lead_id: lead.id,
    kind: lead.kind,
    channel: channelOf(lead.utm, lead.referrer),
    source_path: lead.source_path ?? null,
    ...extra,
  };
}

function leadEventBody(lead: Lead, verb: string): string {
  const ctx = contextSentence(lead.kind, lead.context);
  return [`${verb} from a website lead (${LEAD_KIND_LABELS[lead.kind] ?? lead.kind}).`, ctx]
    .filter(Boolean)
    .join(" ");
}

const PLAN_KEYS = new Set(["solo", "growth", "scale", "enterprise"]);

export async function convertLead(formData: FormData) {
  const back = backOf(formData);
  const { supabase, me } = await session(back);
  const lead = await readLead(supabase, back, String(formData.get("lead_id") ?? ""));

  const field = (k: string, max: number, label: string) => {
    const v = String(formData.get(k) ?? "").trim();
    if (v.length > max) fail(back, `Keep the ${label} under ${max} characters.`);
    return v || null;
  };
  const name = field("account_name", 160, "account name") ?? lead.company?.trim() ?? null;
  if (!name) fail(back, "Add an account name: this lead did not include a company.");
  const contactName = field("contact_name", 160, "contact name") ?? lead.name?.trim() ?? null;
  const contactTitle = field("contact_title", 160, "title");
  const oppName = field("opp_name", 160, "opportunity name");
  const owner = ownerFrom(formData.get("owner_id") || "me", me);
  if (owner === undefined) fail(back, "Pick yourself or Unassigned.");

  /* reuse, never duplicate: an account with this name already exists */
  const { data: same } = await supabase
    .from("crm_accounts")
    .select("id, name")
    .ilike("name", ilikeExact(name))
    .is("archived_at", null)
    .limit(1);
  if (same?.length) fail(back, `An account named ${same[0].name} already exists. Use Link to ${same[0].name} instead.`);

  /* a demo request from a personalized link carries its ?for= label */
  const demoFor = leadDemoFor(lead.context);
  let demo_for_key: string | null = demoFor ? demoKeyOf(demoFor) || null : null;
  if (demo_for_key) {
    const { data: taken } = await supabase
      .from("crm_accounts")
      .select("id")
      .eq("demo_for_key", demo_for_key)
      .limit(1);
    if (taken?.length) demo_for_key = null;
  }

  const { release } = await claimLead(supabase, back, lead.id);

  const message = leadMessage(lead.context);
  const { data: acct, error: acctErr } = await supabase
    .from("crm_accounts")
    .insert({
      name,
      status: "engaged",
      source: lead.kind === "demo_request" ? "demo" : "website",
      owner_id: owner,
      locations: leadLocations(lead.context),
      notes: message ? message.slice(0, 20000) : null,
      demo_for_key,
      created_by: me,
    })
    .select("id")
    .single();
  if (acctErr || !acct) {
    await release();
    fail(back, crmDbMessage(acctErr, "The account"));
  }
  const accountId = acct.id as string;

  /* best effort from here: the account exists and the lead is claimed */
  await supabase.from("crm_lead_triage").update({ account_id: accountId }).eq("lead_id", lead.id);

  let contactId: string | null = null;
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  if (contactName || email || phone) {
    const { data: c } = await supabase
      .from("crm_contacts")
      .insert({
        account_id: accountId,
        name: (contactName ?? email ?? phone ?? "Website contact").slice(0, 160),
        title: contactTitle,
        email: email ? email.slice(0, 320) : null,
        phone: phone ? phone.slice(0, 40) : null,
        created_by: me,
      })
      .select("id")
      .single();
    contactId = (c?.id as string | undefined) ?? null;
  }

  let oppId: string | null = null;
  let oppError: string | null = null;
  if (oppName) {
    const tier = String(lead.context?.recommended_tier ?? "").trim().toLowerCase();
    const { data: opp, error } = await supabase
      .from("crm_opportunities")
      .insert({
        account_id: accountId,
        name: oppName,
        stage: "engaged",
        owner_id: owner,
        primary_contact_id: contactId,
        plan_tier: PLAN_KEYS.has(tier) ? tier : null,
        created_by: me,
      })
      .select("id")
      .single();
    if (error || !opp) oppError = crmDbMessage(error, "The opportunity");
    else oppId = opp.id as string;
  }

  await logCrmEvent(supabase, me, {
    account_id: accountId,
    opportunity_id: oppId,
    contact_id: contactId,
    kind: "lead",
    body: leadEventBody(lead, "Converted"),
    meta: leadEventMeta(lead),
    occurred_at: lead.created_at,
  });

  revalidateInbox();
  revalidatePath("/crm/accounts");
  if (oppId) revalidatePath("/crm/pipeline");
  if (oppError) fail(`/crm/accounts/${accountId}`, `The account was created, but ${oppError.charAt(0).toLowerCase()}${oppError.slice(1)}`);
  redirect(oppId ? `/crm/opportunities/${oppId}` : `/crm/accounts/${accountId}`);
}

/* Attach a lead to an account already on file instead of creating a second
   record. Adds the person as a contact when they are not on file yet. */
export async function linkLeadToAccount(formData: FormData) {
  const back = backOf(formData);
  const { supabase, me } = await session(back);
  const lead = await readLead(supabase, back, String(formData.get("lead_id") ?? ""));
  const account_id = String(formData.get("account_id") ?? "");
  if (!UUID_RE.test(account_id)) fail(back, "That account is not valid.");
  const { data: acct } = await supabase
    .from("crm_accounts")
    .select("id, name")
    .eq("id", account_id)
    .maybeSingle();
  if (!acct) fail(back, "That account no longer exists.");

  await claimLead(supabase, back, lead.id);
  await supabase.from("crm_lead_triage").update({ account_id }).eq("lead_id", lead.id);

  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  let contactId: string | null = null;
  if (email || phone) {
    const { data: existing } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("account_id", account_id)
      .eq(email ? "email" : "phone", (email ?? phone) as string)
      .limit(1);
    if (existing?.length) contactId = existing[0].id as string;
    else if (lead.name?.trim()) {
      const { data: c } = await supabase
        .from("crm_contacts")
        .insert({
          account_id,
          name: lead.name.trim().slice(0, 160),
          email: email ? email.slice(0, 320) : null,
          phone: phone ? phone.slice(0, 40) : null,
          created_by: me,
        })
        .select("id")
        .single();
      contactId = (c?.id as string | undefined) ?? null;
    }
  }

  await logCrmEvent(supabase, me, {
    account_id,
    contact_id: contactId,
    kind: "lead",
    body: leadEventBody(lead, "Linked"),
    meta: leadEventMeta(lead, { linked: true }),
    occurred_at: lead.created_at,
  });

  revalidateInbox();
  revalidatePath(`/crm/accounts/${account_id}`);
  redirect(back);
}

/* ---------------- demo opens ---------------- */

/* Create an account for a personalized demo link nobody has matched yet,
   or attach the link to an account of the same name that has no key. */
export async function createDemoAccount(formData: FormData) {
  const back = `${INBOX}?tab=demos`;
  const { supabase, me } = await session(back);
  const for_key = String(formData.get("for_key") ?? "").trim();
  if (!for_key || for_key.length > 60 || for_key === "qa-probe") fail(back, "That demo link is not valid.");

  const { data: visit, error: vErr } = await supabase
    .from("demo_visits")
    .select("for_label, for_key, visits, last_seen_at")
    .eq("for_key", for_key)
    .maybeSingle();
  if (vErr) fail(back, crmDbMessage(vErr, "The demo link"));
  if (!visit) fail(back, "That demo link has no opens on record.");
  const v = visit as { for_label: string | null; for_key: string; visits: number; last_seen_at: string };

  const { data: keyed } = await supabase
    .from("crm_accounts")
    .select("id")
    .eq("demo_for_key", for_key)
    .limit(1);
  if (keyed?.length) redirect(`/crm/accounts/${keyed[0].id as string}`);

  const name = (v.for_label ?? for_key).trim().slice(0, 160);
  const { data: same } = await supabase
    .from("crm_accounts")
    .select("id, name, demo_for_key")
    .ilike("name", ilikeExact(name))
    .is("archived_at", null)
    .limit(1);

  let accountId: string;
  if (same?.length) {
    const a = same[0] as { id: string; name: string; demo_for_key: string | null };
    if (a.demo_for_key) fail(back, `${a.name} already has a different demo link (${a.demo_for_key}).`);
    const { error } = await supabase.from("crm_accounts").update({ demo_for_key: for_key }).eq("id", a.id);
    if (error) fail(back, crmDbMessage(error, "The demo link"));
    accountId = a.id;
  } else {
    const { data: acct, error } = await supabase
      .from("crm_accounts")
      .insert({
        name,
        demo_for_key: for_key,
        source: "demo",
        status: "engaged",
        owner_id: me,
        created_by: me,
      })
      .select("id")
      .single();
    if (error || !acct) fail(back, crmDbMessage(error, "The account"));
    accountId = acct.id as string;
  }

  await logCrmEvent(supabase, me, {
    account_id: accountId,
    kind: "demo_open",
    body: `Opened the personalized demo link ${v.visits === 1 ? "once" : `${v.visits} times`}.`,
    meta: { for_key, visits: v.visits },
    occurred_at: v.last_seen_at,
  });

  revalidateInbox();
  revalidatePath("/crm/accounts");
  redirect(`/crm/accounts/${accountId}`);
}
