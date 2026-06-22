/**
 * Platform-level admin audit (Tranche 1, §4).
 *
 * Writes to the existing immutable `audit_log` table (RLS: internal-admin READ
 * only, no insert/update/delete policy → append-only; service-role writes).
 * This is SEPARATE from the DSO-scoped `audit_events` (recordAuditEvent) — admin
 * + impersonation actions are platform-level and must not live in a customer's
 * tenant log.
 *
 * `actor_email` + `summary` ride in `metadata` (the table has no dedicated
 * columns for them). Fail-silent, like recordAuditEvent — an audit miss must
 * never break an admin action. NOTE: it is the caller's job to never put PII or
 * EEO data in `metadata`.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type AdminAuditAction =
  | "admin.account.viewed"
  | "admin.dso.status_changed"
  | "admin.dso.featured_changed"
  | "admin.impersonation.start"
  | "admin.impersonation.end"
  | "admin.impersonation.mutation_blocked"
  | `admin.quick_action.${string}`;

export interface AdminAuditInput {
  actorId: string;
  actorEmail?: string | null;
  action: AdminAuditAction;
  targetType?: "dso" | "candidate" | "job" | "application" | null;
  targetId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordAdminAudit(e: AdminAuditInput): Promise<void> {
  try {
    const admin = createSupabaseServiceRoleClient();
    await admin.from("audit_log").insert({
      actor_id: e.actorId,
      action: e.action,
      target_table: e.targetType ?? null,
      target_id: e.targetId ?? null,
      metadata: {
        ...(e.actorEmail ? { actor_email: e.actorEmail } : {}),
        ...(e.summary ? { summary: e.summary } : {}),
        ...(e.metadata ?? {}),
      },
    });
  } catch (err) {
    console.warn("[admin-audit] insert failed", err);
  }
}
