/* Server-side helpers shared by the opportunity and pipeline actions and
   pages. A plain module (no "use server"), so it can export helpers and
   types; it is imported only by server code because it takes the
   request-scoped CRM session. */
import { revalidatePath } from "next/cache";
import type { CrmSession } from "@/lib/crm/auth";
import { crmDbMessage, logCrmEvent } from "@/lib/crm/events";
import { LOST_REASONS, effectiveStages, stageLabel } from "../../format";

export type Admin = { id: string; email: string | null; full_name: string | null };

/* admin_users is readable own-row only (RLS), so the founder list the CRM
   can see is the signed-in founder. Owners set by someone else still show
   as an owner chip with "?" initials and are preserved by every form. */
export function adminsOf(session: CrmSession): Admin[] {
  return [{ id: session.me, email: session.admin.email, full_name: session.admin.full_name }];
}

export function revalidateOpportunity(id: string | null, accountId?: string | null) {
  if (id) revalidatePath(`/crm/opportunities/${id}`);
  if (accountId) revalidatePath(`/crm/accounts/${accountId}`);
  revalidatePath("/crm/pipeline");
  revalidatePath("/crm/tasks");
  revalidatePath("/crm/reports");
  revalidatePath("/crm");
}

/* Every stage write goes through here: board drags, the record's stage
   buttons and selector, mark won, mark lost, and reopen. It stamps
   stage_changed_at (the days-in-stage clock), sets won_at / lost_at, flips
   the account to customer on a win, and logs one crm_events row with
   meta {from, to}: kind won or lost for those moves, stage_change otherwise. */
export async function writeOpportunityStage(
  session: CrmSession,
  id: string,
  to: string,
  lost?: { reason: string; note: string | null },
): Promise<{ error: string | null; name?: string; from?: string; accountId?: string }> {
  const { supabase, me } = session;
  const { data: opp, error: readErr } = await supabase
    .from("crm_opportunities")
    .select("id, name, stage, custom_stages, account_id")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { error: crmDbMessage(readErr, "The stage move") };
  if (!opp) return { error: "That opportunity no longer exists." };
  const from = String(opp.stage);
  const accountId = String(opp.account_id);
  const name = String(opp.name);
  const valid = [...effectiveStages(opp.custom_stages as string[] | null), "lost"];
  if (!valid.includes(to)) return { error: `"${stageLabel(to)}" is not in this opportunity's stage list.` };
  if (from === to) return { error: null, name, from, accountId };
  if (to === "lost") {
    if (!lost || !LOST_REASONS[lost.reason]) return { error: "Pick a reason the opportunity was lost." };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { stage: to, stage_changed_at: now, updated_at: now };
  if (to === "won") patch.won_at = now;
  else if (from === "won") patch.won_at = null;
  if (to === "lost") {
    patch.lost_at = now;
    patch.lost_reason = lost!.reason;
    patch.lost_note = lost!.note ? lost!.note.slice(0, 2000) : null;
  } else if (from === "lost") {
    patch.lost_at = null;
    patch.lost_reason = null;
    patch.lost_note = null;
  }
  const { error } = await supabase.from("crm_opportunities").update(patch).eq("id", id);
  if (error) return { error: crmDbMessage(error, "The stage move") };

  let after: string | null = null;
  if (to === "won") {
    const { error: accErr } = await supabase
      .from("crm_accounts")
      .update({ status: "customer", updated_at: now })
      .eq("id", accountId);
    if (accErr) after = `Moved to Won, but the account was not marked a customer: ${accErr.message}`;
  }

  const kind = to === "won" ? "won" : to === "lost" ? "lost" : "stage_change";
  const body =
    to === "lost"
      ? `${LOST_REASONS[lost!.reason]}${lost!.note ? `: ${lost!.note.slice(0, 500)}` : ""}`
      : null;
  const meta: Record<string, unknown> = { from, to };
  if (to === "lost") meta.reason = lost!.reason;
  const ev = await logCrmEvent(supabase, me, { account_id: accountId, opportunity_id: id, kind, body, meta });
  if (ev.error && !after) after = `Stage saved, but the timeline entry was not logged: ${ev.error}`;

  revalidateOpportunity(id, accountId);
  return { error: after, name, from, accountId };
}

/* The stage an opportunity was lost from, for Reopen. */
export async function stageBeforeLost(session: CrmSession, id: string, stages: string[]): Promise<string> {
  const { data } = await session.supabase
    .from("crm_events")
    .select("kind, meta")
    .eq("opportunity_id", id)
    .in("kind", ["lost", "stage_change"])
    .order("occurred_at", { ascending: false })
    .limit(20);
  const into = ((data ?? []) as { kind: string; meta: Record<string, unknown> | null }[]).find(
    (e) => e.meta?.to === "lost",
  );
  const fromStage = String(into?.meta?.from ?? "");
  return stages.includes(fromStage) && fromStage !== "won" ? fromStage : stages[0];
}
