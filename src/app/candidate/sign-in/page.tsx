/**
 * /candidate/sign-in — magic-link sign-in for candidates.
 *
 * Email-only form. Mirrors /employer/sign-in but routes to /candidate/dashboard
 * (or whatever `next` was passed) after the magic-link callback.
 */

import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { CandidateSignInForm } from "./sign-in-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Candidate Sign In",
  description:
    "Sign in to your DSO Hire candidate account with a one-time magic link.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function CandidateSignInPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[640px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
          Candidate Sign In
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-6">
          Welcome back.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed mb-10">
          Enter the email tied to your candidate account. We&apos;ll send you a
          one-time sign-in link — no password to remember.
        </p>

        <div className="border border-[var(--rule)] bg-white p-8 sm:p-10">
          <CandidateSignInForm next={next} />
        </div>

        <p className="mt-10 text-[14px] text-slate-body leading-relaxed">
          Don&apos;t have an account yet?{" "}
          <Link
            href={
              next
                ? `/candidate/sign-up?next=${encodeURIComponent(next)}`
                : "/candidate/sign-up"
            }
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Create a candidate account
          </Link>
        </p>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Are you a DSO?{" "}
          <Link
            href="/employer/sign-in"
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Employer sign-in
          </Link>
        </p>
      </section>
    </SiteShell>
  );
}
