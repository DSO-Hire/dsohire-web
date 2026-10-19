"use server";

/*
 * Tasks page actions (2026-10-19), ported from the EDC CRM's tasks view
 * (addTask / toggleTask in actions.ts, snoozeTask / updateTask /
 * setTasksDone in deals/actions.ts). Completing a task linked to an account
 * logs task_done on that account's timeline, and a repeating task spawns
 * its next occurrence. Form actions bounce back with ?error= on failure;
 * setTasksDone returns {error} for the client bulk bar.
 *
 * "use server" rule: this module exports only async functions.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCrmAdmin, type CrmSession } from "@/lib/crm/auth";
import { UUID_RE, crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { isoPlusDays, todayIso } from "../format";

const TASKS = "/crm/tasks";
const BALLS = ["us", "prospect", "partner"];
const PRIORITIES = ["high", "normal", "low"];
const REPEATS = ["none", "weekly", "monthly"];
const SNOOZE_DAYS = [1, 3, 7];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Supa = CrmSession["supabase"];
type TaskRow = Record<string, unknown> & {
  id: string;
  title: string;
  account_id: string | null;
  opportunity_id: string | null;
  repeat: string;
  due_date: string | null;
  ball: string;
};

function backOf(formData: FormData): string {
  const raw = String(formData.get("return_to") ?? "");
  return raw.startsWith(TASKS) && raw.length <= 400 && !raw.includes("//") ? raw : TASKS;
}

function fail(back: string, msg: string): never {
  const clean = back.replace(/([?&])error=[^&]*&?/, "$1").replace(/[?&]$/, "");
  redirect(`${clean}${clean.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);
}

async function session(back: string): Promise<CrmSession> {
  const s = await requireCrmAdmin();
  if (!s) fail(back, "Your CRM session expired. Sign in again with your second factor.");
  return s;
}

/* Owners: me, or nobody. Other admins' rows are not readable from an admin
   session, so an id we cannot verify is refused. */
function ownerFrom(raw: unknown, me: string): string | null | undefined {
  const v = String(raw ?? "").trim();
  if (v === "" || v === "none") return null;
  if (v === "me" || v === me) return me;
  return undefined;
}

function dateOrNull(raw: unknown): string | null | undefined {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  return DATE_RE.test(v) ? v : undefined;
}

function revalidateTasks(accountIds: (string | null)[] = []) {
  revalidatePath(TASKS);
  revalidatePath("/crm", "layout");
  for (const id of new Set(accountIds)) if (id) revalidatePath(`/crm/accounts/${id}`);
}

/* Complete open tasks: log task_done on each account and spawn the next
   occurrence of a repeating task. Returns a plain-words error or null. */
async function completeTasks(supabase: Supa, me: string, ids: string[]): Promise<{ error: string | null; accounts: (string | null)[] }> {
  const { data, error } = await supabase
    .from("crm_tasks")
    .update({ completed_at: new Date().toISOString() })
    .in("id", ids)
    .is("completed_at", null)
    .select("*");
  if (error) return { error: crmDbMessage(error, "The task"), accounts: [] };
  const done = (data ?? []) as TaskRow[];
  for (const task of done) {
    if (task.account_id) {
      await logCrmEvent(supabase, me, {
        account_id: task.account_id,
        opportunity_id: task.opportunity_id,
        contact_id: (task.contact_id as string | null) ?? null,
        kind: "task_done",
        body: task.title,
        meta: { task_id: task.id },
      });
    }
    if (task.repeat && task.repeat !== "none") {
      const base = new Date(`${task.due_date ?? todayIso()}T12:00:00Z`);
      if (task.repeat === "weekly") base.setUTCDate(base.getUTCDate() + 7);
      else base.setUTCMonth(base.getUTCMonth() + 1);
      const { error: nextErr } = await supabase.from("crm_tasks").insert({
        account_id: task.account_id,
        opportunity_id: task.opportunity_id,
        contact_id: task.contact_id ?? null,
        title: task.title,
        notes: task.notes ?? null,
        ball: task.ball,
        priority: task.priority ?? "normal",
        repeat: task.repeat,
        owner_id: task.owner_id ?? null,
        due_date: base.toISOString().slice(0, 10),
        waiting_since: task.ball === "us" ? null : new Date().toISOString(),
        created_by: me,
      });
      if (nextErr) {
        return {
          error: `Task completed, but ${crmDbMessage(nextErr, "the next occurrence").replace(/^The/, "the")}`,
          accounts: done.map((t) => t.account_id),
        };
      }
    }
  }
  return { error: null, accounts: done.map((t) => t.account_id) };
}

/* ---------------- add ---------------- */

