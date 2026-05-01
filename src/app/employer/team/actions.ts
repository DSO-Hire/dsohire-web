"use server";

/**
 * /employer/team server actions.
 *
 * inviteTeammate     — owner/admin invites someone by email; creates a
 *                       dso_invitations row and emails the join link.
 * revokeInvitation   — sets revoked_at on a pending invite.
 * changeTeammateRole — owner/admin changes a teammate's role. Guards
 *                       against demoting the sole owner.
 * removeTeammate     — owner/admin removes a teammate (deletes dso_users
 *                       row only; the auth.users row stays so they keep
 *                       their candidate-side identity if any).
 *
 * RLS policies on dso_users + dso_invitations enforce the same access
 * rules at the database level, so these actions are defense-in-depth +
 * UX (they shape errors for the form, vs. a raw RLS deny which surfaces
 * as a generic insert error).
 */

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { TeamInvite } from "@/emails/employer/TeamInvite";

export type DsoRole = "owner" | "admin" | "recruiter";

export interface TeamActionState {
  ok: boolean;
  error?: string;
  message?: string;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const INVITATION_TTL_DAYS = 7;

/* ───────────────────────────────────────────────────────────────
 * Invite
 * ───────────────────────────────────────────────────────────── */

export async function inviteTeammate(
  _prev: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (roleRaw !== "admin" && roleRaw !== "recruiter") {
    return {
      ok: false,
      error: "Pick a role — Admin (full access) or Recruiter (jobs + applications).",
    };
  }
  const role = roleRaw as Exclude<DsoRole, "owner">;

  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO context found." };

  if (dsoUser.role !== "owner" && dsoUser.role !== "admin") {
    return { ok: false, error: "Only owners and admins can invite teammates." };
  }

  // Don't invite someone who's already on the team
  const { data: existingMember } = await supabase
    .from("dso_users")
    .select("id, auth_user_id")
    .eq("dso_id", dsoUser.dso_id);
  if (existingMember && existingMember.length > 0) {
    // Resolve existing members' emails via service-role auth lookup
    const admin = createSupabaseServiceRoleClient();
    for (const m of existingMember as Array<{ auth_user_id: string }>) {
      const res = await admin.auth.admin.getUserById(m.auth_user_id);
      const memberEmail = res.data?.user?.email?.toLowerCase();
      if (memberEmail && memberEmail === email) {
        return {
          ok: false,
          error: "That email is already on your team.",
        };
      }
    }
  }

  // Check for an existing pending invite
  const { data: existingInvite } = await supabase
    .from("dso_invitations")
    .select("id")
    .eq("dso_id", dsoUser.dso_id)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (existingInvite) {
    return {
      ok: false,
      error: "You already invited that email. Revoke the existing invite first if you want to resend.",
    };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: invite, error: insertError } = await supabase
    .from("dso_invitations")
    .insert({
      dso_id: dsoUser.dso_id,
      email,
      role,
      token,
      invited_by: dsoUser.id as string,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !invite) {
    return {
      ok: false,
      error: insertError?.message ?? "Failed to create the invitation.",
    };
  }

  // Pull DSO name for the email + look up inviter's name from dsoUser
  const { data: dso } = await supabase
    .from("dsos")
    .select("name")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  void sendEmail({
    to: email,
    subject: `You're invited to join ${(dso?.name as string | undefined) ?? "a DSO"} on DSO Hire`,
    template: "employer.team_invite",
    relatedDsoId: dsoUser.dso_id as string,
    react: TeamInvite({
      inviteeName: null,
      inviterName: (dsoUser.full_name as string | null) ?? "Your teammate",
      dsoName: (dso?.name as string | undefined) ?? "your DSO",
      role,
      acceptUrl: `${SITE_URL}/employer/invite/${token}`,
      expiresInDays: INVITATION_TTL_DAYS,
    }),
  });

  revalidatePath("/employer/team");
  return {
    ok: true,
    message: `Invitation sent to ${email}. They'll have ${INVITATION_TTL_DAYS} days to accept.`,
  };
}

/* ───────────────────────────────────────────────────────────────
 * Revoke pending invitation
 * ───────────────────────────────────────────────────────────── */

export async function revokeInvitation(formData: FormData): Promise<void> {
  const invitationId = String(formData.get("invitation_id") ?? "").trim();
  if (!invitationId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("dso_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  revalidatePath("/employer/team");
}

/* ───────────────────────────────────────────────────────────────
 * Change a teammate's role
 * ───────────────────────────────────────────────────────────── */

export async function changeTeammateRole(formData: FormData): Promise<void> {
  const dsoUserId = String(formData.get("dso_user_id") ?? "").trim();
  const newRoleRaw = String(formData.get("new_role") ?? "").trim();
  if (!dsoUserId) return;
  if (
    newRoleRaw !== "owner" &&
    newRoleRaw !== "admin" &&
    newRoleRaw !== "recruiter"
  ) {
    return;
  }
  const newRole = newRoleRaw as DsoRole;

  const supabase = await createSupabaseServerClient();

  // Fetch the target row + the current sole-owner check
  const { data: target } = await supabase
    .from("dso_users")
    .select("id, dso_id, role")
    .eq("id", dsoUserId)
    .maybeSingle();
  if (!target) return;

  // Block demoting the only owner
  if (target.role === "owner" && newRole !== "owner") {
    const { count } = await supabase
      .from("dso_users")
      .select("*", { count: "exact", head: true })
      .eq("dso_id", target.dso_id as string)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      // Silent no-op — the UI hides this option, but defense in depth.
      return;
    }
  }

  // The unique-owner-per-DSO partial index would block multi-owner anyway.
  await supabase
    .from("dso_users")
    .update({ role: newRole })
    .eq("id", dsoUserId);

  revalidatePath("/employer/team");
}

/* ───────────────────────────────────────────────────────────────
 * Remove a teammate
 * ───────────────────────────────────────────────────────────── */

export async function removeTeammate(formData: FormData): Promise<void> {
  const dsoUserId = String(formData.get("dso_user_id") ?? "").trim();
  if (!dsoUserId) return;

  const supabase = await createSupabaseServerClient();

  const { data: target } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, auth_user_id")
    .eq("id", dsoUserId)
    .maybeSingle();
  if (!target) return;

  // Guard: don't remove the sole owner
  if (target.role === "owner") {
    const { count } = await supabase
      .from("dso_users")
      .select("*", { count: "exact", head: true })
      .eq("dso_id", target.dso_id as string)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) return;
  }

  // Get the current user — guard against self-removal as the only admin
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && target.auth_user_id === user.id) {
    // Allow self-removal only if there's at least one other admin/owner
    const { count: adminCount } = await supabase
      .from("dso_users")
      .select("*", { count: "exact", head: true })
      .eq("dso_id", target.dso_id as string)
      .in("role", ["owner", "admin"]);
    if ((adminCount ?? 0) <= 1) return;
  }

  await supabase.from("dso_users").delete().eq("id", dsoUserId);

  revalidatePath("/employer/team");
}
