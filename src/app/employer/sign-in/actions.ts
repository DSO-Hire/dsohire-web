"use server";

/**
 * /employer/sign-in server action — sends a magic link via Supabase Auth.
 *
 * Supabase handles the email send (via its built-in SMTP or a configured
 * SMTP provider). The link points at /auth/callback?code=...&next=/employer/dashboard.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface SignInState {
  ok: boolean;
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
    return { ok: true, email, message: "Sign-in link sent." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=/employer/dashboard`,
      shouldCreateUser: false, // sign-in, not sign-up — don't auto-create
    },
  });

  if (error) {
    // Supabase returns a generic error if the email isn't registered, to
    // prevent email enumeration. We surface a friendly version.
    return {
      ok: false,
      error:
        "We couldn't send a sign-in link. If you don't have an account yet, sign up instead.",
    };
  }

  return {
    ok: true,
    email,
    message: `Sign-in link sent to ${email}. Check your inbox — it expires in 15 minutes.`,
  };
}
