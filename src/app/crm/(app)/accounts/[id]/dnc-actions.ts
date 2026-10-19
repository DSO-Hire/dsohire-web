"use server";

/* Do not contact (2026-10-19). CAN-SPAM opt-outs must be honored within 10
   business days and permanently, so the flag is the compliance record:
   when, why, and every change to it is logged on the timeline. Marking an
   account also clears its next step and closes its open tasks so no
   reminder nudges another send. Clearing requires typing "opted in". */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { DNC_REASONS } from "../../format";

function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message.slice(0, 400))}`);
}

function parse(fd: FormData) {
  const accountId = String(fd.get("account_id") ?? "");
  if (!UUID_RE.test(accountId)) redirect("/crm/accounts");
  const tab = String(fd.get("tab") ?? "");
  const back = tab === "contacts" ? `/crm/accounts/${accountId}?tab=contacts` : `/crm/accounts/${accountId}`;
  return { accountId, back };
}

async function gate(back: string) {
  const s = await requireCrmAdmin();
  if (!s) fail(back, "Your CRM session expired. Sign in again with your second factor.");
  return s;
}

function reasonOf(fd: FormData, back: string) {
  const reason = String(fd.get("reason") ?? "");
  if (!(reason in DNC_REASONS)) fail(back, "Pick why they should not be contacted.");
  const note = String(fd.get("note") ?? "").trim();
  if (note.length > 500) fail(back, "Keep the note under 500 characters.");
  return { reason, note: note || null };
}

function done(accountId: string, back: string): never {
  revalidatePath(`/crm/accounts/${accountId}`);
  revalidatePath("/crm/accounts");
  revalidatePath("/crm");
  redirect(back);
}

export async function setAccountDnc(fd: FormData) {
  const { accountId, back } = parse(fd);
  const { supabase, me } = await gate(back);
  const { reason, note } = reasonOf(fd, back);
  const now = new Date().toISOString();
  const { data: before } = await supabase
    .from("crm_accounts")
    .select("next_step, next_step_due, do_not_contact_at")
    .eq("id", accountId)
    .maybeSingle();
  if (!before) fail(back, "That account no longer exists.");
  if (before.do_not_contact_at) done(accountId, back);
  const { error } = await supabase
    .from("crm_accounts")
    .update({
      do_not_contact_at: now,
      do_not_contact_reason: reason,
      do_not_contact_note: note,
      next_step: null,
      next_step_due: null,
      updated_at: now,
    })
    .eq("id", accountId);
  if (error) fail(back, crmDbMessage(error, "The do-not-contact flag"));
  const { data: closed } = await supabase
    .from("crm_tasks")
    .update({ completed_at: now })
    .eq("account_id", accountId)
    .is("completed_at", null)
    .select("id");
  const n = (closed ?? []).length;
  await logCrmEvent(supabase, me, {
    account_id: accountId,
    kind: "field_change",
    body: `Marked do not contact: ${DNC_REASONS[reason]}${note ? `. ${note}` : ""}${
      before.next_step ? `. Cleared next step "${before.next_step}"` : ""
    }${n ? `. Closed ${n} open ${n === 1 ? "task" : "tasks"}` : ""}.`,
    meta: { field: "do_not_contact", from: null, to: reason, closed_tasks: n },
  });
  done(accountId, back);
}

export async function clearAccountDnc(fd: FormData) {
  const { accountId, back } = parse(fd);
  const { supabase, me } = await gate(back);
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== "opted in")
    fail(back, 'Type "opted in" to confirm they asked to hear from you again.');
  const { data: before } = await supabase
    .from("crm_accounts")
    .select("do_not_contact_reason, do_not_contact_at")
    .eq("id", accountId)
    .maybeSingle();
  if (!before?.do_not_contact_at) done(accountId, back);
  const { error } = await supabase
    .from("crm_accounts")
    .update({ do_not_contact_at: null, do_not_contact_reason: null, do_not_contact_note: null, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (error) fail(back, crmDbMessage(error, "Clearing the flag"));
  await logCrmEvent(supabase, me, {
    account_id: accountId,
    kind: "field_change",
    body: `Do not contact cleared (was: ${DNC_REASONS[before.do_not_contact_reason as string] ?? "unknown"}, flagged ${String(
      before.do_not_contact_at,
    ).slice(0, 10)}). They opted back in.`,
    meta: { field: "do_not_contact", from: before.do_not_contact_reason, to: null },
  });
  done(accountId, back);
}

export async function setContactDnc(fd: FormData) {
  const { accountId, back } = parse(fd);
  const contactId = String(fd.get("contact_id") ?? "");
  if (!UUID_RE.test(contactId)) fail(back, "That contact is not valid.");
  const { supabase, me } = await gate(back);
  const { reason, note } = reasonOf(fd, back);
  const now = new Date().toISOString();
  const { data: c, error } = await supabase
    .from("crm_contacts")
    .update({ do_not_contact_at: now, do_not_contact_reason: reason, do_not_contact_note: note, updated_at: now })
    .eq("id", contactId)
    .eq("account_id", accountId)
    .is("do_not_contact_at", null)
    .select("name")
    .maybeSingle();
  if (error) fail(back, crmDbMessage(error, "The do-not-contact flag"));
  if (c) {
    await logCrmEvent(supabase, me, {
      account_id: accountId,
      contact_id: contactId,
      kind: "field_change",
      body: `${c.name} marked do not contact: ${DNC_REASONS[reason]}${note ? `. ${note}` : ""}.`,
      meta: { field: "contact_do_not_contact", from: null, to: reason },
    });
  }
  done(accountId, back);
}

export async function clearContactDnc(fd: FormData) {
  const { accountId, back } = parse(fd);
  const contactId = String(fd.get("contact_id") ?? "");
  if (!UUID_RE.test(contactId)) fail(back, "That contact is not valid.");
  const { supabase, me } = await gate(back);
  if (String(fd.get("confirm") ?? "").trim().toLowerCase() !== "opted in")
    fail(back, 'Type "opted in" to confirm they asked to hear from you again.');
  const { data: c, error } = await supabase
    .from("crm_contacts")
    .update({ do_not_contact_at: null, do_not_contact_reason: null, do_not_contact_note: null, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("account_id", accountId)
    .not("do_not_contact_at", "is", null)
    .select("name")
    .maybeSingle();
  if (error) fail(back, crmDbMessage(error, "Clearing the flag"));
  if (c) {
    await logCrmEvent(supabase, me, {
      account_id: accountId,
      contact_id: contactId,
      kind: "field_change",
      body: `${c.name}: do not contact cleared. They opted back in.`,
      meta: { field: "contact_do_not_contact", to: null },
    });
  }
  done(accountId, back);
}
