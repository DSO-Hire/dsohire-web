/**
 * /employer/sign-in — magic-link sign-in for DSO employer users.
 *
 * Email-only form. Server action calls supabase.auth.signInWithOtp which
 * sends a one-time link to the user's email. Click → /auth/callback → dashboard.
 */

import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { SignInForm } from "./sign-in-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Employer Sign In",
  description:
    "Sign in to your DSO Hire employer account with a one-time magic link.",
};

export default function SignInPage() {
  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[640px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
          Employer Sign In
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-6">
          Welcome back.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed mb-10">
          Enter the email tied to your DSO account. We&apos;ll send you a one-time
          sign-in link — no password to remember.
        </p>

        <div className="border border-[var(--rule)] bg-white p-8 sm:p-10">
          <SignInForm />
        </div>

        <p className="mt-10 text-[14px] text-slate-body leading-relaxed">
          Don&apos;t have an account yet?{" "}
          <Link
            href="/employer/sign-up"
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Start a DSO subscription
          </Link>
        </p>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Looking for a job?{" "}
          <Link
            href="/candidate/sign-in"
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Candidate sign-in
          </Link>
        </p>
      </section>
    </SiteShell>
  );
}
