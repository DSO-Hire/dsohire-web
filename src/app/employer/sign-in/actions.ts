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

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SignInState {
  ok: boolean;
  step: "email" | "verify";
  error?: string;
  message?: string;
  email?: string;
}

export async function signInEmployer(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const honeypot = String(formData.get("website") ?? "").trim();

  if (honeypot) {
    return {
      ok: true,
      step: "verify",
      email,
      message: "Sign-in code sent.",
    };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      ok: false,
      step: "email",
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
        error:
          "Too many sign-in requests in a short time. Check your spam folder for a recent code, or wait a few minutes before trying again.",
      };
    }
    return {
      ok: false,
      step: "email",
      error:
        "We couldn't send a sign-in code. Check your spam folder, wait a few minutes, or sign up if you don't have an account yet.",
    };
  }

  return {
    ok: true,
    step: "verify",
    email,
    message: `We sent a 6-digit code to ${email}. Enter it below — it expires in 15 minutes.`,
  };
}

export async function verifySignInEmployer(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s+/g, "");

  if (!email || !token) {
    return {
      ok: false,
      step: "verify",
      email,
      error: "Enter the 6-digit code from your email.",
    };
  }

  if (!/^\d{6,10}$/.test(token)) {
    return {
      ok: false,
      step: "verify",
      email,
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
      error: lower.includes("expired")
        ? "That code expired. Click \"Send a new code\" to get a fresh one."
        : "That code didn't match. Check the email and try again, or request a new code.",
    };
  }

  // Session is set. Route based on DSO membership.
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (!dsoUser) {
    redirect("/employer/onboarding");
  }
  redirect("/employer/dashboard");
}
