"use server";

/* Compose panel server action (2026-10-19). "Log as sent" records a
   template email or LinkedIn note the founder already sent by hand from
   his own mailbox. Nothing here sends mail. It follows logOutreach's rules
   (a first real touch moves a Target to Contacted, with an automatic
   field_change), adds the template key to the event meta so the panel can
   show the sequence, and applies the template's suggested next step.
   Returns {error} for the client panel instead of redirecting. */

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { isoPlusDays, todayIso } from "../../format";

type Result = { error: string | null; nextStep?: string | null; nextStepDue?: string | null };

const KEY_RE = /^[a-z0-9_]{2,40}$/;

/* subject plus the first few non-empty lines: enough to recognize the
   email on the timeline without storing the whole thing twice */
function summaryOf(channel: string, subject: string, body: string): string {
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("\n");
  const head = channel === "linkedin" ? "LinkedIn note sent" : `Sent: ${subject || "(no subject)"}`;
  const out = `${head}\n${lines}`;
  return out.length > 700 ? `${out.slice(0, 699)}…` : out;
}

export async function logTemplateSend(input: {
  accountId: string;
  templateKey: string;
  contactId: string | null;
  subject: string;
  body: string;
}): Promise<Result> {
  const s = await requireCrmAdmin();
  if (!s) return { error: "Your CRM session expired. Sign in again with your second factor." };
  const { supabase, me } = s;

  const accountId = String(input?.accountId ?? "");
  if (!UUID_RE.test(accountId)) return { error: "That account is not valid." };
  const key = String(input?.templateKey ?? "");
  if (!KEY_RE.test(key)) return { error: "Pick a template first." };
  const subject = String(input?.subject ?? "").trim().slice(0, 300);
  const body = String(input?.body ?? "").trim();
  if (!body) return { error: "The message is empty." };
  if (body.length > 20000) return { error: "Keep the message under 20,000 characters." };

  const [{ data: acct }, { data: tpl }] = await Promise.all([
    supabase.from("crm_accounts").select("id, status, next_step, next_step_due").eq("id", accountId).maybeSingle(),
    supabase.from("crm_email_templates").select("key, channel, next_step, next_step_days").eq("key", key).maybeSingle(),
  ]);
  if (!acct) return { error: "That account no longer exists." };
  if (!tpl) return { error: "That template no longer exists. Reload the page." };
  const t = tpl as { key: string; channel: string; next_step: string | null; next_step_days: number | null };
  const a = acct as { id: string; status: string; next_step: string | null; next_step_due: string | null };

  let contactId: string | null = null;
  if (input?.contactId) {
    const c = String(input.contactId);
    if (!UUID_RE.test(c)) return { error: "That contact is not valid." };
    const { data: owned } = await supabase.from("crm_contacts").select("id").eq("id", c).eq("account_id", accountId).maybeSingle();
    if (!owned) return { error: "That contact is not on this account." };
    contactId = c;
  }

  const kind = t.channel === "linkedin" ? "linkedin" : "email";
  const { error } = await logCrmEvent(supabase, me, {
    account_id: accountId,
    contact_id: contactId,
    kind,
    body: summaryOf(kind, subject, body),
    meta: { template_key: t.key, contact_id: contactId, subject: kind === "email" ? subject : null },
  });
  if (error) return { error: crmDbMessage({ message: error }, "The entry") };

  const patch: Record<string, unknown> = {};
  if (a.status === "target") {
    patch.status = "contacted";
    await logCrmEvent(supabase, me, {
      account_id: accountId,
      kind: "field_change",
      body: "Status moved from Target to Contacted",
      meta: { changes: [{ field: "status", from: "target", to: "contacted" }], auto: true },
    });
  }
  let nextStep: string | null = null;
  let nextStepDue: string | null = null;
  const days = Number(t.next_step_days);
  if (Number.isInteger(days) && days >= 1 && days <= 60) {
    nextStepDue = isoPlusDays(todayIso(), days);
    nextStep = (t.next_step ?? "").trim().slice(0, 300) || "Follow up";
    patch.next_step = nextStep;
    patch.next_step_due = nextStepDue;
    const changes: { field: string; from: unknown; to: unknown }[] = [];
    if ((a.next_step ?? "") !== nextStep) changes.push({ field: "next_step", from: a.next_step ?? null, to: nextStep });
    const prevDue = a.next_step_due ? String(a.next_step_due).slice(0, 10) : null;
    if (prevDue !== nextStepDue) changes.push({ field: "next_step_due", from: prevDue, to: nextStepDue });
    if (changes.length) {
      await logCrmEvent(supabase, me, {
        account_id: accountId,
        kind: "field_change",
        body: `Next step set from the template: ${nextStep}, due ${nextStepDue}`,
        meta: { changes, auto: true, template_key: t.key },
      });
    }
  }
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    const { error: upErr } = await supabase.from("crm_accounts").update(patch).eq("id", accountId);
    if (upErr) return { error: crmDbMessage(upErr, "The next step") };
  }

  revalidatePath(`/crm/accounts/${accountId}`);
  revalidatePath("/crm/accounts");
  revalidatePath("/crm");
  return { error: null, nextStep, nextStepDue };
}
