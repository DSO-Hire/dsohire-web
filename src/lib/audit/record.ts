/**
 * Audit-event recorder (Phase 4.5.e).
 *
 * Single entry point for app-side audit logging. Server actions call
 * `recordAuditEvent({...})` after a successful mutation; failures are
 * swallowed (console.warn) so an audit-log bug never breaks a customer-
 * facing operation. Inserts go through the service-role client so RLS
 * is bypassed — readers are gated by RLS on SELECT.
 *
 * Snapshot semantics: actor_name + actor_role are captured at event
 * time. If the actor is later renamed, role-changed, or deleted, the
 * historical row keeps the truth-at-time-of-action.
 *
 * The function pulls the actor context lazily — callers can pass an
 * `actorDsoUserId` directly when they already have it (most actions
 * already fetch the row) to skip a round trip.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export interface RecordAuditEventInput {
  /** The DSO this event belongs to. Required — RLS scopes by this. */
  dsoId: string;
  /** Authenticated user id of the actor. Optional for system events. */
  actorUserId?: string | null;
  /**
   * dso_users.id of the actor. When provided we skip the lookup; when
   * omitted we resolve from actorUserId + dsoId.
   */
  actorDsoUserId?: string | null;
  /** Pre-resolved snapshot. Skips the lookup when provided. */
  actorName?: string | null;
  /** Pre-resolved snapshot. Skips the lookup when provided. */
  actorRole?: string | null;
  /** Stable dotted namespace identifier — see migration comments. */
  eventKind: string;
  /** Optional pointer to the affected row's table. */
  targetTable?: string | null;
  /** Optional pointer to the affected row's id. */
  targetId?: string | null;
  /** Single-line human-readable summary. Required — drives the UI. */
  summary: string;
  /** Per-event-kind structured payload (loose by design). */
  metadata?: Record<string, unknown>;
}

export async function recordAuditEvent(
  input: RecordAuditEventInput
): Promise<void> {
  if (!input.dsoId || !input.eventKind || !input.summary) {
    console.warn(
      "[audit] missing required fields, skipping insert",
      input
    );
    return;
  }

  const admin = createSupabaseServiceRoleClient();

  // Resolve actor snapshot when the caller didn't pre-provide it.
  let actorDsoUserId = input.actorDsoUserId ?? null;
  let actorName = input.actorName ?? null;
  let actorRole = input.actorRole ?? null;
  if (
    (actorDsoUserId === null || actorName === null || actorRole === null) &&
    input.actorUserId
  ) {
    const { data: dsoUser } = await admin
      .from("dso_users")
      .select("id, full_name, role")
      .eq("auth_user_id", input.actorUserId)
      .eq("dso_id", input.dsoId)
      .maybeSingle();
    if (dsoUser) {
      actorDsoUserId =
        actorDsoUserId ?? ((dsoUser as { id: string }).id);
      actorName =
        actorName ?? ((dsoUser as { full_name: string | null }).full_name);
      actorRole =
        actorRole ?? ((dsoUser as { role: string }).role);
    }
  }

  const { error } = await admin.from("audit_events").insert({
    dso_id: input.dsoId,
    actor_user_id: input.actorUserId ?? null,
    actor_dso_user_id: actorDsoUserId,
    actor_name: actorName,
    actor_role: actorRole,
    event_kind: input.eventKind,
    target_table: input.targetTable ?? null,
    target_id: input.targetId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });

  if (error) {
    // Swallow + log. Audit-log failures must never break a parent
    // mutation. Vercel runtime logs catch the warn for triage.
    console.warn("[audit] insert failed", {
      eventKind: input.eventKind,
      dsoId: input.dsoId,
      error: error.message,
    });
  }
}

/**
 * Read-side retention windows (Starter 7d / Pro+ 30d / Enterprise
 * indefinite). Resolved against the DSO's active subscription tier
 * by the audit list page. Encoded in days; 0 means indefinite.
 */
export const AUDIT_RETENTION_DAYS: Record<string, number> = {
  solo: 7,
  starter: 7, // legacy tier, retained for old subscriptions
  growth: 30,
  scale: 30,
  enterprise: 0,
};
