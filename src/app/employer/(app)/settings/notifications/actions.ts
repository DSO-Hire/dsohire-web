"use server";

/**
 * Notification-preferences server actions for the employer Settings tab
 * (Phase 4.5.c).
 *
 * Sibling of the candidate-side action; same upsert pattern. The
 * dispatcher (Phase 4.1.b) reads from `notification_preferences` with a
 * fallback to NOTIFICATION_DEFAULTS, so any preference saved here is
 * honored the next time the matching event fires — including for
 * events whose emitters haven't shipped yet.
 *
 * Save strategy: upsert one row per dirty (event_kind, channel) tuple.
 * We never delete rows on save — flipping enabled=false keeps the row
 * around with the user's explicit choice. Keeps the audit clean and
 * lets us distinguish "user picked off" from "user never visited."
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PreferenceRow {
  event_kind: string;
  channel: string;
  enabled: boolean;
}

export type NotificationPrefsResult =
  | { ok: true; saved: number }
  | { ok: false; error: string };

export async function saveEmployerNotificationPreferences(
  rows: ReadonlyArray<PreferenceRow>
): Promise<NotificationPrefsResult> {
  if (rows.length === 0) return { ok: true, saved: 0 };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Please sign in." };
  }

  // Upsert by (user_id, event_kind, channel) PRIMARY KEY (per the 4.1
  // migration). The `frequency` column is reserved for digest scheduling
  // — v1 only writes 'instant'. The matrix UI doesn't expose digest
  // controls yet; that lands when the digest scheduler ships.
  const payload = rows.map((r) => ({
    user_id: user.id,
    event_kind: r.event_kind,
    channel: r.channel,
    enabled: r.enabled,
    frequency: "instant",
  }));

  const { error, count } = await supabase
    .from("notification_preferences")
    .upsert(payload, {
      onConflict: "user_id,event_kind,channel",
      count: "exact",
    });

  if (error) {
    console.error("[employer/settings/notifications] upsert failed", error);
    return { ok: false, error: "Couldn't save your preferences." };
  }

  revalidatePath("/employer/settings/notifications");
  return { ok: true, saved: count ?? rows.length };
}
