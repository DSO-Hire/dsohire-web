/**
 * Shared superadmin (founder-only) gate.
 *
 * Single source of truth for the admin email allowlist + the auth check used by
 * founder-only surfaces (e.g. /admin/analytics). Extracted so Vantage and any
 * future admin surface share one definition rather than re-declaring ADMIN_EMAILS
 * inline. (The pre-existing /admin/support/conversations + /admin/cs pages keep
 * their own copies for now; they can adopt this later — same two emails.)
 */

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const ADMIN_EMAILS = new Set<string>([
  "cam@dsohire.com",
  "cameron@eslingerdental.com",
]);

export function isSuperadminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.has(email.toLowerCase());
}

/**
 * Require a signed-in superadmin. Redirects to sign-in if signed out, or to the
 * home page if signed in but not allowlisted. Returns the user on success.
 */
export async function requireSuperadmin(nextPath = "/admin"): Promise<User> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/employer/sign-in?next=${encodeURIComponent(nextPath)}`);
  if (!isSuperadminEmail(user.email)) redirect("/");

  return user;
}
