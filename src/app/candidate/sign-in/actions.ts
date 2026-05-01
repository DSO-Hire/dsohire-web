"use server";

/**
 * /candidate/sign-in server action — magic link sign-in for candidates.
 */

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CandidateSignInState {
  ok: boolean;
  error?: string;
  message?: string;
  email?: string;
}

const NEXT_ALLOWLIST = /^\/(candidate\/|jobs\/)/;

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
    return { ok: true, email, message: "Sign-in link sent." };
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }

  const supabase = await createSupabaseServerClient();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) {
    const lower = (error.message ?? "").toLowerCase();
    if (lower.includes("rate") || lower.includes("limit") || lower.includes("too many")) {
      return {
        ok: false,
        error:
          "Too many sign-in requests. Check your spam folder for a recent link, or wait a few minutes before trying again.",
      };
    }
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
