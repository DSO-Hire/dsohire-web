"use server";

/* Settings actions for email templates and the email signature
   (2026-10-19). Each re-checks the caller (superadmin + aal2) and RLS
   enforces the same rule underneath. Inputs are validated against the
   crm_v2 check constraints. Templates are archived, never deleted; the
   workspace settings row (id = true) is only ever updated. Returns {error}
   for inline results on the client cards. */

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage } from "@/lib/crm/events";

type Result = { error: string | null };

const EXPIRED = "Your CRM session expired. Sign in again with your second factor.";

function revalidate() {
  revalidatePath("/crm/settings");
  /* the compose panel on every account profile reads the templates */
  revalidatePath("/crm/accounts", "layout");
}

type TplFields = {
  name: string;
  subject: string | null;
  body: string;
  next_step: string | null;
  next_step_days: number | null;
  sort: number;
};

function parseTemplate(fd: FormData): { ok: true; v: TplFields } | { ok: false; error: string } {
  const name = String(fd.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the template a name." };
  if (name.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  const subject = String(fd.get("subject") ?? "").trim();
  if (subject.length > 200) return { ok: false, error: "Keep the subject under 200 characters." };
  const body = String(fd.get("body") ?? "").replace(/\r\n/g, "\n").trim();
  if (!body) return { ok: false, error: "The body is empty." };
  if (body.length > 5000) return { ok: false, error: "Keep the body under 5,000 characters." };
  const nextStep = String(fd.get("next_step") ?? "").trim();
  if (nextStep.length > 200) return { ok: false, error: "Keep the next step under 200 characters." };
  const daysRaw = String(fd.get("next_step_days") ?? "").trim();
  let days: number | null = null;
  if (daysRaw) {
    days = Number(daysRaw);
    if (!Number.isInteger(days) || days < 1 || days > 60)
      return { ok: false, error: "Follow up after must be a whole number of days from 1 to 60, or blank." };
  }
  const sortRaw = String(fd.get("sort") ?? "").trim();
  const sort = sortRaw ? Number(sortRaw) : 0;
  if (!Number.isInteger(sort) || sort < 0 || sort > 9999) return { ok: false, error: "Order must be a whole number from 0 to 9999." };
  return {
    ok: true,
    v: { name, subject: subject || null, body, next_step: nextStep || null, next_step_days: days, sort },
  };
}

function keyFromName(name: string): string {
  const k = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 34)
    .replace(/_+$/g, "");
  return k.length >= 2 ? k : `tpl_${k || "new"}`;
}

export async function saveTemplate(fd: FormData): Promise<Result> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  const { supabase, me } = s;
  const parsed = parseTemplate(fd);
  if (!parsed.ok) return { error: parsed.error };
  const id = String(fd.get("id") ?? "");
  const now = new Date().toISOString();

  if (id) {
    if (!UUID_RE.test(id)) return { error: "That template is not valid." };
    const { data, error } = await supabase
      .from("crm_email_templates")
      .update({ ...parsed.v, updated_by: me, updated_at: now })
      .eq("id", id)
      .select("id");
    if (error) return { error: crmDbMessage(error, "The template") };
    if (!data?.length) return { error: "That template no longer exists. Reload the page." };
    revalidate();
    return { error: null };
  }

  const channel = String(fd.get("channel") ?? "email");
  if (channel !== "email" && channel !== "linkedin") return { error: "Pick email or LinkedIn." };
  if (channel === "email" && !parsed.v.subject) return { error: "An email template needs a subject." };

  /* key from the name; add a number if it is taken */
  const base = keyFromName(parsed.v.name);
  const { data: taken } = await supabase.from("crm_email_templates").select("key").like("key", `${base}%`);
  const used = new Set(((taken ?? []) as { key: string }[]).map((r) => r.key));
  let key = base;
  for (let n = 2; used.has(key) && n < 1000; n++) key = `${base}_${n}`;

  const { error } = await supabase
    .from("crm_email_templates")
    .insert({ ...parsed.v, key, channel, subject: channel === "linkedin" ? null : parsed.v.subject, updated_by: me, updated_at: now });
  if (error) return { error: crmDbMessage(error, "The template") };
  revalidate();
  return { error: null };
}

export async function setTemplateArchived(id: string, archived: boolean): Promise<Result> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  if (typeof id !== "string" || !UUID_RE.test(id)) return { error: "That template is not valid." };
  const now = new Date().toISOString();
  const { data, error } = await s.supabase
    .from("crm_email_templates")
    .update({ archived_at: archived ? now : null, updated_by: s.me, updated_at: now })
    .eq("id", id)
    .select("id");
  if (error) return { error: crmDbMessage(error, "The template") };
  if (!data?.length) return { error: "That template no longer exists. Reload the page." };
  revalidate();
  return { error: null };
}

export async function saveSignature(fd: FormData): Promise<Result> {
  const s = await requireCrmAdmin();
  if (!s) return { error: EXPIRED };
  const signature = String(fd.get("email_signature") ?? "").replace(/\r\n/g, "\n").trim();
  if (signature.length > 1000) return { error: "Keep the signature under 1,000 characters." };
  const address = String(fd.get("mailing_address") ?? "").trim().replace(/\s*\n\s*/g, ", ");
  if (address.length > 300) return { error: "Keep the mailing address under 300 characters." };
  /* updated_at is left alone: the weights card reads it as "Last changed" */
  const { data, error } = await s.supabase
    .from("crm_workspace_settings")
    .update({
      email_signature: signature,
      mailing_address: address || null,
    })
    .eq("id", true)
    .select("id");
  if (error) return { error: crmDbMessage(error, "The signature") };
  if (!data?.length) return { error: "The workspace settings row is missing. Nothing was saved." };
  revalidate();
  return { error: null };
}
