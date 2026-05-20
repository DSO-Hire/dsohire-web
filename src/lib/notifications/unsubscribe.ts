/**
 * Unsubscribe apply/resubscribe + URL builders (Phase E8.14).
 *
 * Server-only. The public unsubscribe surfaces (one-click POST route + the
 * confirmation page) call applyCategoryUnsubscribe(); they run without an auth
 * session, so writes go through the service-role client. The dispatcher calls
 * the URL builders to attach List-Unsubscribe headers to commercial mail.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  getUnsubscribeCategory,
  categoryForEventKind,
  type UnsubscribeCategory,
} from "./categories";
import { signUnsubscribeToken } from "./unsubscribe-token";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export interface UnsubscribeResult {
  ok: boolean;
  category?: UnsubscribeCategory;
  error?: string;
}

/**
 * Turn EMAIL off for every event kind in a category. Idempotent — safe to call
 * repeatedly (the one-click POST and the page GET may both fire for one click).
 * We upsert rather than delete so the row records the user's explicit choice
 * (distinguishes "opted out" from "never visited").
 */
export async function applyCategoryUnsubscribe(
  userId: string,
  categoryKey: string
): Promise<UnsubscribeResult> {
  return setCategoryEmail(userId, categoryKey, false);
}

/** Re-enable EMAIL for every event kind in a category (resubscribe button). */
export async function applyCategoryResubscribe(
  userId: string,
  categoryKey: string
): Promise<UnsubscribeResult> {
  return setCategoryEmail(userId, categoryKey, true);
}

async function setCategoryEmail(
  userId: string,
  categoryKey: string,
  enabled: boolean
): Promise<UnsubscribeResult> {
  const category = getUnsubscribeCategory(categoryKey);
  if (!category) return { ok: false, error: "Unknown category." };

  const payload = category.eventKinds.map((event_kind) => ({
    user_id: userId,
    event_kind,
    channel: "email",
    enabled,
    frequency: "instant",
  }));

  try {
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin
      .from("notification_preferences")
      .upsert(payload, { onConflict: "user_id,event_kind,channel" });
    if (error) {
      console.error("[unsubscribe] upsert failed", error);
      return { ok: false, error: "Couldn't update your preferences." };
    }
    return { ok: true, category };
  } catch (err) {
    console.error("[unsubscribe] exception", err);
    return { ok: false, error: "Couldn't update your preferences." };
  }
}

/* ───────────────────────── URL builders ───────────────────────── */

/**
 * The List-Unsubscribe header URL for a commercial event (the one-click POST
 * target, RFC 8058). Returns null for transactional events (no hard
 * unsubscribe) or when no signing secret is configured.
 */
export function listUnsubscribeUrlForEvent(
  userId: string,
  eventKind: string
): string | null {
  const category = categoryForEventKind(eventKind);
  if (!category || !category.commercial) return null;
  const token = signUnsubscribeToken(userId, category.key);
  if (!token) return null;
  return `${SITE_URL}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * The visible footer link target (the human-facing confirmation/manage page)
 * for a commercial category. Returns null for unknown categories or when no
 * signing secret is configured.
 */
export function unsubscribePageUrlForCategory(
  userId: string,
  categoryKey: string
): string | null {
  const category = getUnsubscribeCategory(categoryKey);
  if (!category) return null;
  const token = signUnsubscribeToken(userId, categoryKey);
  if (!token) return null;
  return `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** Convenience: footer link for an event kind (maps to its category). */
export function unsubscribePageUrlForEvent(
  userId: string,
  eventKind: string
): string | null {
  const category = categoryForEventKind(eventKind);
  if (!category) return null;
  return unsubscribePageUrlForCategory(userId, category.key);
}
