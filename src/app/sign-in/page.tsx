/**
 * /sign-in — unified entry point.
 *
 * The actual authentication surfaces live at /employer/sign-in and
 * /candidate/sign-in (each has its own form, OTP wiring, and password
 * fallback). This page is just the audience picker — two cards side by
 * side so a returning visitor doesn't accidentally land on the wrong
 * sign-in form.
 *
 * The marketing nav + footer now point here instead of directly at
 * /employer/sign-in, which was implicitly biasing every "Sign In" click
 * toward the employer flow.
 */

import Link from "next/link";
import { ArrowRight, Briefcase, UserCircle } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to DSO Hire. Choose DSO if you post jobs, or Candidate if you apply to them.",
};

export default function SignInPickerPage() {
  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[1100px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
          Sign In
        </div>
        <h1 className="text-4xl sm:text-7xl font-extrabold tracking-[-2px] leading-[1.02] text-ink mb-5 max-w-[820px]">
          Welcome back.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px] mb-14">
          Two account types — pick the one that matches you. If you post jobs
          for a dental support organization, you&apos;re a DSO. If you&apos;re
          looking for one, you&apos;re a candidate.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-[var(--rule)] border border-[var(--rule)]">
          {/* DSO card */}
          <SignInCard
            icon={<Briefcase className="h-6 w-6 text-heritage-deep" />}
            eyebrow="For DSOs"
            title="Sign in as a DSO"
            blurb="Post jobs across your locations, manage applications, and access your subscription."
            primaryHref="/employer/sign-in"
            primaryLabel="Sign in to DSO account"
            secondaryHref="/employer/sign-up"
            secondaryLabel="Don't have a DSO subscription? Start one"
          />

          {/* Candidate card */}
          <SignInCard
            icon={<UserCircle className="h-6 w-6 text-heritage-deep" />}
            eyebrow="For Candidates"
            title="Sign in as a Candidate"
            blurb="Track your applications, update your profile + resume, and apply to verified DSO jobs in one click."
            primaryHref="/candidate/sign-in"
            primaryLabel="Sign in to candidate account"
            secondaryHref="/candidate/sign-up"
            secondaryLabel="New here? Create a free candidate account"
          />
        </div>
      </section>
    </SiteShell>
  );
}

function SignInCard({
  icon,
  eyebrow,
  title,
  blurb,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  blurb: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}) {
  return (
    <div className="bg-white p-9 sm:p-11 flex flex-col">
      <div className="mb-5">{icon}</div>
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
        {eyebrow}
      </div>
      <h2 className="text-2xl font-extrabold tracking-[-0.5px] text-ink leading-tight mb-3">
        {title}
      </h2>
      <p className="text-[14px] text-slate-body leading-relaxed mb-8 flex-1">
        {blurb}
      </p>
      <Link
        href={primaryHref}
        className="inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors mb-3"
      >
        {primaryLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
      <Link
        href={secondaryHref}
        className="text-[12px] text-heritage-deep hover:text-ink underline underline-offset-2 font-semibold text-center"
      >
        {secondaryLabel}
      </Link>
    </div>
  );
}
