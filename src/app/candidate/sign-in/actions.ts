"use server";

/**
 * /candidate/sign-in — two-step OTP flow.
 * Step 1: send 6-digit code. Step 2: verify code → session → redirect.
 *
 * `next` is honored after verification IF it's a candidate-safe path
 * (/candidate/* or /jobs/*) — otherwise we default to /candidate/dashboard.
 */

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NEXT_ALLOWLIST = /^\/(candidate\/|jobs\/)/;

export interface CandidateSignInState {
  ok: boolean;
  step: "email" | "verify";
  error?: string;
  message?: string;
  email?: string;
  next?: string;
}

export async function signInCandidate(
  _prev: CandidateSignInState,
  formData: FormData
): Promise<CandidateSignInState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const honeypot = String(formData.get("website") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : "/candidate/dashboard";

  if (honeypot) {
    return { ok: true, step: "verify", email, next, message: "Sign-in code sent." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, step: "email", error: "Please enter a valid email address.", next };
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
          "Too many sign-in requests. Check your spam folder for a recent code, or wait a few minutes before trying again.",
      };
    }
    return {
      ok: false,
      step: "email",
      next,
      error:
        "We couldn't send a sign-in code. If you don't have an account yet, sign up instead.",
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

export async function verifySignInCandidate(
  _prev: CandidateSignInState,
  formData: FormData
): Promise<CandidateSignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s+/g, "");
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : "/candidate/dashboard";

  if (!email || !token) {
    return { ok: false, step: "verify", email, next, error: "Enter the 6-digit code from your email." };
  }
  if (!/^\d{6,10}$/.test(token)) {
    return { ok: false, step: "verify", email, next, error: "That doesn't look like a valid code. Enter the digits from your email." };
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

  redirect(next);
}
