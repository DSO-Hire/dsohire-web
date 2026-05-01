"use client";

import { useActionState } from "react";
import { Mail, ArrowLeft } from "lucide-react";
import {
  signInEmployer,
  verifySignInEmployer,
  type SignInState,
} from "./actions";

const initialEmail: SignInState = { ok: false, step: "email" };
const initialVerify: SignInState = { ok: false, step: "verify" };

export function SignInForm() {
  const [emailState, sendCode, sendingCode] = useActionState(
    signInEmployer,
    initialEmail
  );
  const [verifyState, verify, verifying] = useActionState(
    verifySignInEmployer,
    initialVerify
  );

  // After step 1 succeeds, the email-state action returns step=verify; we
  // render the OTP entry form. The verify action redirects on success so
  // we never need to render a "signed in!" state — the page navigates away.
  const showVerifyStep =
    emailState.ok && emailState.step === "verify" && emailState.email;
  const email = emailState.email ?? verifyState.email;

  if (showVerifyStep && email) {
    return (
      <div className="space-y-5">
        <div className="border-l-4 border-heritage bg-cream p-5">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
            Check your inbox
          </div>
          <p className="text-[14px] text-ink leading-relaxed">
            {emailState.message}
          </p>
        </div>

        <form action={verify} className="space-y-4">
          <input type="hidden" name="email" value={email} />

          <div>
            <label
              htmlFor="employer-otp"
              className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
            >
              6-Digit Code <span className="text-heritage">*</span>
            </label>
            <input
              id="employer-otp"
              type="text"
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="123456"
              className="w-full px-4 py-4 bg-cream border border-[var(--rule-strong)] text-ink text-[24px] font-bold tracking-[10px] text-center placeholder:text-slate-meta placeholder:font-normal placeholder:tracking-[6px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
            />
          </div>

          {verifyState.error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <p className="text-[13px] text-red-900">{verifyState.error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={verifying}
            className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifying ? "Verifying…" : "Verify & Sign In"}
          </button>
        </form>

        <div className="pt-4 border-t border-[var(--rule)] flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Wrong email? Start over
          </button>

          <form action={sendCode}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={sendingCode}
              className="text-[12px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2 disabled:opacity-60"
            >
              {sendingCode ? "Sending…" : "Send a new code"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={sendCode} className="space-y-5">
      <div className="hidden" aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label
          htmlFor="employer-email"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Work Email <span className="text-heritage">*</span>
        </label>
        <input
          id="employer-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@yourdso.com"
          defaultValue={emailState.email ?? ""}
          className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      </div>

      {emailState.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[13px] text-red-900">{emailState.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={sendingCode}
        className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {sendingCode ? "Sending Code…" : "Send Sign-In Code"}
        {!sendingCode && <Mail className="h-4 w-4" />}
      </button>

      <p className="text-[12px] text-slate-meta leading-relaxed">
        We&apos;ll email a 6-digit code. Enter it on the next screen — works in
        any browser, no link clicking. Read our{" "}
        <a
          href="/legal/privacy"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}
