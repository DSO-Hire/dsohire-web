"use server";

/* Accounts server actions (2026-10-19), ported from the EDC CRM's
   sellers/actions.ts and start-deal-actions.ts. Every action re-verifies
   the caller (superadmin + aal2 via requireCrmAdmin) and RLS enforces the
   same rule again underneath through private.is_crm_admin(). Inputs are
   validated and capped here against the crm_core check constraints;
   nothing from a hidden field is trusted without a server-side check.
   Failures bounce back to the page that hosted the form with plain words
   in the ActionError banner. Accounts are archived, never hard deleted. */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent, type CrmEventKind } from "@/lib/crm/events";
import { forKey, sanitizeForLabel } from "@/lib/marketing/demo";
import {
  ACCOUNT_STATUS_LABELS,
  CONTACT_ROLE_LABELS,
  SOURCE_LABELS,
  suggestPlan,
  todayIso,
} from "../format";
import { BALL_OPTS, FIT_LABELS, OUTREACH_KINDS, PRIORITY_OPTS, hostOf } from "./lib";

const LIST = "/crm/accounts";

function fail(path: string, message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(message.slice(0, 400))}`);
}

async function gate(back: string) {
  const s = await requireCrmAdmin();
  if (!s) fail(back, "Your CRM session expired. Sign in again with your second factor.");
  return s;
}

const PROFILE_TABS = ["overview", "contacts", "activity"];
function accountBack(id: string, tab?: unknown): string {
  const t = String(tab ?? "");
  return PROFILE_TABS.includes(t) && t !== "overview" ? `${LIST}/${id}?tab=${t}` : `${LIST}/${id}`;
}

function idFrom(fd: FormData, key = "account_id"): string {
  const id = String(fd.get(key) ?? "");
  if (!UUID_RE.test(id)) redirect(LIST);
  return id;
}

/* ---------------- typed field parsers ---------------- */

type FieldType = "str" | "int" | "date" | "enum" | "warmth" | "list";
type Field = { k: string; t: FieldType; label: string; max?: number; hi?: number; opts?: Record<string, string>; required?: boolean };
type Parsed = { ok: true; v: unknown } | { ok: false; msg: string };

function parseField(fd: FormData, f: Field): Parsed {
  const raw = String(fd.get(f.k) ?? "").trim();
  if (f.t === "list") {
    const vals = raw
      .split(/[,\n]/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 60);
    if (vals.some((v) => v.length > 40)) return { ok: false, msg: `${f.label}: keep each entry under 40 characters.` };
    return { ok: true, v: [...new Set(vals)] };
  }
  if (!raw) {
    if (f.required) return { ok: false, msg: `${f.label} is required.` };
    return { ok: true, v: null };
  }
  switch (f.t) {
    case "str": {
      const max = f.max ?? 200;
      if (raw.length > max) return { ok: false, msg: `${f.label} is capped at ${max.toLocaleString("en-US")} characters.` };
      return { ok: true, v: raw };
    }
    case "int": {
      const n = Number(raw.replace(/[,\s]/g, ""));
      if (!Number.isInteger(n)) return { ok: false, msg: `${f.label} must be a whole number.` };
      const hi = f.hi ?? 100000;
      if (n < 0 || n > hi) return { ok: false, msg: `${f.label} must be between 0 and ${hi.toLocaleString("en-US")}.` };
      return { ok: true, v: n };
    }
    case "warmth": {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, msg: "Warmth must be 1 to 5." };
      return { ok: true, v: n };
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(new Date(`${raw}T12:00:00Z`).getTime()))
        return { ok: false, msg: `${f.label} must be a date.` };
      const y = Number(raw.slice(0, 4));
      if (y < 2000 || y > 2100) return { ok: false, msg: `${f.label} is out of range.` };
      return { ok: true, v: raw };
    }
    case "enum":
      if (!f.opts || !(raw in f.opts)) return { ok: false, msg: `${f.label} has an unknown value.` };
      return { ok: true, v: raw };
  }
}

function parseFields(fd: FormData, fields: Field[], back: string): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    /* a field that was not on the form is left alone */
    if (!fd.has(f.k)) continue;
    const r = parseField(fd, f);
    if (!r.ok) fail(back, r.msg);
    row[f.k] = r.v;
  }
  return row;
}

const SECTION_FIELDS: Record<string, Field[]> = {
  relationship: [
    { k: "status", t: "enum", label: "Status", opts: ACCOUNT_STATUS_LABELS, required: true },
    { k: "fit_tier", t: "enum", label: "Fit tier", opts: FIT_LABELS },
    { k: "warmth", t: "warmth", label: "Warmth" },
    { k: "source", t: "enum", label: "Source", opts: SOURCE_LABELS, required: true },
    { k: "next_step", t: "str", label: "Next step", max: 300 },
    { k: "next_step_due", t: "date", label: "Next step due" },
    { k: "notes", t: "str", label: "Notes", max: 20000 },
  ],
  profile: [
    { k: "name", t: "str", label: "Group name", max: 160, required: true },
    { k: "website", t: "str", label: "Website", max: 300 },
    { k: "hq_state", t: "str", label: "HQ state", max: 40 },
    { k: "states", t: "list", label: "States" },
    { k: "locations", t: "int", label: "Locations", hi: 5000 },
    { k: "locations_note", t: "str", label: "Locations note", max: 300 },
    { k: "open_roles", t: "int", label: "Open roles", hi: 100000 },
    { k: "current_tool", t: "str", label: "Current hiring tool", max: 200 },
    { k: "hiring_owner_title", t: "str", label: "Who owns hiring", max: 200 },
    { k: "hiring_signal", t: "str", label: "Hiring signal", max: 2000 },
    { k: "growth_signal", t: "str", label: "Growth signal", max: 2000 },
  ],
};

/* ---------------- create ---------------- */

export async function createAccount(fd: FormData) {
  const back = `${LIST}?new=1`;
  const { supabase, me } = await gate(back);
  const row = parseFields(
    fd,
    [...SECTION_FIELDS.profile.filter((f) => f.k !== "states"), ...SECTION_FIELDS.relationship],
    back,
  );
  const name = String(row.name ?? "").replace(/\s+/g, " ");
  row.name = name;

  /* duplicate check: the name is unique among live accounts in the database;
     a matching website is caught here unless the box says add anyway */
  if (!fd.get("allow_dup")) {
    const { data: same } = await supabase
      .from("crm_accounts")
      .select("id, name, website")
      .is("archived_at", null)
      .ilike("name", name.replace(/[%_\\]/g, "\\$&"))
      .limit(1);
    if (same?.length) fail(back, `${same[0].name as string} is already an account. Open it from the list.`);
    const host = hostOf(row.website as string | null);
    if (host) {
      const { data: siteHits } = await supabase
        .from("crm_accounts")
        .select("id, name, website")
        .is("archived_at", null)
        .ilike("website", `%${host.replace(/[%_]/g, "")}%`)
        .limit(5);
      const hit = (siteHits ?? []).find((a) => hostOf(a.website as string) === host);
      if (hit) fail(back, `${hit.name as string} already uses ${host}. Tick "Add anyway" if this is a different group.`);
    }
  }

  const label = sanitizeForLabel(name);
  const demoKey = label ? forKey(label) || null : null;
  const base = { ...row, owner_id: me, created_by: me };
  let res = await supabase
    .from("crm_accounts")
    .insert({ ...base, demo_for_key: demoKey })
    .select("id")
    .single();
  /* the demo key is unique too: an archived namesake may hold it */
  if (res.error?.code === "23505" && demoKey && /demo_for_key/.test(res.error.message ?? "")) {
    res = await supabase.from("crm_accounts").insert(base).select("id").single();
  }
  if (res.error || !res.data) fail(back, crmDbMessage(res.error, "The account"));
  const id = res.data.id as string;

  await logCrmEvent(supabase, me, {
    account_id: id,
    kind: "import",
    body: `Account added (${SOURCE_LABELS[String(row.source ?? "research")] ?? "Research"})`,
    meta: { source: row.source ?? "research" },
  });

  /* an optional first contact */
  const cName = String(fd.get("contact_name") ?? "").trim();
  if (cName) {
    const contact = contactRow(fd, `${LIST}/${id}`, "contact_");
    const { error } = await supabase.from("crm_contacts").insert({ ...contact, account_id: id, created_by: me });
    if (error) fail(`${LIST}/${id}`, crmDbMessage(error, "The contact"));
  }

  revalidatePath(LIST);
  revalidatePath("/crm");
  redirect(`${LIST}/${id}`);
}

/* ---------------- update ---------------- */

export async function updateAccount(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id, fd.get("tab"));
  const { supabase, me } = await gate(back);
  const section = String(fd.get("section") ?? "");
  const fields = SECTION_FIELDS[section];
  if (!fields) fail(back, "Unknown form.");
  const row = parseFields(fd, fields, back);
  if (typeof row.name === "string") row.name = row.name.replace(/\s+/g, " ");

  const { data: before, error: readErr } = await supabase
    .from("crm_accounts")
    .select("name, status, fit_tier, warmth, next_step, next_step_due, demo_for_key")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !before) fail(LIST, "That account no longer exists.");

  /* claim the demo key from the name if the account has none yet */
  const patch: Record<string, unknown> = { ...row, updated_at: new Date().toISOString() };
  if (!before.demo_for_key) {
    const label = sanitizeForLabel(String(row.name ?? before.name));
    const key = label ? forKey(label) : "";
    if (key) patch.demo_for_key = key;
  }
  let { error } = await supabase.from("crm_accounts").update(patch).eq("id", id);
  if (error?.code === "23505" && "demo_for_key" in patch && /demo_for_key/.test(error.message ?? "")) {
    delete patch.demo_for_key;
    ({ error } = await supabase.from("crm_accounts").update(patch).eq("id", id));
  }
  if (error) fail(back, crmDbMessage(error, section === "profile" ? "The profile" : "The account"));

  /* field_change events for the moves worth seeing on the timeline */
  const changes: { field: string; from: unknown; to: unknown }[] = [];
  for (const k of ["name", "status", "fit_tier", "warmth", "next_step_due"]) {
    if (k in row && String(row[k] ?? "") !== String((before as Record<string, unknown>)[k] ?? "")) {
      changes.push({ field: k, from: (before as Record<string, unknown>)[k] ?? null, to: row[k] ?? null });
    }
  }
  if (changes.length) {
    await logCrmEvent(supabase, me, {
      account_id: id,
      kind: "field_change",
      body: changes.map(describeChange).join(". "),
      meta: { changes },
    });
  }

  revalidatePath(`${LIST}/${id}`);
  revalidatePath(LIST);
  revalidatePath("/crm");
  redirect(back);
}

function describeChange(c: { field: string; from: unknown; to: unknown }): string {
  const v = (x: unknown) => (x === null || x === undefined || x === "" ? "not set" : String(x));
  switch (c.field) {
    case "status":
      return `Status moved from ${ACCOUNT_STATUS_LABELS[v(c.from)] ?? v(c.from)} to ${ACCOUNT_STATUS_LABELS[v(c.to)] ?? v(c.to)}`;
    case "fit_tier":
      return `Fit tier set to ${v(c.to)}`;
    case "warmth":
      return `Warmth set to ${v(c.to)} of 5`;
    case "next_step_due":
      return `Next step due ${v(c.to)}`;
    case "name":
      return `Renamed from ${v(c.from)}`;
    default:
      return `${c.field} changed`;
  }
}

/* ---------------- owner ---------------- */

export async function setAccountOwner(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id, fd.get("tab"));
  const { supabase, me } = await gate(back);
  const v = String(fd.get("owner") ?? "");
  if (v !== "me" && v !== "none") fail(back, "Pick an owner.");
  const { error } = await supabase
    .from("crm_accounts")
    .update({ owner_id: v === "me" ? me : null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The owner"));
  revalidatePath(`${LIST}/${id}`);
  revalidatePath(LIST);
  redirect(back);
}

/* ---------------- archive / restore ---------------- */

export async function archiveAccount(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id);
  const { supabase, me } = await gate(back);
  if (String(fd.get("confirm") ?? "") !== "archive") fail(back, 'Type "archive" to confirm.');
  const now = new Date().toISOString();
  const { error } = await supabase.from("crm_accounts").update({ archived_at: now, updated_at: now }).eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The archive"));
  await logCrmEvent(supabase, me, { account_id: id, kind: "field_change", body: "Account archived", meta: { archived: true } });
  revalidatePath(LIST);
  revalidatePath("/crm");
  redirect(`${LIST}?archived_one=1`);
}

export async function restoreAccount(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id);
  const { supabase, me } = await gate(back);
  const { error } = await supabase
    .from("crm_accounts")
    .update({ archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error)
    fail(
      back,
      error.code === "23505"
        ? "A live account already uses this name. Rename one of them first."
        : crmDbMessage(error, "The restore"),
    );
  await logCrmEvent(supabase, me, { account_id: id, kind: "field_change", body: "Account restored", meta: { archived: false } });
  revalidatePath(LIST);
  redirect(back);
}

/* ---------------- bulk ---------------- */

export async function bulkAccounts(fd: FormData) {
  const qs = String(fd.get("return_qs") ?? "");
  const back = `${LIST}${qs.startsWith("?") ? qs.slice(0, 600) : ""}`;
  const { supabase, me } = await gate(back);
  const ids = [...new Set(fd.getAll("ids").map(String))].filter((x) => UUID_RE.test(x)).slice(0, 500);
  if (!ids.length) fail(back, "Tick at least one account first.");

  const patch: Record<string, unknown> = {};
  const status = String(fd.get("status") ?? "");
  if (status) {
    if (!(status in ACCOUNT_STATUS_LABELS)) fail(back, "Status has an unknown value.");
    patch.status = status;
  }
  const fit = String(fd.get("fit_tier") ?? "");
  if (fit) {
    if (fit === "none") patch.fit_tier = null;
    else if (fit in FIT_LABELS) patch.fit_tier = fit;
    else fail(back, "Fit tier has an unknown value.");
  }
  const owner = String(fd.get("owner") ?? "");
  if (owner === "me") patch.owner_id = me;
  else if (owner === "none") patch.owner_id = null;
  const archive = fd.get("archive") === "1";
  if (archive) patch.archived_at = new Date().toISOString();
  if (!Object.keys(patch).length) fail(back, "Pick a change to apply.");
  patch.updated_at = new Date().toISOString();

  const { data: before } = status
    ? await supabase.from("crm_accounts").select("id, status").in("id", ids)
    : { data: [] as { id: string; status: string }[] };
  const { error } = await supabase.from("crm_accounts").update(patch).in("id", ids);
  if (error) fail(back, crmDbMessage(error, "The bulk change"));

  const parts: string[] = [];
  if (archive) parts.push("Account archived");
  if (fit) parts.push(fit === "none" ? "Fit tier cleared" : `Fit tier set to ${fit}`);
  if (owner) parts.push(owner === "me" ? "Owner set" : "Owner cleared");
  const beforeById = new Map((before ?? []).map((r) => [r.id as string, r.status as string]));
  for (const id of ids) {
    const from = beforeById.get(id);
    const lines = [...parts];
    if (status && from !== status)
      lines.unshift(`Status moved from ${ACCOUNT_STATUS_LABELS[from ?? ""] ?? from ?? "not set"} to ${ACCOUNT_STATUS_LABELS[status]}`);
    if (!lines.length) continue;
    await logCrmEvent(supabase, me, {
      account_id: id,
      kind: "field_change",
      body: `${lines.join(". ")} (bulk)`,
      meta: { bulk: true, ...(status ? { changes: [{ field: "status", from: from ?? null, to: status }] } : {}) },
    });
  }
  revalidatePath(LIST);
  revalidatePath("/crm");
  redirect(back);
}

/* ---------------- contacts ---------------- */

function contactRow(fd: FormData, back: string, prefix = ""): Record<string, unknown> {
  const fields: Field[] = [
    { k: `${prefix}name`, t: "str", label: "Name", max: 160, required: true },
    { k: `${prefix}title`, t: "str", label: "Title", max: 160 },
    { k: `${prefix}role`, t: "enum", label: "Role", opts: CONTACT_ROLE_LABELS },
    { k: `${prefix}email`, t: "str", label: "Email", max: 320 },
    { k: `${prefix}phone`, t: "str", label: "Phone", max: 40 },
    { k: `${prefix}linkedin_url`, t: "str", label: "LinkedIn URL", max: 300 },
    { k: `${prefix}notes`, t: "str", label: "Notes", max: 5000 },
  ];
  const parsed = parseFields(fd, fields, back);
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) row[k.slice(prefix.length)] = v;
  if (typeof row.email === "string") {
    row.email = row.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email as string)) fail(back, "That email address does not look right.");
  }
  if (typeof row.linkedin_url === "string" && !/^(https?:\/\/)?([\w-]+\.)?linkedin\.com\//i.test(row.linkedin_url as string))
    fail(back, "The LinkedIn URL should be a linkedin.com link.");
  if ("role" in row && !row.role) row.role = "other";
  return row;
}

export async function addContact(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id, fd.get("tab"));
  const { supabase, me } = await gate(back);
  const row = contactRow(fd, back);
  const { error } = await supabase.from("crm_contacts").insert({ ...row, account_id: id, created_by: me });
  if (error) fail(back, crmDbMessage(error, "The contact"));
  revalidatePath(`${LIST}/${id}`);
  redirect(back);
}

export async function updateContact(fd: FormData) {
  const id = idFrom(fd);
  const contactId = idFrom(fd, "contact_id");
  const back = accountBack(id, fd.get("tab"));
  const { supabase } = await gate(back);
  const row = contactRow(fd, back);
  const { error } = await supabase
    .from("crm_contacts")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("account_id", id);
  if (error) fail(back, crmDbMessage(error, "The contact"));
  revalidatePath(`${LIST}/${id}`);
  redirect(back);
}

export async function deleteContact(fd: FormData) {
  const id = idFrom(fd);
  const contactId = idFrom(fd, "contact_id");
  const back = accountBack(id, fd.get("tab"));
  const { supabase } = await gate(back);
  const { error } = await supabase.from("crm_contacts").delete().eq("id", contactId).eq("account_id", id);
  if (error) fail(back, crmDbMessage(error, "Removing the contact"));
  revalidatePath(`${LIST}/${id}`);
  redirect(back);
}

/* ---------------- tasks ---------------- */

export async function addAccountTask(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id, fd.get("tab"));
  const { supabase, me } = await gate(back);
  const row = parseFields(
    fd,
    [
      { k: "title", t: "str", label: "Task", max: 300, required: true },
      { k: "due_date", t: "date", label: "Due date" },
      { k: "ball", t: "enum", label: "Ball", opts: BALL_OPTS },
      { k: "priority", t: "enum", label: "Priority", opts: PRIORITY_OPTS },
    ],
    back,
  );
  const ball = (row.ball as string | null) ?? "us";
  const contactId = await ownedId(supabase, "crm_contacts", fd.get("contact_id"), id, back, "That contact");
  const oppId = await ownedId(supabase, "crm_opportunities", fd.get("opportunity_id"), id, back, "That opportunity");
  const { error } = await supabase.from("crm_tasks").insert({
    account_id: id,
    opportunity_id: oppId,
    contact_id: contactId,
    title: row.title,
    due_date: row.due_date ?? null,
    ball,
    priority: (row.priority as string | null) ?? "normal",
    owner_id: me,
    waiting_since: ball === "us" ? null : new Date().toISOString(),
    created_by: me,
  });
  if (error) fail(back, crmDbMessage(error, "The task"));
  revalidatePath(`${LIST}/${id}`);
  revalidatePath("/crm", "layout");
  redirect(back);
}

/* An optional id from a select that must belong to this account. */
async function ownedId(
  supabase: Awaited<ReturnType<typeof gate>>["supabase"],
  table: "crm_contacts" | "crm_opportunities",
  raw: FormDataEntryValue | null,
  accountId: string,
  back: string,
  what: string,
): Promise<string | null> {
  const v = String(raw ?? "");
  if (!v) return null;
  if (!UUID_RE.test(v)) fail(back, `${what} is not valid.`);
  const { data } = await supabase.from(table).select("id").eq("id", v).eq("account_id", accountId).maybeSingle();
  if (!data) fail(back, `${what} is not on this account.`);
  return v;
}

/* ---------------- outreach log ---------------- */

export async function logOutreach(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id, fd.get("tab"));
  const { supabase, me } = await gate(back);
  const kind = String(fd.get("kind") ?? "");
  if (!(kind in OUTREACH_KINDS)) fail(back, "Pick what kind of touch this was.");
  const body = String(fd.get("body") ?? "").trim();
  if (!body) fail(back, "Write what happened first.");
  if (body.length > 20000) fail(back, "Keep the entry under 20,000 characters.");
  const today = todayIso();
  const day = String(fd.get("occurred_on") ?? "") || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(back, "The date must be a date.");
  if (day > today) fail(back, "Log touches that already happened. Use a task for future ones.");
  /* today keeps the real time; a past day lands at noon Central */
  const occurred_at = day === today ? new Date().toISOString() : `${day}T17:00:00Z`;
  const contactId = await ownedId(supabase, "crm_contacts", fd.get("contact_id"), id, back, "That contact");

  const { error } = await logCrmEvent(supabase, me, {
    account_id: id,
    contact_id: contactId,
    kind: kind as CrmEventKind,
    body,
    occurred_at,
  });
  if (error) fail(back, crmDbMessage({ message: error }, "The entry"));

  /* optional next step from the same form, and a first real touch moves a
     target to contacted */
  const patch: Record<string, unknown> = {};
  const nextStep = String(fd.get("next_step") ?? "").trim();
  if (nextStep) {
    if (nextStep.length > 300) fail(back, "Keep the next step under 300 characters.");
    patch.next_step = nextStep;
  }
  const nextDue = String(fd.get("next_step_due") ?? "");
  if (nextDue) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDue)) fail(back, "The next step date must be a date.");
    patch.next_step_due = nextDue;
  }
  if (kind !== "note") {
    const { data: acct } = await supabase.from("crm_accounts").select("status").eq("id", id).maybeSingle();
    if (acct?.status === "target") {
      patch.status = "contacted";
      await logCrmEvent(supabase, me, {
        account_id: id,
        kind: "field_change",
        body: "Status moved from Target to Contacted",
        meta: { changes: [{ field: "status", from: "target", to: "contacted" }], auto: true },
      });
    }
  }
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    const { error: upErr } = await supabase.from("crm_accounts").update(patch).eq("id", id);
    if (upErr) fail(back, crmDbMessage(upErr, "The next step"));
  }

  revalidatePath(`${LIST}/${id}`);
  revalidatePath(LIST);
  revalidatePath("/crm");
  redirect(back);
}

/* ---------------- start an opportunity ---------------- */

export async function startOpportunity(fd: FormData) {
  const id = idFrom(fd);
  const back = accountBack(id);
  const { supabase, me } = await gate(back);
  const { data: acct } = await supabase
    .from("crm_accounts")
    .select("id, name, status, locations")
    .eq("id", id)
    .maybeSingle();
  if (!acct) fail(LIST, "That account no longer exists.");
  const stageIn = String(fd.get("stage") ?? "");
  const stage = stageIn === "target" || stageIn === "contacted" ? stageIn : acct.status === "target" ? "target" : "contacted";
  const contactId = await ownedId(supabase, "crm_contacts", fd.get("primary_contact_id"), id, back, "That contact");
  const plan = suggestPlan(acct.locations as number | null);

  const { data, error } = await supabase
    .from("crm_opportunities")
    .insert({
      account_id: id,
      name: String(acct.name).slice(0, 160),
      stage,
      plan_tier: plan,
      primary_contact_id: contactId,
      owner_id: me,
      created_by: me,
    })
    .select("id")
    .single();
  if (error || !data) fail(back, crmDbMessage(error, "The opportunity"));
  await logCrmEvent(supabase, me, {
    account_id: id,
    opportunity_id: data.id as string,
    kind: "stage_change",
    body: "Opportunity opened",
    meta: { from: null, to: stage, opened: true },
  });
  revalidatePath(`${LIST}/${id}`);
  revalidatePath(LIST);
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm");
  redirect(back);
}
