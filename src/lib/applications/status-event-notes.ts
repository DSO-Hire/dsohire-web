/**
 * Shared helper for attaching a recruiter-supplied reason note to the most
 * recent `application_status_events` row(s) following a status transition.
 *
 * Why this helper exists: RLS on `application_status_events` only grants
 * SELECT to DSO members — INSERT/UPDATE is closed to all client callers (the
 * trigger is the only writer, running as SECURITY DEFINER). So when the
 * recruiter wants to attach a reason explaining a reject/archive, we can't
 * UPDATE from the request-scoped client. We use the service-role client to
 * patch the trigger-seeded row's `note` column AFTER the trigger has fired.
 *
 * Used by:
 *   - bulk-reject + bulk-archive (job-scoped applications page)
 *   - single-reject (application detail StageSelector)
 *
 * Best-effort by design: if the lookup or update fails for an individual id
 * we log and move on. The status transition itself was already committed and
 * reported as succeeded; an audit-trail blip should never roll the move back.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { ApplicationStatus } from "@/lib/applications/stages";

export interface AttachStatusNoteOptions {
  applicationIds: string[];
  toStatus: ApplicationStatus;
  /**
   * Recruiter-supplied reason. Trimmed + capped at 1000 chars upstream; we
   * write whatever caller passes verbatim. Empty string → caller should not
   * have called us at all; we no-op for safety.
   */
  note: string;
}

export async function attachStatusEventNote({
  applicationIds,
  toStatus,
  note,
}: AttachStatusNoteOptions): Promise<void> {
  if (!note || applicationIds.length === 0) return;

  const admin = createSupabaseServiceRoleClient();
  for (const appId of applicationIds) {
    try {
      const { data: events, error: selErr } = await admin
        .from("application_status_events")
        .select("id")
        .eq("application_id", appId)
        .eq("to_status", toStatus)
        .order("created_at", { ascending: false })
        .limit(1);
      if (selErr || !events || events.length === 0) {
        if (selErr) {
          console.warn(
            `[status-event-notes] could not locate status event for ${appId}:`,
            selErr.message
          );
        }
        continue;
      }
      const eventId = (events[0] as { id: string }).id;
      const { error: updErr } = await admin
        .from("application_status_events")
        .update({ note })
        .eq("id", eventId);
      if (updErr) {
        console.warn(
          `[status-event-notes] note patch failed for event ${eventId}:`,
          updErr.message
        );
      }
    } catch (err) {
      console.warn(
        `[status-event-notes] unexpected error patching note for ${appId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
