"use server";

/**
 * /candidate/sign-up server action.
 *
 * Creates the auth user + candidates row atomically using the service-role
 * client, then sends a magic link to verify the email. After verification
 * the user lands on /candidate/dashboard (or whatever `next` was passed,
 * e.g. /jobs/[id]/apply when sign-up was triggered from the apply CTA).
 */

import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export interface CandidateSignUpState {
  ok: boolean;
  error?: string;
  message?: string;
  email?: string;
}

const NEXT_ALLOWLIST = /^\/(candidate\/|jobs\/)/;

export async function signUpCandidate(
  _prev: CandidateSignUpState,
  formData: FormData
): Promise<CandidateSignUpState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const honeypot = String(formData.get("website") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();
  const next = NEXT_ALLOWLIST.test(nextRaw) ? nextRaw : "/candidate/dashboard";

  if (honeypot) {
    return { ok: true, email, message: "Sign-up confirmed." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (!fullName) {
    return { ok: false, error: "Please enter your full name." };
  }

  const admin = createSupabaseServiceRoleClient();

  const {
    data: createdUser,
    error: createUserError,
  } = await admin.auth.admin.createUser({
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
        error:
          "An account with this email already exists. Sign in instead — we'll send you a fresh magic link.",
      };
    }
    return {
      ok: false,
      error: createUserError?.message ?? "Failed to create your account.",
    };
  }

  const authUserId = createdUser.user.id;

  const { error: candidateError } = await admin.from("candidates").insert({
    auth_user_id: authUserId,
    full_name: fullName,
    is_searchable: false, // off by default — flips on once they fill profile
  });

  if (candidateError) {
    await admin.auth.admin.deleteUser(authUserId);
    return {
      ok: false,
      error:
        "We couldn't create your candidate profile. Please try again or contact cam@dsohire.com.",
    };
  }

  // Send the magic-link verification email.
  const supabase = await createSupabaseServerClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (otpError) {
    return {
      ok: false,
      error:
        "Account created but we couldn't send the verification email. Try signing in.",
    };
  }

  return {
    ok: true,
    email,
    message: `Check your inbox — we sent a verification link to ${email}. Click it to finish signing in.`,
  };
}
