"use server";

/**
 * Account tab additional server actions (Phase 4.3.a).
 *
 * Three actions:
 *   • requestEmailChange — kicks off Supabase Auth's verify-new-before-swap.
 *     Calls supabase.auth.updateUser({ email }); Supabase emails the new
 *     address with a confirmation link; the swap only happens once the
 *     user clicks. Returns success synchronously even though the swap
 *     is pending.
 *   • updatePhone — writes the candidate's phone number for future SMS
 *     opt-in. v1 is a column update; SMS infra ships later.
 *
 * Language preference is a UI-only stub for v1 (no DB column) — added
 * here as a no-op action so the form's onSubmit is always wired.
 */

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type Result =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_MAX_LEN = 24;

// ─────────────────────────────────────────────────────────────────────
// Email change — verify-new-before-swap
// ─────────────────────────────────────────────────────────────────────

export async function requestEmailChange(newEmail: string): Promise<Result> {
  const trimmed = newEmail.trim().toLowerCase();
  if (!trimmed) {
    return { ok: false, error: "Enter a new email address." };
  }
  if (!EMAIL_RE.test(trimmed)) {
    return { ok: false, error: "That doesn't look like a valid email." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  if (user.email && user.email.toLowerCase() === trimmed) {
    return {
      ok: false,
      error: "That's already your email address.",
    };
  }

  // Supabase Auth handles the verification flow:
  //   1. updateUser({ email }) returns success
  //   2. Supabase sends a confirmation email to the NEW address
  //   3. The candidate clicks the link → email is swapped on their auth row
  // The current session keeps the old email until the swap commits.
  const { error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) {
    console.error("[settings/account] requestEmailChange", error);
    return {
      ok: false,
      error:
        error.message ||
        "Couldn't send the confirmation email. Try again in a moment.",
    };
  }

  return {
    ok: true,
    message: `Confirmation email sent to ${trimmed}. Click the link in that email to finalize the change.`,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Phone capture (for future SMS opt-in)
// ─────────────────────────────────────────────────────────────────────

export async function updatePhone(phone: string): Promise<Result> {
  const trimmed = phone.trim();
  if (trimmed.length > PHONE_MAX_LEN) {
    return { ok: false, error: "Phone number is too long." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in." };

  const { error } = await supabase
    .from("candidates")
    .update({ phone: trimmed || null })
    .eq("auth_user_id", user.id);

  if (error) {
    console.error("[settings/account] updatePhone", error);
    return { ok: false, error: "Couldn't save your phone number." };
  }
  revalidatePath("/candidate/settings/account");
  revalidatePath("/candidate/profile");
  return {
    ok: true,
    message: trimmed
      ? "Phone number saved. We'll use this when SMS notifications ship."
      : "Phone number cleared.",
  };
}
