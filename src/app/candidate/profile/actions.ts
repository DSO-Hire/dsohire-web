"use server";

/**
 * /candidate/profile server actions — save profile fields + avatar URL.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Persist a freshly-uploaded avatar URL to candidates.avatar_url.
 * Called from <ImageUpload>'s onUploaded callback on /candidate/profile.
 *
 * The URL is whatever public-images returned for the upload — we don't
 * sanity-check beyond auth ownership of the candidate row.
 */
export async function setCandidateAvatarUrl(
  url: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { error } = await supabase
    .from("candidates")
    .update({ avatar_url: url })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("[candidate/profile] setCandidateAvatarUrl failed", error);
    return { ok: false, error: "Couldn't save your photo." };
  }

  revalidatePath("/candidate/profile");
  revalidatePath("/candidate/dashboard");
  return { ok: true };
}
