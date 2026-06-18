"use server";

/**
 * Public reference-form submit action (Phase 5A Track D).
 *
 * The reference is unauthenticated — they came in via an emailed
 * /r/{token} link. Token is opaque + server-generated (24 bytes
 * base64url) so guessing-attacks are not realistic.
 *
 * Service-role client. We:
 *   1. Look up the reference_requests row by token.
 *   2. Reject if status is `completed` (already submitted) or
 *      `declined` (employer withdrew the request).
 *   3. Validate the payload against REFERENCE_FIELDS.
 *   4. Update response_data + status='completed' + completed_at.
 *   5. revalidatePath the employer's application detail so the
 *      response shows up without a manual refresh.
 *
 * No auth check, by design.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  validateReferenceResponse,
  type ReferenceResponse,
} from "@/app/employer/(app)/applications/[id]/reference-data";

export async function submitReferenceResponse(
  token: string,
  responses: Record<string, string | null>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleanToken = (token ?? "").trim();
  if (!cleanToken) {
    return { ok: false, error: "Missing reference token." };
  }
  if (cleanToken.length > 128) {
    return { ok: false, error: "Invalid reference token." };
  }

  const admin = createSupabaseServiceRoleClient();
  const { data: row, error: rowErr } = await admin
    .from("reference_requests")
    .select("id, application_id, status")
    .eq("token", cleanToken)
    .maybeSingle();
  if (rowErr) {
    console.warn("[references-public] token lookup failed", rowErr);
    return { ok: false, error: "Couldn't load this reference request." };
  }
  if (!row) {
    return {
      ok: false,
      error:
        "This reference link isn't recognized. The request may have been withdrawn.",
    };
  }

  const status = ((row as Record<string, unknown>).status as string) ?? "";
  if (status === "completed") {
    return {
      ok: false,
      error: "Thanks — we already have your response on file for this request.",
    };
  }
  if (status === "declined") {
    return {
      ok: false,
      error: "This reference request was withdrawn and is no longer accepting responses.",
    };
  }

  const validation = validateReferenceResponse(
    responses as Record<string, unknown>
  );
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const cleaned: ReferenceResponse = validation.data;

  const requestId = (row as Record<string, unknown>).id as string;
  const applicationId =
    ((row as Record<string, unknown>).application_id as string | null) ?? null;

  const { error: updateErr } = await admin
    .from("reference_requests")
    .update({
      response_data: cleaned,
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (updateErr) {
    console.warn("[references-public] update failed", updateErr);
    return { ok: false, error: "Couldn't save your response. Please try again." };
  }

  if (applicationId) {
    // Surfaces the response on the employer's detail page on next view.
    revalidatePath(`/employer/applications/${applicationId}`);
  }

  return { ok: true };
}
