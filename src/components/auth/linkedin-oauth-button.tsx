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
import { Loader2 } from "lucide-react";
import { createBrowserClient } from "@supabase/ssr";

/**
 * LinkedIn "in" mark as inline SVG. lucide-react dropped brand icons in
 * v0.317 over trademark concerns; we render it ourselves. The mark is
 * the official LinkedIn logo and brand-guideline-permitted on a "Sign
 * in with LinkedIn" button.
 */
function LinkedInMark({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

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
          <LinkedInMark className="h-4 w-4 text-[#0A66C2]" />
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
