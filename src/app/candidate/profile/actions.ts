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

const ACCENT_HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Persist the candidate's chosen profile header accent color (2026-05-22).
 * Null clears it back to the default heritage green. Validated as a 6-digit
 * hex here AND by a DB CHECK constraint (candidates_profile_accent_color_hex_chk).
 */
export async function setCandidateProfileAccentColor(
  hex: string | null
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const value = hex && hex.trim() ? hex.trim().toLowerCase() : null;
  if (value !== null && !ACCENT_HEX_RE.test(value)) {
    return { ok: false, error: "Pick a valid 6-digit hex color." };
  }

  const { error } = await supabase
    .from("candidates")
    .update({ profile_accent_color: value })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error(
      "[candidate/profile] setCandidateProfileAccentColor failed",
      error
    );
    return { ok: false, error: "Couldn't save your header color." };
  }

  revalidatePath("/candidate/profile");
  revalidatePath("/candidate/profile/preview");
  return { ok: true };
}
