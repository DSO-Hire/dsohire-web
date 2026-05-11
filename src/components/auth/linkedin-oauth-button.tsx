"use client";

/**
 * "Continue with LinkedIn" button (E2.6 / Phase 5F, shipped 2026-05-11).
 *
 * Wired into both /candidate/sign-up and /candidate/sign-in. Kicks off
 * Supabase's `linkedin_oidc` OAuth flow with redirectTo pointing at the
 * existing /auth/callback handler. The callback handler does:
 *   - exchange code → session
 *   - provision a candidates row if one doesn't exist (the OAuth path
 *     skips the OTP-based service-role provisioning that the
 *     /candidate/sign-up form does)
 *   - route to the requested `next` (apply CTA continuation) or
 *     /candidate/dashboard
 *
 * Setup note for Supabase project config:
 *   - Auth → Providers → LinkedIn (OIDC) must be enabled
 *   - Client ID + Client Secret from LinkedIn Developer app
 *   - Authorized redirect: https://dsohire.com/auth/callback (prod)
 *     + http://localhost:3000/auth/callback (dev)
 *
 * Profile data scope: the default OIDC scope returns `name`, `email`,
 * `picture` — enough to provision the candidate row + populate avatar.
 * Richer profile data (headline, work history) requires a deeper LinkedIn
 * partner app review; deferred until we hit that threshold.
 */

import { useState } from "react";
import { Linkedin, Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

interface LinkedInOAuthButtonProps {
  next?: string;
  /** Surface label, e.g. "Continue with LinkedIn" vs "Sign in with LinkedIn". */
  label?: string;
}

export function LinkedInOAuthButton({
  next,
  label = "Continue with LinkedIn",
}: LinkedInOAuthButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setPending(true);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ""}`
        : undefined;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "linkedin_oidc",
      options: {
        redirectTo,
        scopes: "openid profile email",
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setPending(false);
    }
    // On success the browser navigates away; no further state to update.
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-cream disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Linkedin className="h-4 w-4 text-[#0A66C2]" aria-hidden />
        )}
        {label}
      </button>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
