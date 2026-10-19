/**
 * Shared CRM write helpers (2026-10-19). Every surface that changes a record
 * also appends to crm_events, the one timeline an account profile and an
 * opportunity record read. Outreach events (email, call, meeting, LinkedIn)
 * also move the account's last_touch_at, which drives the "gone quiet"
 * signals on Today and the accounts list. An internal note does not: it is
 * not contact with the prospect.
 */

import type { CrmSession } from "./auth";

type Supa = CrmSession["supabase"];

export type CrmEventKind =
  | "note"
  | "email"
  | "call"
  | "meeting"
  | "linkedin"
  | "stage_change"
  | "field_change"
  | "demo_open"
  | "lead"
  | "won"
  | "lost"
  | "task_done"
  | "import";

export const TOUCH_KINDS: CrmEventKind[] = ["email", "call", "meeting", "linkedin"];

export async function logCrmEvent(
  supabase: Supa,
  me: string,
  ev: {
    account_id: string;
    opportunity_id?: string | null;
    contact_id?: string | null;
    kind: CrmEventKind;
    body?: string | null;
    meta?: Record<string, unknown>;
    occurred_at?: string;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("crm_events").insert({
    account_id: ev.account_id,
    opportunity_id: ev.opportunity_id ?? null,
    contact_id: ev.contact_id ?? null,
    kind: ev.kind,
    body: ev.body ?? null,
    meta: ev.meta ?? {},
    occurred_at: ev.occurred_at ?? new Date().toISOString(),
    created_by: me,
  });
  if (error) return { error: error.message };
  if (TOUCH_KINDS.includes(ev.kind)) {
    await supabase
      .from("crm_accounts")
      .update({ last_touch_at: ev.occurred_at ?? new Date().toISOString() })
      .eq("id", ev.account_id);
  }
  return { error: null };
}

/** Plain-words database error, matching the workspace actions' tone. */
export function crmDbMessage(err: { code?: string; message?: string } | null, what: string): string {
  if (!err) return `${what} did not save.`;
  if (err.code === "42501") return `${what} was refused by the database permissions.`;
  if (err.code === "23505") return `${what} already exists.`;
  return `${what} did not save: ${err.message ?? "unknown error"}`;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
