"use server";

/**
 * /employer/sign-in server actions — two-step OTP flow.
 *
 * Step 1 (signInEmployer): user submits email → server calls signInWithOtp
 *   WITHOUT emailRedirectTo. With the email template configured to use
 *   {{ .Token }}, Supabase emails a 6-digit code (no PKCE state cookie
 *   needed, so cross-browser/cross-device works fine).
 *
 * Step 2 (verifySignInEmployer): user enters the 6-digit code on the same
 *   page → server calls verifyOtp({ type: "email" }) which sets the session
 *   cookie. We then redirect to onboarding or dashboard based on whether
 *   the user has a dso_users row.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMfaState } from "@/lib/auth/mfa";
import { readMfaTrustCookie } from "@/lib/auth/mfa-trust";

const NEXT_ALLOWLIST = /^\/employer\//;

export interface SignInState {
  ok: boolean;
  step: "email" | "verify";
  error?: string;
  message?: string;
  email?: string;
  next?: string;
}

export async function signInEmployer(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const honeypot = String(formData.get("website") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : undefined;

  if (honeypot) {
    return {
      ok: true,
      step: "verify",
      email,
      next,
      message: "Sign-in code sent.",
    };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      step: "email",
      next,
      error: "Please enter a valid email address.",
    };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false, // sign-in only, don't create new accounts
    },
  });

  if (error) {
    const lower = (error.message ?? "").toLowerCase();
    if (lower.includes("rate") || lower.includes("limit") || lower.includes("too many")) {
      return {
        ok: false,
        step: "email",
        next,
        error:
          "Too many sign-in requests in a short time. Check your spam folder for a recent code, or wait a few minutes before trying again.",
      };
    }
    return {
      ok: false,
      step: "email",
      next,
      error:
        "We couldn't send a sign-in code. Check your spam folder, wait a few minutes, or sign up if you don't have an account yet.",
    };
  }

  return {
    ok: true,
    step: "verify",
    email,
    next,
    message: `We sent a 6-digit code to ${email}. Enter it below — it expires in 15 minutes.`,
  };
}

export async function verifySignInEmployer(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s+/g, "");
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : undefined;

  if (!email || !token) {
    return {
      ok: false,
      step: "verify",
      email,
      next,
      error: "Enter the 6-digit code from your email.",
    };
  }

  if (!/^\d{6,10}$/.test(token)) {
    return {
      ok: false,
      step: "verify",
      email,
      next,
      error: "That doesn't look like a valid code. Enter the digits from your email.",
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
        ? "That code expired. Click \"Send a new code\" to get a fresh one."
        : "That code didn't match. Check the email and try again, or request a new code.",
    };
  }

  // Session is set. If the user has 2FA enabled, step up before routing
  // unless this browser holds a valid trust-this-device cookie.
  const mfaState = await getMfaState(supabase);
  const finalDest =
    next ?? (await resolveSignedInDestination(supabase, data.user.id));
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

/** Shared: where does a signed-in employer land based on DSO membership? */
async function resolveSignedInDestination(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string
): Promise<string> {
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  return dsoUser ? "/employer/dashboard" : "/employer/onboarding";
}

/**
 * Password sign-in — alternative to OTP code for users who've set a password.
 */
export async function signInWithPasswordEmployer(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const honeypot = String(formData.get("website") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : undefined;

  if (honeypot) {
    return { ok: true, step: "email", email, next };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, step: "email", next, error: "Please enter a valid email address." };
  }
  if (!password) {
    return { ok: false, step: "email", email, next, error: "Please enter your password." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const lower = (error?.message ?? "").toLowerCase();
    if (lower.includes("invalid")) {
      return {
        ok: false,
        step: "email",
        email,
        next,
        error: "Email or password didn't match. Try again, or sign in with a code instead.",
      };
    }
    if (lower.includes("not confirmed") || lower.includes("email not confirmed")) {
      return {
        ok: false,
        step: "email",
        email,
        next,
        error: "Verify your email first — sign in with a code below to confirm, then set/use your password.",
      };
    }
    return {
      ok: false,
      step: "email",
      email,
      next,
      error: error?.message ?? "Sign-in failed. Try again or use a code instead.",
    };
  }

  const mfaState = await getMfaState(supabase);
  const finalDest =
    next ?? (await resolveSignedInDestination(supabase, data.user.id));
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
