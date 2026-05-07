"use server";

/**
 * /candidate/restore server actions (Phase 4.5.g).
 *
 *   • restoreAccount  — clears candidates.deleted_at; on success the
 *                       caller redirects back into the app.
 *   • signOutAndExit  — signs the user out and routes to /candidate/sign-in.
 *                       Used when the candidate confirms the deletion.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result =
  | { ok: true }
  | { ok: false; error: string };

export async function restoreAccount(): Promise<Result> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { error } = await supabase
    .from("candidates")
    .update({ deleted_at: null })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("[candidate/restore] restoreAccount", error);
    return {
      ok: false,
      error: "Couldn't restore the account. Email cam@dsohire.com if this persists.",
    };
  }
  return { ok: true };
}

export async function signOutAndExit(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/candidate/sign-in");
}
