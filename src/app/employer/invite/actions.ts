"use server";

/**
 * /employer/invite server action.
 *
 * acceptInvitation — called from the form on /employer/invite/[token].
 *   - Verifies the token via service-role lookup
 *   - Confirms the auth user has no existing dso_users row
 *   - Inserts a new dso_users row with the invited role
 *   - Marks the invitation accepted_at
 *   - Redirects to /employer/dashboard
 *
 * Service-role is used for both reads and writes here because:
 *   - The invitee may not yet be a member, so RLS won't grant them access
 *     to dso_invitations
 *   - The dso_users insert RLS requires the inserter to be a DSO admin,
 *     which the invitee isn't yet
 */

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export async function acceptInvitation(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "").trim();
  if (!token) redirect("/employer/sign-in");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/employer/sign-in?next=${encodeURIComponent(`/employer/invite/${token}`)}`
    );
  }

  const admin = createSupabaseServiceRoleClient();

  // Validate the invitation
  const { data: invitation } = await admin
    .from("dso_invitations")
    .select(
      "id, dso_id, email, role, scoped_location_ids, expires_at, accepted_at, revoked_at"
    )
    .eq("token", token)
    .maybeSingle();

  if (!invitation) redirect("/employer/sign-in");
  if (invitation.accepted_at) redirect("/employer/dashboard");
  if (invitation.revoked_at) {
    redirect(`/employer/invite/${token}`); // page renders "revoked" copy
  }
  if (new Date(invitation.expires_at as string).getTime() < Date.now()) {
    redirect(`/employer/invite/${token}`); // page renders "expired" copy
  }

  // Bail if the user is already a member of any DSO. The page would have
  // already shown the right message, so we just redirect them home.
  const { data: existingMembership } = await admin
    .from("dso_users")
    .select("id, dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existingMembership) {
    if (existingMembership.dso_id === invitation.dso_id) {
      redirect("/employer/dashboard");
    }
    redirect(`/employer/invite/${token}`); // page renders the "other DSO" message
  }

  // Pull the user's display name from auth user metadata if present
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    null;

  // Insert the dso_users row + mark the invitation accepted (service-role
  // bypasses RLS — needed because the invitee isn't a member yet).
  const { data: insertedDsoUser, error: insertError } = await admin
    .from("dso_users")
    .insert({
      auth_user_id: user.id,
      dso_id: invitation.dso_id as string,
      role: invitation.role as string,
      full_name: fullName,
    })
    .select("id")
    .single();

  if (insertError || !insertedDsoUser) {
    // Could happen if there's a concurrent acceptance or a role-uniqueness
    // collision (the unique partial index on dso_users would block adding
    // a second owner via this path, but invites only ever set admin /
    // recruiter / hiring_manager).
    redirect(`/employer/invite/${token}?error=insert`);
  }

  // For hiring_manager invites, create one dso_user_locations row per
  // scoped location. Service-role bypasses the RLS gate on insert (which
  // requires owner/admin), since the invitee isn't an admin themselves.
  const scopedLocationIds = (invitation.scoped_location_ids as
    | string[]
    | null) ?? [];
  if (
    invitation.role === "hiring_manager" &&
    scopedLocationIds.length > 0
  ) {
    const { error: locationsError } = await admin
      .from("dso_user_locations")
      .insert(
        scopedLocationIds.map((locId) => ({
          dso_user_id: insertedDsoUser.id as string,
          dso_location_id: locId,
        }))
      );
    if (locationsError) {
      // Roll back the dso_users insert so the user can retry. Otherwise
      // they'd be stuck as an unscoped HM and unable to see anything.
      await admin
        .from("dso_users")
        .delete()
        .eq("id", insertedDsoUser.id as string);
      redirect(`/employer/invite/${token}?error=locations`);
    }
  }

  await admin
    .from("dso_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id as string);

  redirect("/employer/dashboard");
}
