"use server";

/* Opportunity-record server actions, ported from the EDC deals actions
   (deals/actions.ts plus the deal, stage, note and task parts of the shared
   actions.ts). A "use server" file may only export async functions:
   constants and labels live in ./_lib. Every action re-verifies the caller
   (superadmin + aal2) and RLS enforces the same rule again in Postgres
   through private.is_crm_admin(). */

import { redirect } from "next/navigation";
import { requireCrmAdmin, type CrmSession } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent, type CrmEventKind } from "@/lib/crm/events";
import { LOST_REASONS, TEMPLATE_STAGES, effectiveStages, todayIso } from "../format";
import { addDays, daysUntil } from "./_lib/dates";
import { BALLS, PRIORITIES, REPEATS } from "./_lib/labels";
import { revalidateOpportunity, stageBeforeLost, writeOpportunityStage } from "./_lib/server";

type Row = Record<string, unknown>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXPIRED = "Your CRM session expired. Sign in again with your second factor.";

/* A failed write must never look like a success: bounce back with plain
   words in the banner. Keeps any existing query string and hash. */
function fail(path: string, message: string): never {
  const [base, hash] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  redirect(`${base}${sep}error=${encodeURIComponent(message)}${hash ? `#${hash}` : ""}`);
}

async function session(back: string): Promise<CrmSession> {
  const s = await requireCrmAdmin();
  if (!s) fail(back, EXPIRED);
  return s;
}

/* ---------- input parsing: validate and cap everything server-side ---------- */

class InputError extends Error {}

function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
function text(fd: FormData, k: string, max: number): string | null {
  const v = str(fd, k);
  return v ? v.slice(0, max) : null;
}
function uuidOrNull(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return UUID_RE.test(v) ? v : null;
}
function num(fd: FormData, k: string, label: string, min: number, max: number): number | null {
  const raw = str(fd, k).replace(/[$,\s%]/g, "");
  if (!raw) return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) throw new InputError(`${label} must be between ${min} and ${max}.`);
  return v;
}
function date(fd: FormData, k: string, label: string): string | null {
  const v = str(fd, k);
  if (!v) return null;
  if (!DATE.test(v) || !Number.isFinite(Date.parse(v))) throw new InputError(`${label} is not a valid date.`);
  return v;
}
function oneOf<T extends string>(v: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
/* Only same-app paths are allowed as a return target. */
function safeReturn(fd: FormData, fallback: string): string {
  const v = str(fd, "return_to");
  if (v.startsWith("/crm/") && !v.startsWith("//") && !v.includes("\\") && v.length < 400) {
    return v.replace(/([?&])error=[^&#]*&?/, "$1").replace(/[?&](#|$)/, "$1");
  }
  return fallback;
}

function oppPath(id: string) {
  return `/crm/opportunities/${id}`;
}

function same(a: unknown, b: unknown): boolean {
  const an = a === undefined || a === "" ? null : a;
  const bn = b === undefined || b === "" ? null : b;
  if (an === null || bn === null) return an === bn;
  const na = Number(an);
  const nb = Number(bn);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return String(an) === String(bn);
}

/* Shared core for field edits on crm_opportunities: diff against a pre-read
   row, write only on change, log one field_change event. Never touches
   stage_changed_at. */
async function patchOppFields(fd: FormData, build: (before: Row, s: CrmSession) => Row, section: string) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = `${oppPath(id)}#${section}`;
  const s = await session(back);
  const { data: before, error: readErr } = await s.supabase
    .from("crm_opportunities")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) fail(back, crmDbMessage(readErr, "The opportunity"));
  if (!before) fail("/crm/pipeline", "That opportunity no longer exists.");
  let patch: Row;
  try {
    patch = build(before as Row, s);
  } catch (e) {
    if (e instanceof InputError) fail(back, e.message);
    throw e;
  }
  const changed = Object.keys(patch).filter((k) => !same((before as Row)[k], patch[k]));
  if (changed.length === 0) return;
  const diff: Row = {};
  const from: Row = {};
  for (const k of changed) {
    diff[k] = patch[k];
    from[k] = (before as Row)[k] ?? null;
  }
  const { error } = await s.supabase
    .from("crm_opportunities")
    .update({ ...diff, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The opportunity"));
  const ev = await logCrmEvent(s.supabase, s.me, {
    account_id: String(before.account_id),
    opportunity_id: id,
    kind: "field_change",
    meta: { fields: changed, from, to: diff },
  });
  revalidateOpportunity(id, String(before.account_id));
  if (ev.error) fail(back, `Saved, but the timeline entry was not logged: ${ev.error}`);
}

/* ---------------- stage ---------------- */

/* Back a stage / Advance stage buttons in the header. */
export async function moveOpportunityStage(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = safeReturn(fd, oppPath(id));
  const s = await session(back);
  const dir = str(fd, "dir");
  const { data: opp } = await s.supabase
    .from("crm_opportunities")
    .select("stage, custom_stages")
    .eq("id", id)
    .maybeSingle();
  if (!opp) fail("/crm/pipeline", "That opportunity no longer exists.");
  const stages = effectiveStages(opp.custom_stages as string[] | null);
  const idx = stages.indexOf(String(opp.stage));
  const next =
    dir === "back" ? stages[Math.max(0, idx - 1)] : stages[Math.min(stages.length - 1, idx < 0 ? 0 : idx + 1)];
  /* already at the end of the list: nothing to move, nothing to log */
  if (!next || next === opp.stage) return;
  const res = await writeOpportunityStage(s, id, next);
  if (res.error) fail(back, res.error);
}

/* The header's stage selector: any stage in the list, or lost with a reason. */
export async function setOpportunityStageForm(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = safeReturn(fd, oppPath(id));
  const s = await session(back);
  const stage = str(fd, "stage").slice(0, 40);
  if (!stage) fail(back, "Pick a stage.");
  const res =
    stage === "lost"
      ? await writeOpportunityStage(s, id, "lost", { reason: str(fd, "lost_reason"), note: text(fd, "lost_note", 2000) })
      : await writeOpportunityStage(s, id, stage);
  if (res.error) fail(back, res.error);
}

export async function markOpportunityWon(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = safeReturn(fd, oppPath(id));
  const s = await session(back);
  const res = await writeOpportunityStage(s, id, "won");
  if (res.error) fail(back, res.error);
}

export async function markOpportunityLost(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = safeReturn(fd, oppPath(id));
  const s = await session(back);
  const reason = str(fd, "lost_reason");
  if (!LOST_REASONS[reason]) fail(back, "Pick a reason the opportunity was lost.");
  const res = await writeOpportunityStage(s, id, "lost", { reason, note: text(fd, "lost_note", 2000) });
  if (res.error) fail(back, res.error);
}

/* Reopen: back to the stage it was lost from. */
export async function reopenOpportunity(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = safeReturn(fd, oppPath(id));
  const s = await session(back);
  const { data: opp } = await s.supabase
    .from("crm_opportunities")
    .select("stage, custom_stages")
    .eq("id", id)
    .maybeSingle();
  if (!opp) fail("/crm/pipeline", "That opportunity no longer exists.");
  if (opp.stage !== "lost") fail(back, "That opportunity is not marked lost.");
  const to = await stageBeforeLost(s, id, effectiveStages(opp.custom_stages as string[] | null));
  const res = await writeOpportunityStage(s, id, to);
  if (res.error) fail(back, res.error);
}

/* Per-opportunity stage list. Empty input restores the standard template. */
export async function setOpportunityCustomStages(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = `${oppPath(id)}#dx-stages`;
  const s = await session(back);
  const raw = str(fd, "stages").slice(0, 2000);
  const list = Array.from(
    new Set(
      raw
        .split(/[,\n]/)
        .map((v) => v.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 40))
        .filter((v) => v && v !== "lost"),
    ),
  ).slice(0, 20);
  const isTemplate =
    list.length === 0 || (list.length === TEMPLATE_STAGES.length && list.every((v, i) => v === TEMPLATE_STAGES[i]));
  const custom = isTemplate ? null : list;
  const { data: opp } = await s.supabase
    .from("crm_opportunities")
    .select("stage, account_id")
    .eq("id", id)
    .maybeSingle();
  if (!opp) fail("/crm/pipeline", "That opportunity no longer exists.");
  const stages = effectiveStages(custom);
  const now = new Date().toISOString();
  const patch: Row = { custom_stages: custom, updated_at: now };
  const moved = !stages.includes(String(opp.stage)) && opp.stage !== "lost";
  if (moved) {
    patch.stage = stages[0];
    patch.stage_changed_at = now;
  }
  const { error } = await s.supabase.from("crm_opportunities").update(patch).eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The stage list"));
  if (moved) {
    await logCrmEvent(s.supabase, s.me, {
      account_id: String(opp.account_id),
      opportunity_id: id,
      kind: "stage_change",
      meta: { from: opp.stage, to: stages[0] },
    });
  }
  revalidateOpportunity(id, String(opp.account_id));
}

/* ---------------- fields ---------------- */

/* 1. economics: plan, billing, MRR override, probability */
export async function updateOpportunityEconomics(fd: FormData) {
  await patchOppFields(
    fd,
    () => {
      const tier = str(fd, "plan_tier");
      const billing = str(fd, "billing");
      const p = num(fd, "close_probability", "Close probability", 0, 100);
      return {
        plan_tier: ["solo", "growth", "scale", "enterprise"].includes(tier) ? tier : null,
        billing: ["monthly", "annual"].includes(billing) ? billing : null,
        mrr: num(fd, "mrr", "Monthly value", 0, 99_999_999),
        close_probability: p === null ? null : Math.round(p),
      };
    },
    "dx-econ",
  );
}

/* 2. key dates */
export async function updateOpportunityDates(fd: FormData) {
  await patchOppFields(fd, () => ({ target_close: date(fd, "target_close", "Target close") }), "dx-dates");
}

/* 3. owner and name. admin_users is readable own-row only, so an owner can
   be set to me, cleared, or left as whoever it already was. */
export async function updateOpportunityOwner(fd: FormData) {
  await patchOppFields(
    fd,
    (before, s) => {
      const owner_id = uuidOrNull(fd, "owner_id");
      if (owner_id && owner_id !== s.me && owner_id !== before.owner_id) {
        throw new InputError("The owner must be a DSO Hire founder.");
      }
      const name = text(fd, "name", 160);
      if (fd.has("name") && !name) throw new InputError("An opportunity needs a name.");
      const patch: Row = { owner_id };
      if (name) patch.name = name;
      return patch;
    },
    "dx-head",
  );
}

/* 4. notes */
export async function updateOpportunityNotes(fd: FormData) {
  await patchOppFields(fd, () => ({ notes: text(fd, "notes", 20000) }), "dx-notes");
}

/* 5. primary contact: must belong to the opportunity's account */
export async function setPrimaryContact(fd: FormData) {
  const contactId = uuidOrNull(fd, "primary_contact_id");
  if (contactId) {
    const id = uuidOrNull(fd, "id");
    const s = await session(id ? `${oppPath(id)}#dx-contact` : "/crm/pipeline");
    const { data: c } = await s.supabase.from("crm_contacts").select("account_id").eq("id", contactId).maybeSingle();
    const { data: o } = id
      ? await s.supabase.from("crm_opportunities").select("account_id").eq("id", id).maybeSingle()
      : { data: null };
    if (!c || !o || c.account_id !== o.account_id) {
      fail(id ? `${oppPath(id)}#dx-contact` : "/crm/pipeline", "Pick a contact at this account.");
    }
  }
  await patchOppFields(fd, () => ({ primary_contact_id: contactId }), "dx-contact");
}

/* 6. next step, optionally also a task */
export async function setOpportunityNextStep(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = `${oppPath(id)}#dx-next`;
  const s = await session(back);
  let next_step: string | null;
  let next_step_due: string | null;
  try {
    next_step = text(fd, "next_step", 300);
    next_step_due = date(fd, "next_step_due", "Next step due date");
  } catch (e) {
    if (e instanceof InputError) fail(back, e.message);
    throw e;
  }
  const { data: opp, error: readErr } = await s.supabase
    .from("crm_opportunities")
    .select("account_id, owner_id, next_step, next_step_due")
    .eq("id", id)
    .maybeSingle();
  if (readErr) fail(back, crmDbMessage(readErr, "The next step"));
  if (!opp) fail("/crm/pipeline", "That opportunity no longer exists.");
  const accountId = String(opp.account_id);
  const { error } = await s.supabase
    .from("crm_opportunities")
    .update({ next_step, next_step_due, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The next step"));
  if (!same(opp.next_step, next_step) || !same(opp.next_step_due, next_step_due)) {
    const ev = await logCrmEvent(s.supabase, s.me, {
      account_id: accountId,
      opportunity_id: id,
      kind: "field_change",
      meta: {
        fields: ["next_step", "next_step_due"],
        from: { next_step: opp.next_step ?? null, next_step_due: opp.next_step_due ?? null },
        to: { next_step, next_step_due },
      },
    });
    if (ev.error) fail(back, `Next step saved, but the timeline entry was not logged: ${ev.error}`);
  }
  if (next_step && str(fd, "make_task") === "on") {
    const d = daysUntil(next_step_due);
    const { error: taskErr } = await s.supabase.from("crm_tasks").insert({
      account_id: accountId,
      opportunity_id: id,
      title: next_step,
      ball: "us",
      owner_id: (opp.owner_id as string | null) ?? s.me,
      due_date: next_step_due,
      priority: d !== null && d <= 3 ? "high" : "normal",
      waiting_since: new Date().toISOString(),
      created_by: s.me,
    });
    if (taskErr) fail(back, `Next step saved, but the task was not added: ${taskErr.message}`);
  }
  revalidateOpportunity(id, accountId);
}

/* ---------------- activity ---------------- */

const LOGGABLE: CrmEventKind[] = ["note", "email", "call", "meeting", "linkedin"];

/* Log a note, email, call, meeting or LinkedIn touch on the timeline.
   Outreach kinds also move the account's last touch (logCrmEvent). */
export async function logOpportunityActivity(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  if (!id) fail("/crm/pipeline", "Missing opportunity.");
  const back = safeReturn(fd, `${oppPath(id)}#dx-timeline`);
  const s = await session(back);
  const kind = oneOf(str(fd, "kind"), LOGGABLE, "note");
  const body = text(fd, "body", 20000);
  if (!body) fail(back, "Write what happened first.");
  let occurred_at: string | undefined;
  try {
    const on = date(fd, "occurred_on", "Date");
    if (on && on !== todayIso()) occurred_at = `${on}T17:00:00.000Z`;
  } catch (e) {
    if (e instanceof InputError) fail(back, e.message);
    throw e;
  }
  const { data: opp } = await s.supabase
    .from("crm_opportunities")
    .select("account_id")
    .eq("id", id)
    .maybeSingle();
  if (!opp) fail("/crm/pipeline", "That opportunity no longer exists.");
  const accountId = String(opp.account_id);
  let contact_id = uuidOrNull(fd, "contact_id");
  if (contact_id) {
    const { data: c } = await s.supabase.from("crm_contacts").select("account_id").eq("id", contact_id).maybeSingle();
    if (!c || c.account_id !== accountId) contact_id = null;
  }
  const res = await logCrmEvent(s.supabase, s.me, {
    account_id: accountId,
    opportunity_id: id,
    contact_id,
    kind,
    body,
    occurred_at,
  });
  if (res.error) fail(back, crmDbMessage({ message: res.error }, "The activity"));
  revalidateOpportunity(id, accountId);
}

/* ---------------- tasks ---------------- */

async function ownerOk(s: CrmSession, owner: string | null, current: unknown): Promise<boolean> {
  return !owner || owner === s.me || owner === current;
}

export async function addOpportunityTask(fd: FormData) {
  const id = uuidOrNull(fd, "opportunity_id");
  if (!id) fail("/crm/pipeline", "Pick the opportunity this task belongs to.");
  const back = safeReturn(fd, `${oppPath(id)}#dx-tasks`);
  const s = await session(back);
  const title = text(fd, "title", 300);
  if (!title) fail(back, "A task needs a title.");
  let due_date: string | null;
  try {
    due_date = date(fd, "due_date", "Due date");
  } catch (e) {
    if (e instanceof InputError) fail(back, e.message);
    throw e;
  }
  const { data: opp } = await s.supabase
    .from("crm_opportunities")
    .select("account_id, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!opp) fail("/crm/pipeline", "That opportunity no longer exists.");
  const accountId = String(opp.account_id);
  const owner_id = fd.has("owner_id") ? uuidOrNull(fd, "owner_id") : ((opp.owner_id as string | null) ?? s.me);
  if (!(await ownerOk(s, owner_id, opp.owner_id))) fail(back, "Task owners must be DSO Hire founders.");
  let contact_id = uuidOrNull(fd, "contact_id");
  if (contact_id) {
    const { data: c } = await s.supabase.from("crm_contacts").select("account_id").eq("id", contact_id).maybeSingle();
    if (!c || c.account_id !== accountId) contact_id = null;
  }
  const { error } = await s.supabase.from("crm_tasks").insert({
    account_id: accountId,
    opportunity_id: id,
    contact_id,
    title,
    notes: text(fd, "notes", 5000),
    ball: oneOf(str(fd, "ball"), BALLS, "us"),
    priority: oneOf(str(fd, "priority"), PRIORITIES, "normal"),
    repeat: oneOf(str(fd, "repeat"), REPEATS, "none"),
    owner_id,
    due_date,
    waiting_since: new Date().toISOString(),
    created_by: s.me,
  });
  if (error) fail(back, crmDbMessage(error, "The task"));
  revalidateOpportunity(id, accountId);
}

/* Complete or reopen. A completed repeating task spawns its next occurrence,
   and a completion lands on the timeline as task_done. */
export async function toggleOpportunityTask(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  const oppId = uuidOrNull(fd, "opportunity_id");
  const back = safeReturn(fd, oppId ? `${oppPath(oppId)}#dx-tasks` : "/crm/tasks");
  if (!id) fail(back, "Missing task.");
  const s = await session(back);
  const completing = str(fd, "done") !== "true";
  const { data: task, error } = await s.supabase
    .from("crm_tasks")
    .update({ completed_at: completing ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) fail(back, crmDbMessage(error, "The task"));
  if (!task) fail(back, "That task no longer exists.");
  const t = task as Row;
  if (completing && t.repeat && t.repeat !== "none") {
    const base = t.due_date ? String(t.due_date) : todayIso();
    let next: string;
    if (t.repeat === "weekly") next = addDays(base, 7);
    else {
      const d = new Date(`${base}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + 1);
      next = d.toISOString().slice(0, 10);
    }
    const { error: nextErr } = await s.supabase.from("crm_tasks").insert({
      account_id: t.account_id ?? null,
      opportunity_id: t.opportunity_id ?? null,
      contact_id: t.contact_id ?? null,
      title: t.title,
      notes: t.notes ?? null,
      ball: t.ball,
      priority: t.priority ?? "normal",
      repeat: t.repeat,
      owner_id: t.owner_id ?? null,
      due_date: next,
      waiting_since: new Date().toISOString(),
      created_by: s.me,
    });
    if (nextErr) fail(back, `Task completed, but the next occurrence was not created: ${nextErr.message}`);
  }
  if (completing && t.account_id) {
    await logCrmEvent(s.supabase, s.me, {
      account_id: String(t.account_id),
      opportunity_id: (t.opportunity_id as string | null) ?? null,
      contact_id: (t.contact_id as string | null) ?? null,
      kind: "task_done",
      body: String(t.title),
      meta: { task_id: id },
    });
  }
  revalidateOpportunity((t.opportunity_id as string | null) ?? oppId, (t.account_id as string | null) ?? null);
}

export async function updateOpportunityTask(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  const fallback = "/crm/tasks";
  if (!id) fail(fallback, "Missing task.");
  const s = await session(safeReturn(fd, fallback));
  const { data: task, error: readErr } = await s.supabase.from("crm_tasks").select("*").eq("id", id).maybeSingle();
  if (readErr || !task) fail(safeReturn(fd, fallback), readErr?.message ?? "That task no longer exists.");
  const t = task as Row;
  const back = safeReturn(fd, t.opportunity_id ? `${oppPath(String(t.opportunity_id))}#dx-tasks` : fallback);
  const title = text(fd, "title", 300);
  if (!title) fail(back, "A task needs a title.");
  let due_date: string | null;
  try {
    due_date = date(fd, "due_date", "Due date");
  } catch (e) {
    if (e instanceof InputError) fail(back, e.message);
    throw e;
  }
  const ball = oneOf(str(fd, "ball"), BALLS, t.ball as (typeof BALLS)[number]);
  const owner_id = uuidOrNull(fd, "owner_id");
  if (!(await ownerOk(s, owner_id, t.owner_id))) fail(back, "Task owners must be DSO Hire founders.");
  /* fields a form does not carry are left as they are */
  const patch: Row = {
    title,
    due_date,
    ball,
    priority: oneOf(str(fd, "priority"), PRIORITIES, "normal"),
    owner_id,
  };
  if (fd.has("notes")) patch.notes = text(fd, "notes", 5000);
  if (fd.has("contact_id")) {
    let contact_id = uuidOrNull(fd, "contact_id");
    if (contact_id && t.account_id) {
      const { data: c } = await s.supabase.from("crm_contacts").select("account_id").eq("id", contact_id).maybeSingle();
      if (!c || c.account_id !== t.account_id) contact_id = null;
    }
    patch.contact_id = contact_id;
  }
  if (ball !== t.ball) patch.waiting_since = new Date().toISOString();
  const { error } = await s.supabase.from("crm_tasks").update(patch).eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The task"));
  revalidateOpportunity((t.opportunity_id as string | null) ?? null, (t.account_id as string | null) ?? null);
}

/* Snooze by a day or a week from max(today, due). */
export async function snoozeOpportunityTask(fd: FormData) {
  const id = uuidOrNull(fd, "id");
  const fallback = "/crm/tasks";
  if (!id) fail(fallback, "Missing task.");
  const s = await session(safeReturn(fd, fallback));
  const days = Number(str(fd, "days")) === 7 ? 7 : 1;
  const { data: task, error: readErr } = await s.supabase
    .from("crm_tasks")
    .select("opportunity_id, account_id, due_date")
    .eq("id", id)
    .maybeSingle();
  if (readErr || !task) fail(safeReturn(fd, fallback), readErr?.message ?? "That task no longer exists.");
  const back = safeReturn(fd, task.opportunity_id ? `${oppPath(String(task.opportunity_id))}#dx-tasks` : fallback);
  const today = todayIso();
  const base = task.due_date && String(task.due_date) > today ? String(task.due_date) : today;
  const { error } = await s.supabase
    .from("crm_tasks")
    .update({ due_date: addDays(base, days) })
    .eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The task"));
  revalidateOpportunity((task.opportunity_id as string | null) ?? null, (task.account_id as string | null) ?? null);
}
