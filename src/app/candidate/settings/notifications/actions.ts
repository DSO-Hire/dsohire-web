"use server";

/**
 * Notification-preferences server actions for the candidate Settings
 * tab (Phase 4.3.b).
 *
 * The dispatcher (4.1.b) already reads from `notification_preferences`
 * with a fallback to NOTIFICATION_DEFAULTS. This action lets the
 * candidate write their own preferences on top — what the dispatcher
 * sees once a row exists.
 *
 * Save strategy: upsert one row per (event_kind, channel) tuple. We
 * never delete rows on save — flipping enabled=false keeps the row
 * around with the user's explicit choice. Keeps the audit clean.
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

/**
 * Persist a batch of preference toggles. Called from the
 * NotificationsForm on save.
 */
export async function saveNotificationPreferences(
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

  // Upsert by (user_id, event_kind, channel) composite key. The table
  // already has that as its PRIMARY KEY (per the 4.1 migration), so
  // we can rely on `onConflict` here.
  const payload = rows.map((r) => ({
    user_id: user.id,
    event_kind: r.event_kind,
    channel: r.channel,
    enabled: r.enabled,
    frequency: "instant", // v1 — quiet hours + digest deferred per scope
  }));

  const { error, count } = await supabase
    .from("notification_preferences")
    .upsert(payload, {
      onConflict: "user_id,event_kind,channel",
      count: "exact",
    });

  if (error) {
    console.error("[settings/notifications] upsert failed", error);
    return { ok: false, error: "Couldn't save your preferences." };
  }

  revalidatePath("/candidate/settings/notifications");
  return { ok: true, saved: count ?? rows.length };
}
