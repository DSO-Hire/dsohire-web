"use server";

/**
 * /admin/dsos + Account 360 server actions.
 *
 * Auth tiers (Tranche 1, §2):
 *   - Tier-1 (admin_users): mark-verified / re-pending (setDsoStatus to
 *     active/pending), feature toggle.
 *   - Tier-2 (founder email allowlist): suspend, and soft-delete / restore —
 *     destructive, so they additionally require isSuperadminEmail.
 * Every action writes the platform audit log (recordAdminAudit, fail-silent).
 *
 * Service-role client for the write (dsos.update RLS is DSO-member-scoped;
 * admins aren't members). The auth checks here are the access boundary.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import { recordAdminAudit } from "@/lib/admin/audit";

export interface AdminActionState {
  ok: boolean;
  error?: string;
}

interface Actor {
  id: string;
  email: string | null;
  founder: boolean;
}

/** Resolve + Tier-1 gate the caller. Returns null if not internal staff. */
async function resolveActor(): Promise<Actor | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!adminRow) return null;
  return { id: user.id, email: user.email ?? null, founder: isSuperadminEmail(user.email) };
}

function revalidateDso(dsoId: string) {
  revalidatePath("/admin/dsos");
  revalidatePath("/admin");
  revalidatePath(`/admin/dso/${dsoId}`);
  revalidatePath("/companies");
}

const VALID_STATUSES = new Set(["pending", "active", "suspended"]);

export async function setDsoStatus(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const newStatus = String(formData.get("new_status") ?? "").trim();
  if (!dsoId || !VALID_STATUSES.has(newStatus)) {
    return { ok: false, error: "Invalid request." };
  }

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not authorized." };
  // Suspending is destructive → Tier-2 (founder only).
  if (newStatus === "suspended" && !actor.founder) {
    return { ok: false, error: "Suspending a DSO is founder-only." };
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("dsos")
    .update({ status: newStatus })
    .eq("id", dsoId);
  if (error) return { ok: false, error: error.message };

  await recordAdminAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "admin.dso.status_changed",
    targetType: "dso",
    targetId: dsoId,
    summary: `Set status → ${newStatus}`,
    metadata: { new_status: newStatus },
  });

  revalidateDso(dsoId);
  return { ok: true };
}

const FEATURED_DURATIONS: Record<string, number | null> = {
  clear: null,
  "+30d": 30,
  "+90d": 90,
};

export async function setDsoFeaturedUntil(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();
  if (!dsoId || !(action in FEATURED_DURATIONS)) {
    return { ok: false, error: "Invalid request." };
  }

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not authorized." };

  const days = FEATURED_DURATIONS[action];
  const newValue: string | null =
    days === null
      ? null
      : new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("dsos")
    .update({ featured_until: newValue })
    .eq("id", dsoId);
  if (error) return { ok: false, error: error.message };

  await recordAdminAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "admin.dso.featured_changed",
    targetType: "dso",
    targetId: dsoId,
    summary: days === null ? "Cleared spotlight" : `Spotlight +${days}d`,
    metadata: { action },
  });

  revalidateDso(dsoId);
  return { ok: true };
}

/**
 * setDsoDeleted — soft-delete / restore a DSO. Tier-2 (founder), destructive,
 * confirmed in the UI, audited. Sets/clears deleted_at; never hard-deletes.
 */
export async function setDsoDeleted(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim(); // "delete" | "restore"
  if (!dsoId || (action !== "delete" && action !== "restore")) {
    return { ok: false, error: "Invalid request." };
  }

  const actor = await resolveActor();
  if (!actor) return { ok: false, error: "Not authorized." };
  if (!actor.founder) {
    return { ok: false, error: "Deleting a DSO is founder-only." };
  }

  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("dsos")
    .update({ deleted_at: action === "delete" ? new Date().toISOString() : null })
    .eq("id", dsoId);
  if (error) return { ok: false, error: error.message };

  await recordAdminAudit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: action === "delete" ? "admin.quick_action.soft_delete" : "admin.quick_action.restore",
    targetType: "dso",
    targetId: dsoId,
    summary: action === "delete" ? "Soft-deleted DSO" : "Restored DSO",
  });

  revalidateDso(dsoId);
  return { ok: true };
}
