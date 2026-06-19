/**
 * /auth/confirm-signup — friendly landing for the prefill link in the
 * 6-digit signup email. The code arrives in the URL (?email=&code=) already
 * filled into the field below, so the user just clicks "Confirm & continue"
 * — no copying from the email. Verification happens on that button press
 * (see ./actions.ts), never on the bare GET, so link prefetchers can't burn
 * the one-time code.
 */

import Link from "next/link";
import { SiteShell } from "@/components/marketing/site-shell";
import { confirmSignupCode } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfirmSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; code?: string; error?: string }>;
}) {
  const { email, code, error } = await searchParams;

  const errorMessage =
    error === "expired"
      ? "That code has expired — codes are good for 15 minutes. Head back to sign-up to request a fresh one."
      : error === "invalid"
        ? "That code didn't look right. Re-enter the 6 digits from your email, or request a new code."
        : null;

  // A link missing its email or code can't prefill anything — guide the
  // user back to the right starting point rather than showing an empty form.
  if (!email || !code) {
    return (
      <SiteShell>
        <section className="mx-auto max-w-[560px] px-6 pb-24 pt-[160px] text-center sm:px-14">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-[3.5px] text-heritage-deep">
            Confirm your account
          </div>
          <h1 className="mb-5 text-3xl font-extrabold leading-[1.1] tracking-[-1.5px] text-ink sm:text-4xl">
            This confirmation link is incomplete.
          </h1>
          <p className="mb-9 text-base leading-[1.7] text-slate-body">
            Open the most recent “Confirm your signup” email and tap the verify
            button there, or head back to sign-up to start again.
          </p>
          <div className="flex flex-wrap justify-center gap-3.5">
            <Link
              href="/employer/sign-up"
              className="inline-flex items-center bg-primary px-9 py-4 text-[12px] font-bold uppercase tracking-[2px] text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Employer sign-up
            </Link>
            <Link
              href="/candidate/sign-up"
              className="inline-flex items-center border border-[var(--rule-strong)] px-9 py-[15px] text-[12px] font-bold uppercase tracking-[2px] text-ink transition-colors hover:border-ink"
            >
              Job-seeker sign-up
            </Link>
          </div>
        </section>
      </SiteShell>
    );
  }

  return (
    <SiteShell>
      <section className="mx-auto max-w-[520px] px-6 pb-24 pt-[160px] sm:px-14">
        <div className="text-center">
          <div className="mb-4 text-[10px] font-bold uppercase tracking-[3.5px] text-heritage-deep">
            Confirm your account
          </div>
          <h1 className="mb-3 text-3xl font-extrabold leading-[1.1] tracking-[-1.5px] text-ink sm:text-4xl">
            You&apos;re one click away.
          </h1>
          <p className="mb-8 text-base leading-[1.7] text-slate-body">
            We filled in the code from your email for{" "}
            <span className="font-semibold text-ink">{email}</span>. Just confirm
            to continue.
          </p>
        </div>

        {errorMessage && (
          <div className="mb-6 border border-danger bg-danger-bg px-4 py-3 text-[13px] leading-relaxed text-danger">
            {errorMessage}
          </div>
        )}

        <form action={confirmSignupCode} className="space-y-5">
          <input type="hidden" name="email" value={email} />
          <div>
            <label
              htmlFor="code"
              className="mb-2 block text-[12px] font-semibold uppercase tracking-[1.5px] text-slate-meta"
            >
              Verification code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              defaultValue={code}
              maxLength={10}
              className="w-full border border-[var(--rule-strong)] bg-cream px-4 py-4 text-center text-2xl font-bold tracking-[0.4em] text-ink focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-primary px-9 py-4 text-[12px] font-bold uppercase tracking-[2px] text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Confirm &amp; continue
          </button>
        </form>

        <p className="mt-6 text-center text-[12px] leading-relaxed text-slate-meta">
          Code expired or not working?{" "}
          <Link href="/employer/sign-up" className="font-semibold text-heritage-deep hover:underline">
            Start sign-up again
          </Link>{" "}
          to get a fresh one.
        </p>
      </section>
    </SiteShell>
  );
}
