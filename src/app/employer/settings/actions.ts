"use server";

/**
 * /employer/settings server actions.
 * - updatePassword: set/change password while signed in
 * - setDsoLogoUrl: persist a freshly-uploaded DSO logo URL to dsos.logo_url
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Persist a DSO logo URL after <ImageUpload> finishes its storage write.
 * v1: any DSO member can update the logo. Phase 4.5.c will scope this
 * to owner/admin once the granular role model lands.
 */
export async function setDsoLogoUrl(
  url: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("dso_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!dsoUser) return { ok: false, error: "No DSO membership found." };

  const { error } = await supabase
    .from("dsos")
    .update({ logo_url: url })
    .eq("id", dsoUser.dso_id);

  if (error) {
    console.error("[employer/settings] setDsoLogoUrl failed", error);
    return { ok: false, error: "Couldn't save the DSO logo." };
  }

  revalidatePath("/employer/settings");
  revalidatePath("/employer/settings/profile");
  revalidatePath("/employer/settings/account");
  revalidatePath("/employer/dashboard");
  // Public company page also displays the logo.
  const { data: dso } = await supabase
    .from("dsos")
    .select("slug")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();
  if (dso?.slug) revalidatePath(`/companies/${dso.slug}`);

  return { ok: true };
}

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
