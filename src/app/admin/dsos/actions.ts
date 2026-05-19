"use server";

/**
 * /admin/dsos server actions.
 *
 * setDsoStatus flips a DSO's status (pending / active / suspended).
 * Auth gate: caller must be in admin_users. We re-check here as defense
 * in depth even though AdminShell already gates the page.
 *
 * Uses the service-role client because the dsos.update RLS policy is
 * scoped to DSO members; admins are not members so they can't write
 * with the regular client. The auth check below is what enforces access.
 */

import { revalidatePath } from "next/cache";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export interface AdminActionState {
  ok: boolean;
  error?: string;
}

const VALID_STATUSES = new Set(["pending", "active", "suspended"]);

export async function setDsoStatus(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const newStatus = String(formData.get("new_status") ?? "").trim();

  if (!dsoId || !VALID_STATUSES.has(newStatus)) {
    return { ok: false, error: "Invalid request." };
  }

  // Auth gate — must be in admin_users
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!adminRow) return { ok: false, error: "Not authorized." };

  // Apply the status change with the service-role client.
  const admin = createSupabaseServiceRoleClient();
  const { error } = await admin
    .from("dsos")
    .update({ status: newStatus })
    .eq("id", dsoId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/dsos");
  revalidatePath("/admin");
  // The DSO's public /companies/[slug] page may also need a refresh
  // because verified status is part of the discovery experience.
  revalidatePath("/companies");
  return { ok: true };
}

/**
 * setDsoFeaturedUntil — toggle / set the DSO's spotlight window.
 *
 * Accepts either:
 *   - "clear" → sets featured_until to NULL (removes from spotlight)
 *   - "+30d"  → sets featured_until to now() + 30 days
 *   - "+90d"  → sets featured_until to now() + 90 days
 *
 * Once Spotlight Credits ships (memory: project_spotlight_credits_*),
 * the credit-spend action will write to this same column with the
 * appropriate duration based on tier-allotment policy.
 */
const FEATURED_DURATIONS: Record<string, number | null> = {
  clear: null,
  "+30d": 30,
  "+90d": 90,
};

export async function setDsoFeaturedUntil(
  _prev: AdminActionState,
  formData: FormData
): Promise<AdminActionState> {
  const dsoId = String(formData.get("dso_id") ?? "").trim();
  const action = String(formData.get("action") ?? "").trim();

  if (!dsoId || !(action in FEATURED_DURATIONS)) {
    return { ok: false, error: "Invalid request." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!adminRow) return { ok: false, error: "Not authorized." };

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

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/dsos");
  revalidatePath("/companies");
  return { ok: true };
}
