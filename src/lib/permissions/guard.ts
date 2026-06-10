/**
 * #83 Phase 2 — server-side capability guard (defense-in-depth).
 *
 * Every privileged server action calls one of these BEFORE doing work, in
 * addition to RLS. RLS stays the coarse role floor; this layer evaluates the
 * fine-grained per-teammate capability model (role preset + jsonb overrides)
 * via the pure `can()` from ./capabilities.
 *
 * Usage (one-call form, per the handoff):
 *   const block = await capabilityBlockError(supabase, "jobs.publish");
 *   if (block) return { ok: false, error: block };
 *
 * Actions that already load the acting dso_users row should instead extend
 * their .select() with "role, permission_overrides" and call can() directly —
 * NEVER read columns the select didn't list (untyped client returns
 * undefined silently).
 */

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  can,
  type Capability,
  CAPABILITY_META,
} from "@/lib/permissions/capabilities";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface ActingMember {
  dsoUserId: string;
  dsoId: string;
  role: string;
  permissionOverrides: unknown;
  fullName: string | null;
}

/**
 * Load the acting teammate's dso_users row (auth.uid() → membership).
 * Pass `dsoId` when the action already resolved the target DSO so a
 * multi-membership user is matched to the right org.
 */
export async function getActingMember(
  supabase: SupabaseClient,
  opts?: { dsoId?: string }
): Promise<ActingMember | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  let query = supabase
    .from("dso_users")
    .select("id, dso_id, role, permission_overrides, full_name")
    .eq("auth_user_id", user.id);
  if (opts?.dsoId) query = query.eq("dso_id", opts.dsoId);
  const { data } = await query.maybeSingle();
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    dsoUserId: row.id as string,
    dsoId: row.dso_id as string,
    role: (row.role as string | null) ?? "",
    permissionOverrides: row.permission_overrides,
    fullName: (row.full_name as string | null) ?? null,
  };
}

/** Does this already-loaded member hold `cap`? */
export function memberCan(member: ActingMember, cap: Capability): boolean {
  return can(member.role, member.permissionOverrides, cap);
}

function capLabel(cap: Capability): string {
  return (
    CAPABILITY_META.find((m) => m.key === cap)?.label.toLowerCase() ?? cap
  );
}

/**
 * Friendly form-error when `member` lacks `cap`; null = allowed.
 * Accepts null member so callers can pipe getActingMember straight in.
 */
export function memberBlockError(
  member: ActingMember | null,
  cap: Capability
): string | null {
  if (!member) return "You don't have access to this organization.";
  if (memberCan(member, cap)) return null;
  return `Your account doesn't have permission to ${capLabel(cap)}. An owner or admin can grant this on the Team page.`;
}

/**
 * One-call guard: load the acting member and check `cap`.
 * Returns an error string to surface in the form, or null when allowed.
 */
export async function capabilityBlockError(
  supabase: SupabaseClient,
  cap: Capability,
  opts?: { dsoId?: string }
): Promise<string | null> {
  const member = await getActingMember(supabase, opts);
  return memberBlockError(member, cap);
}
