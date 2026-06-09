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
import { SUPPORT_EMAIL } from "@/lib/contact";
import { composeName, parseSalutation } from "@/lib/candidate/name";

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
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const salutation = parseSalutation(formData.get("salutation"));
  const password = String(formData.get("password") ?? "");
  const honeypot = String(formData.get("website") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : "/candidate/dashboard";

  if (honeypot) {
    return { ok: true, step: "verify", email, next, message: "Sign-up confirmed." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, step: "form", next, error: "Please enter a valid email address." };
  }
  if (!firstName || !lastName) {
    return { ok: false, step: "form", next, error: "Please enter your first and last name." };
  }
  if (password && password.length < 8) {
    return {
      ok: false,
      step: "form",
      next,
      error: "If you're setting a password, it needs to be at least 8 characters. Or leave it blank — you can sign in via emailed code.",
    };
  }

  const admin = createSupabaseServiceRoleClient();

  const { data: createdUser, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      ...(password ? { password } : {}),
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        full_name: composeName({ first_name: firstName, last_name: lastName }),
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
    first_name: firstName,
    last_name: lastName,
    salutation,
    is_searchable: false,
  });

  if (candidateError) {
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      step: "form",
      next,
      error:
        `We couldn't create your candidate profile. Please try again or contact ${SUPPORT_EMAIL}.`,
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

  // #53 (Day 29) — a brand-new candidate with no specific destination goes to
  // the TRACK CHOOSER first (PracticeFit vs DSOFit). The chooser saves their
  // choice and routes them into the right assessment, so every new candidate
  // both self-identifies AND lays eyes on the matching tool. Intentful
  // destinations (e.g. ?next=/jobs/[id]/apply) are respected and skip it.
  const dest = next === "/candidate/dashboard" ? "/candidate/track-chooser" : next;
  redirect(dest);
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
