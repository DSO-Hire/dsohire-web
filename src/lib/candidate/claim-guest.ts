/**
 * Guest-row claiming — Punch #5 (2026-07-10).
 *
 * A person who applied as a guest (candidates row with auth_user_id=null,
 * is_guest=true) and later creates a real account used to get a SECOND
 * candidates row: only the magic-link callback claimed guest rows, while
 * password sign-up and OAuth provisioning blind-inserted. Two rows for one
 * human defeats the (job_id, candidate_id) unique constraint at the human
 * level and splits their application history.
 *
 * claimGuestCandidateRow is the one shared primitive: given a verified-
 * ownership email (the caller is responsible for that guarantee — sign-in
 * still requires the OTP/password, so a squatter who claims a row can
 * never authenticate into it), promote a still-claimable guest row to the
 * new auth user. Returns the claimed row id, or null when there is no
 * claimable guest row (caller then inserts a fresh candidates row).
 */

import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type ServiceRoleClient = ReturnType<typeof createSupabaseServiceRoleClient>;

export async function claimGuestCandidateRow(
  admin: ServiceRoleClient,
  opts: {
    authUserId: string;
    email: string;
    /** Sign-up form names — fresher than the guest-apply snapshot; only
     *  written when provided so OAuth (no form) keeps the guest names. */
    firstName?: string;
    lastName?: string;
  }
): Promise<string | null> {
  const { data: guestRow } = await admin
    .from("candidates")
    .select("id, claim_expires_at")
    .ilike("email", opts.email)
    .eq("is_guest", true)
    .is("auth_user_id", null)
    .maybeSingle();
  if (!guestRow) return null;

  const expiresAt = guestRow.claim_expires_at as string | null;
  const stillClaimable = !expiresAt || new Date(expiresAt) > new Date();
  if (!stillClaimable) return null;

  const { error } = await admin
    .from("candidates")
    .update({
      auth_user_id: opts.authUserId,
      is_guest: false,
      email: null, // post-claim, auth.users is the source of truth
      claim_expires_at: null,
      ...(opts.firstName ? { first_name: opts.firstName } : {}),
      ...(opts.lastName ? { last_name: opts.lastName } : {}),
    })
    .eq("id", guestRow.id as string);
  if (error) {
    console.warn("[claim-guest] guest claim failed", error);
    return null;
  }
  return guestRow.id as string;
}
