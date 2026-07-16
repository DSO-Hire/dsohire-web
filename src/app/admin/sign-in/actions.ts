"use server";

/**
 * /admin/sign-in server actions — superadmin-only sign-in.
 *
 * Same two mechanisms as the employer flow (password, or emailed 6-digit
 * code) with one hard difference: the email must be on the founder
 * allowlist BEFORE any auth call happens. Non-allowlisted emails get the
 * same generic responses as a wrong password / sent code, so this page
 * never confirms which emails are admins. After a successful auth we also
 * re-verify admin_users membership server-side and sign out on mismatch —
 * defense in depth, since every /admin/* page runs its own gate anyway.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSuperadminEmail } from "@/lib/admin/gate";
import { getMfaState } from "@/lib/auth/mfa";
import { readMfaTrustCookie } from "@/lib/auth/mfa-trust";

const NEXT_ALLOWLIST = /^\/admin(\/|$)/;

export interface AdminSignInState {
  ok: boolean;
  step: "email" | "verify";
  error?: string;
  message?: string;
  email?: string;
  next?: string;
}

function sanitizeNext(raw: FormDataEntryValue | null): string | undefined {
  const next = String(raw ?? "").trim();
  return NEXT_ALLOWLIST.test(next) ? next : undefined;
}

const GENERIC_INVALID =
  "Email or password didn't match. Try again, or sign in with a code instead.";

/** Confirm the signed-in user is a Tier-1 admin; sign out and fail if not. */
async function confirmAdminOrSignOut(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<boolean> {
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!adminRow) {
    await supabase.auth.signOut();
    return false;
  }
  return true;
}

export async function adminSignInWithPassword(
  _prev: AdminSignInState,
  formData: FormData
): Promise<AdminSignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const honeypot = String(formData.get("website") ?? "").trim();
  const next = sanitizeNext(formData.get("next"));

  if (honeypot) {
    return { ok: false, step: "email", email, next, error: GENERIC_INVALID };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password) {
    return {
      ok: false,
      step: "email",
      email,
      next,
      error: "Enter your admin email and password.",
    };
  }

  // Allowlist gate before touching auth — non-admin emails get the same
  // generic failure as a wrong password.
  if (!isSuperadminEmail(email)) {
    return { ok: false, step: "email", email, next, error: GENERIC_INVALID };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { ok: false, step: "email", email, next, error: GENERIC_INVALID };
  }

  if (!(await confirmAdminOrSignOut(supabase, data.user.id))) {
    return { ok: false, step: "email", email, next, error: GENERIC_INVALID };
  }

  const finalDest = next ?? "/admin";
  const mfaState = await getMfaState(supabase);
  if (mfaState.isEnrolled && mfaState.currentLevel !== "aal2") {
    const cookieStore = await cookies();
    const trusted = readMfaTrustCookie(cookieStore, {
      authUserId: data.user.id,
      verifiedFactorId: mfaState.verifiedFactorId,
    });
    if (!trusted) {
      redirect(`/auth/mfa/challenge?next=${encodeURIComponent(finalDest)}`);
    }
  }
  redirect(finalDest);
}

export async function adminSendCode(
  _prev: AdminSignInState,
  formData: FormData
): Promise<AdminSignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const honeypot = String(formData.get("website") ?? "").trim();
  const next = sanitizeNext(formData.get("next"));

  const sentMessage = `If that address has admin access, a 6-digit code is on its way. It expires in 15 minutes.`;

  if (honeypot) {
    return { ok: true, step: "verify", email, next, message: sentMessage };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      step: "email",
      next,
      error: "Please enter a valid email address.",
    };
  }

  // Non-allowlisted emails get the identical "sent" response with no email
  // dispatched — the page never reveals which addresses are admins.
  if (!isSuperadminEmail(email)) {
    return { ok: true, step: "verify", email, next, message: sentMessage };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (error) {
    const lower = (error.message ?? "").toLowerCase();
    if (lower.includes("rate") || lower.includes("limit") || lower.includes("too many")) {
      return {
        ok: false,
        step: "email",
        next,
        error:
          "Too many sign-in requests in a short time. Check your inbox for a recent code, or wait a few minutes.",
      };
    }
    return {
      ok: false,
      step: "email",
      next,
      error: "We couldn't send a sign-in code. Wait a few minutes and try again.",
    };
  }

  return { ok: true, step: "verify", email, next, message: sentMessage };
}

export async function adminVerifyCode(
  _prev: AdminSignInState,
  formData: FormData
): Promise<AdminSignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s+/g, "");
  const next = sanitizeNext(formData.get("next"));

  if (!email || !token || !/^\d{6,10}$/.test(token)) {
    return {
      ok: false,
      step: "verify",
      email,
      next,
      error: "Enter the 6-digit code from your email.",
    };
  }

  if (!isSuperadminEmail(email)) {
    return {
      ok: false,
      step: "verify",
      email,
      next,
      error: "That code didn't match. Check the email and try again.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  if (error || !data.user) {
    const lower = (error?.message ?? "").toLowerCase();
    return {
      ok: false,
      step: "verify",
      email,
      next,
      error: lower.includes("expired")
        ? 'That code expired. Click "Send a new code" to get a fresh one.'
        : "That code didn't match. Check the email and try again, or request a new code.",
    };
  }

  if (!(await confirmAdminOrSignOut(supabase, data.user.id))) {
    return {
      ok: false,
      step: "verify",
      email,
      next,
      error: "That code didn't match. Check the email and try again.",
    };
  }

  const finalDest = next ?? "/admin";
  const mfaState = await getMfaState(supabase);
  if (mfaState.isEnrolled && mfaState.currentLevel !== "aal2") {
    const cookieStore = await cookies();
    const trusted = readMfaTrustCookie(cookieStore, {
      authUserId: data.user.id,
      verifiedFactorId: mfaState.verifiedFactorId,
    });
    if (!trusted) {
      redirect(`/auth/mfa/challenge?next=${encodeURIComponent(finalDest)}`);
    }
  }
  redirect(finalDest);
}
