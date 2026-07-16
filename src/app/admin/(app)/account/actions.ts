"use server";

/**
 * /admin/account server actions — superadmin password management.
 * Gated on the same founder allowlist + admin_users membership as the rest
 * of /admin; updates the password on the CURRENT session's user only.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";

export interface SetPasswordState {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function setAdminPassword(
  _prev: SetPasswordState,
  formData: FormData
): Promise<SetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 12) {
    return {
      ok: false,
      error: "Use at least 12 characters for an admin password.",
    };
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords don't match." };
  }
  if (/^password$|^12345/i.test(password)) {
    return { ok: false, error: "Pick something less guessable than that." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isSuperadminEmail(user.email)) {
    return { ok: false, error: "Not signed in as an admin." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const lower = (error.message ?? "").toLowerCase();
    return {
      ok: false,
      error: lower.includes("should be different")
        ? "That's already your current password — pick a new one."
        : "Couldn't update the password. Try again in a moment.",
    };
  }

  return {
    ok: true,
    message:
      "Password updated. Use it next time you sign in at /admin/sign-in.",
  };
}
