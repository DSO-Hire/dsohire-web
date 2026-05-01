"use server";

/**
 * /employer/settings server actions.
 * - updatePassword: set/change password while signed in
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PasswordState {
  ok: boolean;
  error?: string;
  message?: string;
}

export async function updatePassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!password || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { ok: false, error: "The two password fields don't match." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your session expired. Please sign in again." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    message:
      "Password updated. You can now sign in with this password OR an emailed code, your choice.",
  };
}
