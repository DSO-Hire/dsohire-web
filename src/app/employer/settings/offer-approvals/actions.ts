"use server";

/**
 * N12 Phase 2 — offer-approval settings server actions.
 *
 * Owner/admin only, Scale+ (the approval mechanism is a Scale tier
 * control). Writes go through the service-role client after an explicit
 * owner/admin check, scoped to the caller's DSO.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { dsoCanUseOfferApprovals } from "@/lib/offers/approval-tier";
import { parseOfferApprovalPolicy } from "@/lib/offers/approval-policy";
import { recordAuditEvent } from "@/lib/audit/record";

export type SettingsResult = { ok: true } | { ok: false; error: string };

async function resolveOwnerAdmin(): Promise<
  | { ok: true; dsoId: string; dsoUserId: string; name: string | null; role: string }
  | { ok: false; error: string }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Sign in again." };
  const { data: me } = await supabase
    .from("dso_users")
    .select("id, dso_id, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me) return { ok: false, error: "You don't have access to this DSO." };
  const role = me.role as string;
  if (role !== "owner" && role !== "admin") {
    return { ok: false, error: "Only an owner or admin can change these settings." };
  }
  return {
    ok: true,
    dsoId: me.dso_id as string,
    dsoUserId: me.id as string,
    name: (me.full_name as string | null) ?? null,
    role,
  };
}

export async function updateOfferApprovalPolicy(input: {
  require_when_out_of_range: boolean;
  /** Annualized base ceiling; null/empty clears it. */
  require_above_amount: number | null;
}): Promise<SettingsResult> {
  const who = await resolveOwnerAdmin();
  if (!who.ok) return who;

  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseOfferApprovals(supabase, who.dsoId))) {
    return { ok: false, error: "Offer approvals are a Scale feature. Upgrade to configure them." };
  }

  // Normalize via the shared parser (clamps types, drops non-positive ceiling).
  const policy = parseOfferApprovalPolicy({
    require_when_out_of_range: input.require_when_out_of_range,
    require_above_amount: input.require_above_amount,
  });

  const admin = createSupabaseServiceRoleClient();
  // Write an inline literal (not the typed interface) so it assigns cleanly
  // to the jsonb column's Json type, which expects an index signature.
  const { error } = await admin
    .from("dsos")
    .update({
      offer_approval_policy: {
        require_when_out_of_range: policy.require_when_out_of_range,
        require_above_amount: policy.require_above_amount,
      },
    })
    .eq("id", who.dsoId);
  if (error) {
    console.warn("[offer-approvals] policy update failed", error);
    return { ok: false, error: "Couldn't save the policy. Try again." };
  }

  await recordAuditEvent({
    dsoId: who.dsoId,
    actorUserId: null,
    actorDsoUserId: who.dsoUserId,
    actorName: who.name,
    actorRole: who.role,
    eventKind: "offer.policy_updated",
    targetTable: "dsos",
    targetId: who.dsoId,
    summary: "Updated offer-approval policy",
    metadata: { policy },
  });

  revalidatePath("/employer/settings/offer-approvals");
  return { ok: true };
}

export async function setTeammateCanSendDirectly(
  targetDsoUserId: string,
  value: boolean
): Promise<SettingsResult> {
  const who = await resolveOwnerAdmin();
  if (!who.ok) return who;

  const supabase = await createSupabaseServerClient();
  if (!(await dsoCanUseOfferApprovals(supabase, who.dsoId))) {
    return { ok: false, error: "Offer approvals are a Scale feature. Upgrade to configure them." };
  }
  if (!targetDsoUserId) return { ok: false, error: "Missing teammate." };

  const admin = createSupabaseServiceRoleClient();
  // Validate the target is in THIS DSO and is a recruiter/HM (owner/admin
  // are always empowered — the grant is meaningless for them).
  const { data: target } = await admin
    .from("dso_users")
    .select("id, role, dso_id, full_name")
    .eq("id", targetDsoUserId)
    .maybeSingle();
  if (!target || (target.dso_id as string) !== who.dsoId) {
    return { ok: false, error: "That teammate isn't in your organization." };
  }
  const targetRole = target.role as string;
  if (targetRole === "owner" || targetRole === "admin") {
    return { ok: false, error: "Owners and admins already send offers directly." };
  }

  const { error } = await admin
    .from("dso_users")
    .update({ can_send_offers_directly: value })
    .eq("id", targetDsoUserId)
    .eq("dso_id", who.dsoId);
  if (error) {
    console.warn("[offer-approvals] grant update failed", error);
    return { ok: false, error: "Couldn't update the permission. Try again." };
  }

  await recordAuditEvent({
    dsoId: who.dsoId,
    actorUserId: null,
    actorDsoUserId: who.dsoUserId,
    actorName: who.name,
    actorRole: who.role,
    eventKind: "offer.send_permission_changed",
    targetTable: "dso_users",
    targetId: targetDsoUserId,
    summary: `${value ? "Granted" : "Revoked"} direct offer-send for ${
      (target.full_name as string | null) ?? "a teammate"
    }`,
    metadata: { can_send_offers_directly: value },
  });

  revalidatePath("/employer/settings/offer-approvals");
  return { ok: true };
}
