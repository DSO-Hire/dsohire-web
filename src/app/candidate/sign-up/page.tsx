/**
 * /candidate/sign-up — candidate account creation.
 *
 * Lighter than the employer sign-up — just name + email. Profile fields
 * are filled in later via /candidate/profile or inline during the apply flow.
 *
 * Supports a `?next=` param so we can redirect back to a job's apply page
 * after the user verifies their email (e.g., when sign-up was triggered
 * from the Apply button on /jobs/[id]).
 */

import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { CandidateSignUpForm } from "./sign-up-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a Candidate Account",
  description:
    "Create a free DSO Hire candidate account to apply to jobs at verified dental support organizations.",
};

interface PageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function CandidateSignUpPage({ searchParams }: PageProps) {
  const { next } = await searchParams;

  return (
    <SiteShell>
      <section className="pt-[140px] pb-24 px-6 sm:px-14 max-w-[1100px] mx-auto">
        <div className="text-[10px] font-bold tracking-[3.5px] uppercase text-heritage-deep mb-4">
          Candidate Sign-Up
        </div>
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-[-1.8px] leading-[1.05] text-ink mb-6 max-w-[820px]">
          Apply to verified DSO jobs in one click.
        </h1>
        <p className="text-base sm:text-lg text-slate-body leading-relaxed max-w-[640px] mb-12">
          Free for life. Your profile carries from job to job — no re-typing,
          no resume uploads on every application.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-px bg-[var(--rule)] border border-[var(--rule)]">
          <div className="bg-white p-8 sm:p-10">
            <CandidateSignUpForm next={next} />
          </div>

          <aside className="bg-cream p-8 sm:p-10">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-3">
              What You Get
            </div>
            <div className="text-2xl font-extrabold tracking-[-0.5px] text-ink mb-2">
              Always free
            </div>
            <div className="text-[13px] text-slate-body mb-6 leading-snug">
              No subscriptions, no fees, no upsells. Ever.
            </div>

            <ul className="list-none space-y-2.5 pt-5 border-t border-[var(--rule)]">
              {[
                "Apply to any job in one click",
                "Save profile + resume once, reuse forever",
                "Only verified mid-market DSOs — no recruiter spam",
                "Track every application's status in one dashboard",
                "Get notified when matching roles open",
              ].map((f, i) => (
                <li
                  key={i}
                  className="text-[13px] text-ink flex items-start gap-2 leading-snug"
                >
                  <span className="text-heritage-light font-extrabold flex-shrink-0">
                    ✓
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <p className="mt-10 text-[14px] text-slate-body leading-relaxed">
          Already have a candidate account?{" "}
          <Link
            href="/candidate/sign-in"
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Sign in
          </Link>
        </p>
        <p className="mt-3 text-[14px] text-slate-body leading-relaxed">
          Are you a DSO?{" "}
          <Link
            href="/employer/sign-up"
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Start a DSO subscription
          </Link>
        </p>
      </section>
    </SiteShell>
  );
}
