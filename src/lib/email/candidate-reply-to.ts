/**
 * resolveCandidateReplyTo — the Reply-To for candidate-facing emails.
 *
 * Order:
 *   1. The DSO's configured `candidate_reply_to_email` (e.g.
 *      careers@theirpractice.com), set in employer settings.
 *   2. Fallback: the DSO owner's account email.
 *   3. undefined → no Reply-To header (replies hit the From address).
 *
 * Fixes the old bug where candidate emails hardcoded the platform founder's
 * address, so a candidate's reply reached us instead of their DSO. Best-
 * effort + server-only (service-role lookups).
 */

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export async function resolveCandidateReplyTo(
  dsoId: string | null | undefined
): Promise<string | undefined> {
  if (!dsoId) return undefined;
  try {
    const admin = createSupabaseServiceRoleClient();

    const { data: dso } = await admin
      .from("dsos")
      .select("candidate_reply_to_email")
      .eq("id", dsoId)
      .maybeSingle();
    const configured = (dso?.candidate_reply_to_email as string | null) ?? null;
    if (configured && configured.includes("@")) return configured.trim();

    // Fallback: the DSO owner's account email.
    const { data: owner } = await admin
      .from("dso_users")
      .select("auth_user_id")
      .eq("dso_id", dsoId)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    const authUserId = (owner?.auth_user_id as string | null) ?? null;
    if (!authUserId) return undefined;
    const { data: authResp } = await admin.auth.admin.getUserById(authUserId);
    return authResp?.user?.email ?? undefined;
  } catch (err) {
    console.warn("[candidate-reply-to] resolve failed", err);
    return undefined;
  }
}
