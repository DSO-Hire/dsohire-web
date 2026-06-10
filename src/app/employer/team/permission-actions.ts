"use server";

/**
 * #83 Phase 3 — per-teammate permission override server action.
 *
 * saveTeammatePermissions — owner/admin (team.manage) saves a teammate's
 * desired EFFECTIVE capability map; the action computes + stores the
 * minimal diff vs the role preset in dso_users.permission_overrides.
 *
 * Compliance floors enforced here regardless of what the client sends
 * (Team_Permissions_Design_2026-06-10.md §5):
 *   - team.manage required + Growth+ tier (Solo runs presets only)
 *   - target in actor's DSO; owner rows never editable; NO SELF-EDIT
 *   - admin-only caps (team/billing/eeo) never grantable to recruiter/HM
 *     (isCapabilityGrantable; effectivePermissions re-floors as backstop)
 *   - you can't GRANT a capability you don't hold yourself
 *   - every change audit-logged (eventKind team.permissions_changed)
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { recordAuditEvent } from "@/lib/audit/record";
import {
  ALL_CAPABILITIES,
  CAPABILITY_META,
  ROLE_DEFAULTS,
  effectivePermissions,
  isCapability,
  isCapabilityGrantable,
  parsePermissionOverrides,
  type Capability,
  type DsoRole,
} from "@/lib/permissions/capabilities";
import { getActingMember, memberCan } from "@/lib/permissions/guard";
import { dsoCanEditPermissions } from "@/lib/permissions/tier";

export type SavePermissionsResult =
  | { ok: true; changed: number }
  | { ok: false; error: string };

function capLabel(cap: Capability): string {
  return CAPABILITY_META.find((m) => m.key === cap)?.label ?? cap;
}

export async function saveTeammatePermissions(input: {
  targetDsoUserId: string;
  /** Desired EFFECTIVE value per capability (grantable caps only). */
  desired: Record<string, boolean>;
}): Promise<SavePermissionsResult> {
  const targetId = (input.targetDsoUserId ?? "").trim();
  if (!targetId) return { ok: false, error: "Missing teammate." };
  if (!input.desired || typeof input.desired !== "object") {
    return { ok: false, error: "Missing permission payload." };
  }

  const supabase = await createSupabaseServerClient();
  const actor = await getActingMember(supabase);
  if (!actor) return { ok: false, error: "Your session expired. Sign in again." };
  if (!memberCan(actor, "team.manage")) {
    return { ok: false, error: "You don't have permission to manage the team." };
  }

  // Tier gate — overrides are Growth+. Enforcement of presets is all-tiers.
  if (!(await dsoCanEditPermissions(supabase, actor.dsoId))) {
    return {
      ok: false,
      error:
        "Per-teammate permissions are available on Growth and above. Upgrade to customize.",
    };
  }

  // Target — same DSO, never an owner row, never yourself (self-escalation
  // floor: you can't raise OR shape your own permissions).
  const admin = createSupabaseServiceRoleClient();
  const { data: target } = await admin
    .from("dso_users")
    .select("id, dso_id, role, full_name, permission_overrides")
    .eq("id", targetId)
    .maybeSingle();
  if (!target || (target.dso_id as string) !== actor.dsoId) {
    return { ok: false, error: "That teammate isn't in your organization." };
  }
  if (target.id === actor.dsoUserId) {
    return { ok: false, error: "You can't edit your own permissions." };
  }
  const targetRole = target.role as string;
  if (targetRole === "owner") {
    return { ok: false, error: "Owners always have full access." };
  }
  if (!(targetRole in ROLE_DEFAULTS)) {
    return { ok: false, error: "Unknown role on that teammate." };
  }
  const role = targetRole as DsoRole;
  const preset = ROLE_DEFAULTS[role];
  const currentEffective = effectivePermissions(
    role,
    (target as Record<string, unknown>).permission_overrides
  );
  const actorPerms = effectivePermissions(actor.role, actor.permissionOverrides);

  // Validate + apply desired values onto the existing override map.
  const nextOverrides: Partial<Record<Capability, boolean>> = {
    ...parsePermissionOverrides(
      (target as Record<string, unknown>).permission_overrides
    ),
  };
  const changes: Array<{ cap: Capability; from: boolean; to: boolean }> = [];

  for (const [key, rawValue] of Object.entries(input.desired)) {
    if (!isCapability(key) || typeof rawValue !== "boolean") continue;
    const cap = key;
    const wanted = rawValue;

    if (wanted && !isCapabilityGrantable(cap, role)) {
      return {
        ok: false,
        error: `"${capLabel(cap)}" can't be granted to a ${role.replace("_", " ")}.`,
      };
    }
    // No granting a capability the actor doesn't hold.
    if (wanted && !currentEffective[cap] && !actorPerms[cap]) {
      return {
        ok: false,
        error: `You can't grant "${capLabel(cap)}" because your own account doesn't have it.`,
      };
    }

    if (wanted !== currentEffective[cap]) {
      changes.push({ cap, from: currentEffective[cap], to: wanted });
    }
    // Minimal diff: store only deviations from the preset.
    if (wanted === preset[cap]) delete nextOverrides[cap];
    else nextOverrides[cap] = wanted;
  }

  if (changes.length === 0) {
    return { ok: true, changed: 0 };
  }

  // Plain-object literal write (jsonb hard rule — no named interface).
  const overridesToWrite: Record<string, boolean> = {};
  for (const cap of ALL_CAPABILITIES) {
    if (cap in nextOverrides) {
      overridesToWrite[cap] = nextOverrides[cap] as boolean;
    }
  }

  const { error } = await admin
    .from("dso_users")
    .update({ permission_overrides: overridesToWrite })
    .eq("id", targetId)
    .eq("dso_id", actor.dsoId);
  if (error) {
    console.warn("[permissions] override update failed", error);
    return { ok: false, error: "Couldn't save permissions. Try again." };
  }

  const targetName = ((target as Record<string, unknown>).full_name as
    | string
    | null) ?? "a teammate";
  const summaryParts = changes.map(
    (c) => `${c.to ? "+" : "−"} ${capLabel(c.cap)}`
  );
  await recordAuditEvent({
    dsoId: actor.dsoId,
    actorUserId: actor.authUserId,
    actorDsoUserId: actor.dsoUserId,
    actorName: actor.fullName,
    actorRole: actor.role,
    eventKind: "team.permissions_changed",
    targetTable: "dso_users",
    targetId,
    summary: `Updated permissions for ${targetName}: ${summaryParts.join(", ")}`,
    metadata: {
      target_dso_user_id: targetId,
      target_role: role,
      changes: Object.fromEntries(
        changes.map((c) => [c.cap, { from: c.from, to: c.to }])
      ),
    },
  });

  revalidatePath("/employer/team");
  revalidatePath("/employer/settings/offer-approvals");
  return { ok: true, changed: changes.length };
}
