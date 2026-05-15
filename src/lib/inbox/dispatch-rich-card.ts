"use server";

/**
 * dispatchInboxRichCard — server helper that drops a kind='rich_card'
 * row into application_messages so a structured card appears inline in
 * the thread.
 *
 * Parallel to dispatchInboxSystemMessage (Phase 4.8 system-event
 * dispatcher) — same intent, different kind discriminator + a typed
 * payload. Uses the service-role client so it can insert with the
 * dispatching DSO user's id as sender_user_id (RLS would reject the
 * insert otherwise without a participant-side auth).
 *
 * Call sites:
 *   - offer-actions.ts after sending an offer letter email → drops an
 *     offer_letter card so the candidate can Accept/Decline in-thread.
 *   - interview-actions.ts after proposing a slot set / on booking
 *     confirmation → drops the matching card.
 *   - reference-actions.ts when a reference submits → reference_completed.
 *   - document-share flows → document_shared.
 *
 * Best-effort: this never fails the parent operation. Failures are
 * logged via console.warn so the underlying email/booking/etc still
 * completes from the user's perspective. The thread misses an inline
 * card, but the entity (the offer / booking / reference) is intact.
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { RichCardPayload } from "./rich-card-types";

export interface DispatchInboxRichCardArgs {
  applicationId: string;
  /** The DSO user (or candidate auth user) who's authoring the card. */
  senderUserId: string;
  /** Which side the sender is on — sets sender_role for the row. */
  senderRole: "candidate" | "employer";
  /** Optional dso_users.id for employer-side authors. */
  senderDsoUserId?: string | null;
  /** Text fallback for the row's body column — shown in email digests + a11y. */
  fallbackBody: string;
  payload: RichCardPayload;
}

export async function dispatchInboxRichCard(
  args: DispatchInboxRichCardArgs
): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin
    .from("application_messages")
    .insert({
      application_id: args.applicationId,
      sender_user_id: args.senderUserId,
      sender_role: args.senderRole,
      sender_dso_user_id: args.senderDsoUserId ?? null,
      body: args.fallbackBody,
      kind: "rich_card",
      payload: args.payload as unknown as Record<string, unknown>,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.warn("[inbox/dispatch-rich-card] insert failed", error);
    return {
      ok: false,
      error: error?.message ?? "Failed to dispatch rich card.",
    };
  }

  return { ok: true, messageId: (data as Record<string, unknown>).id as string };
}