export async function addTask(formData: FormData) {
  const back = backOf(formData);
  const { supabase, me } = await session(back);
  const title = String(formData.get("title") ?? "").trim();
  if (!title) fail(back, "Write what needs to happen.");
  if (title.length > 300) fail(back, "Keep a task title under 300 characters.");
  const accountRaw = String(formData.get("account_id") ?? "").trim();
  if (accountRaw && !UUID_RE.test(accountRaw)) fail(back, "That account is not valid.");
  const priority = String(formData.get("priority") ?? "normal");
  if (!PRIORITIES.includes(priority)) fail(back, "Pick High, Normal or Low.");
  const ball = String(formData.get("ball") ?? "us");
  if (!BALLS.includes(ball)) fail(back, "Pick whose court the ball is in.");
  const due_date = dateOrNull(formData.get("due_date"));
  if (due_date === undefined) fail(back, "That due date is not valid.");
  const owner_id = ownerFrom(formData.get("owner_id"), me);
  if (owner_id === undefined) fail(back, "Pick yourself or Unassigned.");

  const { error } = await supabase.from("crm_tasks").insert({
    title,
    account_id: accountRaw || null,
    priority,
    ball,
    due_date,
    owner_id,
    waiting_since: ball === "us" ? null : new Date().toISOString(),
    created_by: me,
  });
  if (error) fail(back, crmDbMessage(error, "The task"));
  revalidateTasks([accountRaw || null]);
  redirect(back);
}

/* ---------------- complete / reopen ---------------- */

export async function toggleTask(formData: FormData) {
  const back = backOf(formData);
  const { supabase, me } = await session(back);
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) fail(back, "That task is not valid.");
  const reopening = String(formData.get("done") ?? "") === "true";
  if (reopening) {
    const { data, error } = await supabase
      .from("crm_tasks")
      .update({ completed_at: null })
      .eq("id", id)
      .select("account_id")
      .maybeSingle();
    if (error) fail(back, crmDbMessage(error, "The task"));
    revalidateTasks([(data?.account_id as string | null | undefined) ?? null]);
    redirect(back);
  }
  const res = await completeTasks(supabase, me, [id]);
  revalidateTasks(res.accounts);
  if (res.error) fail(back, res.error);
  redirect(back);
}

/* Bulk mark done from the client bar. Returns {error}; never redirects. */
export async function setTasksDone(ids: string[]): Promise<{ error: string | null }> {
  const s = await requireCrmAdmin();
  if (!s) return { error: "Your CRM session expired. Sign in again with your second factor." };
  const clean = Array.from(
    new Set((Array.isArray(ids) ? ids : []).filter((v) => typeof v === "string" && UUID_RE.test(v))),
  ).slice(0, 200);
  if (clean.length === 0) return { error: "Nothing selected." };
  const res = await completeTasks(s.supabase, s.me, clean);
  revalidateTasks(res.accounts);
  return { error: res.error };
}

/* ---------------- snooze ---------------- */

export async function snoozeTask(formData: FormData) {
  const back = backOf(formData);
  const { supabase } = await session(back);
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) fail(back, "That task is not valid.");
  const days = Number(formData.get("days"));
  if (!SNOOZE_DAYS.includes(days)) fail(back, "Snooze by a day, three days, or a week.");
  const { data: task, error: readErr } = await supabase
    .from("crm_tasks")
    .select("due_date, account_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) fail(back, crmDbMessage(readErr, "The task"));
  if (!task) fail(back, "That task no longer exists.");
  const today = todayIso();
  const due = task.due_date as string | null;
  const base = due && due > today ? due : today;
  const { error } = await supabase.from("crm_tasks").update({ due_date: isoPlusDays(base, days) }).eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The snooze"));
  revalidateTasks([(task.account_id as string | null) ?? null]);
  redirect(back);
}

/* ---------------- edit ---------------- */

export async function updateTask(formData: FormData) {
  const back = backOf(formData);
  const { supabase, me } = await session(back);
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) fail(back, "That task is not valid.");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) fail(back, "A task needs a title.");
  if (title.length > 300) fail(back, "Keep a task title under 300 characters.");
  const priority = String(formData.get("priority") ?? "normal");
  if (!PRIORITIES.includes(priority)) fail(back, "Pick High, Normal or Low.");
  const ball = String(formData.get("ball") ?? "us");
  if (!BALLS.includes(ball)) fail(back, "Pick whose court the ball is in.");
  const repeat = String(formData.get("repeat") ?? "none");
  if (!REPEATS.includes(repeat)) fail(back, "Pick how often it repeats.");
  const due_date = dateOrNull(formData.get("due_date"));
  if (due_date === undefined) fail(back, "That due date is not valid.");
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length > 5000) fail(back, "Keep notes under 5,000 characters.");

  const { data: prev, error: readErr } = await supabase
    .from("crm_tasks")
    .select("ball, owner_id, waiting_since, account_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) fail(back, crmDbMessage(readErr, "The task"));
  if (!prev) fail(back, "That task no longer exists.");

  /* another admin's ownership is kept unless the form changes it */
  const ownerRaw = String(formData.get("owner_id") ?? "");
  const owner_id = ownerRaw === "keep" ? (prev.owner_id as string | null) : ownerFrom(ownerRaw, me);
  if (owner_id === undefined) fail(back, "Pick yourself or Unassigned.");

  const waiting_since =
    ball === "us" ? null : prev.ball === ball && prev.waiting_since ? prev.waiting_since : new Date().toISOString();
  const { error } = await supabase
    .from("crm_tasks")
    .update({ title, priority, ball, repeat, due_date, owner_id, notes: notes || null, waiting_since })
    .eq("id", id);
  if (error) fail(back, crmDbMessage(error, "The task"));
  revalidateTasks([(prev.account_id as string | null) ?? null]);
  redirect(back);
}
