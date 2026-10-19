"use server";

import { revalidatePath } from "next/cache";
import { requireCrmAdmin } from "@/lib/crm/auth";
import { logCrmEvent } from "@/lib/crm/events";
import { TEMPLATE_STAGES, todayIso } from "../format";

/*
 * Workspace actions (Today, Cmd-K, the bell, Settings). Each one re-checks
 * the caller the way the shared requireAdmin does, then lets RLS enforce
 * again underneath. They return {error} instead of redirecting so client
 * UIs can show an inline result. They write only to crm_user_prefs,
 * crm_notification_reads, crm_workspace_settings, and the minimal create
 * rows for quick create and quick note.
 */

/* Thrown, not redirected: a stale tab whose session dropped to aal1 gets
   the error boundary's plain words instead of a half-applied write. */
async function requireAdminWs() {
  const session = await requireCrmAdmin();
  if (!session) throw new Error("Your CRM session expired. Sign in again with your second factor.");
  return { supabase: session.supabase, user: session.user };
}

type Result = { error: string | null };

/* A missing table (migration not applied yet) gets plain words, not a
   PostgREST code. */
function dbMessage(err: { code?: string; message?: string } | null, what: string): string {
  if (!err) return `${what} did not save.`;
  if (err.code === "42P01" || err.code === "PGRST205" || /does not exist|schema cache/i.test(err.message ?? ""))
    return `${what} needs the workspace migration, which is not applied to this database yet.`;
  if (err.code === "42501") return `${what} was refused by the database permissions.`;
  return `${what} did not save: ${err.message ?? "unknown error"}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------------- per-user preferences ---------------- */

export type PrefsPatch = {
  density?: string;
  motion?: string;
  today_scope?: string;
  quiet_after_days?: number | string;
};

export async function savePrefs(patch: PrefsPatch): Promise<Result> {
  const { supabase, user } = await requireAdminWs();
  if (!patch || typeof patch !== "object") return { error: "Nothing to save." };
  const row: Record<string, unknown> = {};
  if (patch.density !== undefined) {
    if (patch.density !== "comfortable" && patch.density !== "compact")
      return { error: "Density must be comfortable or compact." };
    row.density = patch.density;
  }
  if (patch.motion !== undefined) {
    if (patch.motion !== "full" && patch.motion !== "reduced")
      return { error: "Motion must be full or reduced." };
    row.motion = patch.motion;
  }
  if (patch.today_scope !== undefined) {
    if (patch.today_scope !== "mine" && patch.today_scope !== "all")
      return { error: "Today must open on your work or everyone's." };
    row.today_scope = patch.today_scope;
  }
  if (patch.quiet_after_days !== undefined) {
    const n = Number(patch.quiet_after_days);
    if (!Number.isInteger(n) || n < 3 || n > 90)
      return { error: "Quiet after must be a whole number of days from 3 to 90." };
    row.quiet_after_days = n;
  }
  if (Object.keys(row).length === 0) return { error: "Nothing to save." };
  const { error } = await supabase
    .from("crm_user_prefs")
    .upsert({ user_id: user.id, ...row, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return { error: dbMessage(error, "Preferences") };
  revalidatePath("/crm", "layout");
  return { error: null };
}

/* ---------------- notification read state ---------------- */

export async function markNotificationsSeen(): Promise<Result> {
  const { supabase, user } = await requireAdminWs();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("crm_user_prefs")
    .upsert({ user_id: user.id, bell_seen_at: now, updated_at: now }, { onConflict: "user_id" });
  if (error) return { error: dbMessage(error, "Read state") };
  return { error: null };
}

const EVENT_KEY = /^(lead|demo|task|ev|opp)-[A-Za-z0-9-]{1,100}$/;

export async function markNotificationRead(key: string): Promise<Result> {
  const { supabase, user } = await requireAdminWs();
  if (typeof key !== "string" || !EVENT_KEY.test(key)) return { error: "Unknown notification." };
  const { error } = await supabase
    .from("crm_notification_reads")
    .upsert({ user_id: user.id, event_key: key }, { onConflict: "user_id,event_key", ignoreDuplicates: true });
  if (error) return { error: dbMessage(error, "Read mark") };
  return { error: null };
}

/* ---------------- shared stage weights ---------------- */

export async function saveStageWeights(formData: FormData): Promise<Result> {
  const { supabase, user } = await requireAdminWs();
  const stages = TEMPLATE_STAGES.filter((s) => s !== "won");
  const weights: Record<string, number> = {};
  let prev = -1;
  for (const s of stages) {
    const raw = String(formData.get(`w_${s}`) ?? "").trim();
    if (raw === "") return { error: `Enter a weight for every stage (missing ${s.replace(/_/g, " ")}).` };
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n > 100)
      return { error: "Each weight must be a whole percent from 0 to 100." };
    if (n < prev)
      return { error: "Weights must not go down as an opportunity moves forward. Check the stage order." };
    prev = n;
    weights[s] = n / 100;
  }
  const { error } = await supabase
    .from("crm_workspace_settings")
    .upsert(
      { id: true, stage_weights: weights, updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
  if (error) return { error: dbMessage(error, "Weights") };
  revalidatePath("/crm");
  revalidatePath("/crm/reports");
  revalidatePath("/crm/settings");
  return { error: null };
}

/* ---------------- palette quick actions ---------------- */

export async function quickCreate(
  kind: string,
  name: string,
): Promise<{ id: string | null; error: string | null }> {
  const { supabase, user } = await requireAdminWs();
  const clean = String(name ?? "").replace(/\s+/g, " ").trim();
  if (clean.length < 2 || clean.length > 120)
    return { id: null, error: "Use a name from 2 to 120 characters." };
  if (kind !== "account" && kind !== "opportunity") return { id: null, error: "Unknown record type." };

  /* Both kinds start from an account: an opportunity always belongs to one,
     so "New opportunity: Acme Dental" reuses Acme's account when it exists. */
  const { data: existing } = await supabase
    .from("crm_accounts")
    .select("id")
    .ilike("name", clean)
    .is("archived_at", null)
    .limit(1)
    .maybeSingle();
  let accountId = existing?.id as string | undefined;
  if (!accountId) {
    const res = await supabase
      .from("crm_accounts")
      .insert({ name: clean, source: "other", owner_id: user.id, created_by: user.id })
      .select("id")
      .single();
    if (res.error || !res.data) return { id: null, error: dbMessage(res.error, "The account") };
    accountId = res.data.id as string;
  } else if (kind === "account") {
    return { id: null, error: `${clean} is already an account.` };
  }
  revalidatePath("/crm/accounts");
  if (kind === "account") return { id: `a:${accountId}`, error: null };

  const res = await supabase
    .from("crm_opportunities")
    .insert({ account_id: accountId, name: clean, owner_id: user.id, created_by: user.id })
    .select("id")
    .single();
  if (res.error || !res.data) return { id: null, error: dbMessage(res.error, "The opportunity") };
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm");
  return { id: `o:${res.data.id as string}`, error: null };
}

export async function quickLogNote(
  accountId: string,
  body: string,
): Promise<{ error: string | null; name?: string }> {
  const { supabase, user } = await requireAdminWs();
  if (typeof accountId !== "string" || !UUID.test(accountId)) return { error: "Pick an account first." };
  const text = String(body ?? "").trim();
  if (text.length < 1) return { error: "Write the note first." };
  if (text.length > 4000) return { error: "Keep a note under 4,000 characters." };
  const { data: account } = await supabase
    .from("crm_accounts")
    .select("id, name")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return { error: "That account no longer exists." };
  const { error } = await supabase.from("crm_events").insert({
    account_id: accountId,
    kind: "note",
    body: text,
    created_by: user.id,
  });
  if (error) return { error: dbMessage(error, "The note") };
  revalidatePath(`/crm/accounts/${accountId}`);
  revalidatePath("/crm");
  return { error: null, name: account.name as string };
}

/* ---------------- task check-off (Today, account and opportunity rows) ----------------
   A form action: id, done ("true" reopens). Completing logs task_done on the
   account timeline, and a repeating task spawns its next occurrence. */

export async function toggleTask(formData: FormData): Promise<void> {
  const { supabase, user } = await requireAdminWs();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  const completing = String(formData.get("done") ?? "") !== "true";
  const { data: task, error } = await supabase
    .from("crm_tasks")
    .update({ completed_at: completing ? new Date().toISOString() : null })
    .eq("id", id)
    .select("*")
    .single();
  if (error || !task) throw new Error(dbMessage(error, "The task"));
  if (completing && task.account_id) {
    await logCrmEvent(supabase, user.id, {
      account_id: task.account_id as string,
      opportunity_id: (task.opportunity_id as string | null) ?? null,
      kind: "task_done",
      body: task.title as string,
    });
  }
  if (completing && task.repeat !== "none") {
    const base = new Date(`${(task.due_date as string | null) ?? todayIso()}T12:00:00Z`);
    if (task.repeat === "weekly") base.setUTCDate(base.getUTCDate() + 7);
    else base.setUTCMonth(base.getUTCMonth() + 1);
    const { error: nextErr } = await supabase.from("crm_tasks").insert({
      account_id: task.account_id,
      opportunity_id: task.opportunity_id,
      contact_id: task.contact_id,
      title: task.title,
      notes: task.notes,
      ball: task.ball,
      priority: task.priority,
      repeat: task.repeat,
      owner_id: task.owner_id,
      due_date: base.toISOString().slice(0, 10),
      waiting_since: task.ball === "us" ? null : new Date().toISOString(),
      created_by: user.id,
    });
    if (nextErr) throw new Error(dbMessage(nextErr, "The next occurrence"));
  }
  revalidatePath("/crm", "layout");
}
