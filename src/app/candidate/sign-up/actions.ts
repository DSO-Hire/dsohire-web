"use server";

/**
 * /candidate/sign-up — two-step OTP flow.
 *
 * Step 1 (signUpCandidate): create auth user + candidates row via service role,
 *   then send a 6-digit verification code via signInWithOtp (no emailRedirectTo).
 * Step 2 (verifySignUpCandidate): verify code → set session → redirect to
 *   `next` (e.g. /jobs/[id]/apply when sign-up was initiated from an apply CTA),
 *   else /candidate/dashboard.
 */

import { redirect } from "next/navigation";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

const NEXT_ALLOWLIST = /^\/(candidate\/|jobs\/)/;

export interface CandidateSignUpState {
  ok: boolean;
  step: "form" | "verify";
  error?: string;
  message?: string;
  email?: string;
  next?: string;
}

export async function signUpCandidate(
  _prev: CandidateSignUpState,
  formData: FormData
): Promise<CandidateSignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const honeypot = String(formData.get("website") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : "/candidate/dashboard";

  if (honeypot) {
    return { ok: true, step: "verify", email, next, message: "Sign-up confirmed." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, step: "form", next, error: "Please enter a valid email address." };
  }
  if (!fullName) {
    return { ok: false, step: "form", next, error: "Please enter your full name." };
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: createdUser, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        role_during_signup: "candidate",
      },
    });

  if (createUserError || !createdUser?.user) {
    if (createUserError?.message?.toLowerCase().includes("already")) {
      return {
        ok: false,
        step: "form",
        next,
        error:
          "An account with this email already exists. Sign in instead — we'll send you a fresh code.",
      };
    }
    return {
      ok: false,
      step: "form",
      next,
      error: createUserError?.message ?? "Failed to create your account.",
    };
  }

  const authUserId = createdUser.user.id;

  const { error: candidateError } = await admin.from("candidates").insert({
    auth_user_id: authUserId,
    full_name: fullName,
    is_searchable: false,
  });

  if (candidateError) {
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      step: "form",
      next,
      error:
        "We couldn't create your candidate profile. Please try again or contact cam@dsohire.com.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });

  if (otpError) {
    return {
      ok: false,
      step: "form",
      next,
      error:
        "Account created but we couldn't send the verification email. Try signing in.",
    };
  }

  return {
    ok: true,
    step: "verify",
    email,
    next,
    message: `We sent a 6-digit verification code to ${email}. Enter it below — it expires in 15 minutes.`,
  };
}

export async function verifySignUpCandidate(
  _prev: CandidateSignUpState,
  formData: FormData
): Promise<CandidateSignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").trim().replace(/\s+/g, "");
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : "/candidate/dashboard";

  if (!email || !token) {
    return { ok: false, step: "verify", email, next, error: "Enter the 6-digit code from your email." };
  }
  if (!/^\d{6}$/.test(token)) {
    return { ok: false, step: "verify", email, next, error: "Codes are 6 digits. Double-check and try again." };
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

export async function resendCandidateSignUpCode(
  _prev: CandidateSignUpState,
  formData: FormData
): Promise<CandidateSignUpState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : "/candidate/dashboard";
  if (!email) {
    return { ok: false, step: "verify", next, error: "Missing email." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    return {
      ok: false,
      step: "verify",
      email,
      next,
      error: "Couldn't resend. Wait a minute and try again.",
    };
  }
  return {
    ok: true,
    step: "verify",
    email,
    next,
    message: `New code sent to ${email}.`,
  };
}
