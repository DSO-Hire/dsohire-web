/**
 * CRM access gate (2026-10-19). Mirrors the database rule in
 * private.is_crm_admin(): an admin_users row with role 'superadmin' AND an
 * aal2 session (second factor verified this session). Pages call
 * crmPageGate(); server actions call requireCrmAdmin(). Postgres enforces
 * the same rule underneath, so a bug here can only ever hide data, never
 * leak it.
 */

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMfaState } from "@/lib/auth/mfa";

type Supa = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface CrmSession {
  supabase: Supa;
  user: User;
  me: string;
  admin: { full_name: string | null; email: string | null };
}

async function aalOf(supabase: Supa): Promise<string | null> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.currentLevel ?? null;
  } catch {
    return null;
  }
}

/** For layouts and pages: redirects to sign-in / MFA, or returns "denied"
 *  (not a superadmin) or "needs_mfa" (no verified factor enrolled; sending
 *  that account to the challenge would bounce straight back here). */
async function gateUncached(
  next: string
): Promise<CrmSession | "denied" | "needs_mfa"> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/admin/sign-in?next=${encodeURIComponent(next)}`);

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!adminRow || adminRow.role !== "superadmin") return "denied";

  if ((await aalOf(supabase)) !== "aal2") {
    const mfa = await getMfaState(supabase);
    if (!mfa.isEnrolled) return "needs_mfa";
    redirect(`/auth/mfa/challenge?next=${encodeURIComponent(next)}`);
  }

  return {
    supabase,
    user,
    me: user.id,
    admin: { full_name: (adminRow.full_name as string | null) ?? null, email: user.email ?? null },
  };
}

/* cache(): the layout, the page and generateMetadata share one check per
   request instead of three rounds of auth + admin_users queries. */
const gateCached = cache(gateUncached);
export async function crmPageGate(next = "/crm"): Promise<CrmSession | "denied" | "needs_mfa"> {
  return gateCached(next);
}

/** For server actions: returns the session or null (callers return an error). */
export async function requireCrmAdmin(): Promise<CrmSession | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!adminRow || adminRow.role !== "superadmin") return null;
  if ((await aalOf(supabase)) !== "aal2") return null;
  return {
    supabase,
    user,
    me: user.id,
    admin: { full_name: (adminRow.full_name as string | null) ?? null, email: user.email ?? null },
  };
}
