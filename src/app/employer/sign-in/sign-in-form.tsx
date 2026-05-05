"use client";

import { useState, useActionState } from "react";
import { Mail, ArrowLeft, KeyRound } from "lucide-react";
import {
  signInEmployer,
  verifySignInEmployer,
  signInWithPasswordEmployer,
  type SignInState,
} from "./actions";

const initialEmail: SignInState = { ok: false, step: "email" };
const initialVerify: SignInState = { ok: false, step: "verify" };
const initialPassword: SignInState = { ok: false, step: "email" };

type Mode = "password" | "code";

export function SignInForm() {
  const [mode, setMode] = useState<Mode>("password");

  const [emailState, sendCode, sendingCode] = useActionState(
    signInEmployer,
    initialEmail
  );
  const [verifyState, verify, verifying] = useActionState(
    verifySignInEmployer,
    initialVerify
  );
  const [passwordState, signInPassword, signingInPassword] = useActionState(
    signInWithPasswordEmployer,
    initialPassword
  );

  // After step 1 of code flow succeeds, show OTP input.
  const showVerifyStep =
    emailState.ok && emailState.step === "verify" && emailState.email;
  const codeEmail = emailState.email ?? verifyState.email;

  // ─── OTP code verify step ───────────────────────────────────
  if (mode === "code" && showVerifyStep && codeEmail) {
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
          <input type="hidden" name="email" value={codeEmail} />

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
              maxLength={10}
              pattern="[0-9 ]{6,16}"
              placeholder="Enter code from email"
              className="w-full px-4 py-4 bg-cream border border-[var(--rule-strong)] text-ink text-[22px] font-bold tracking-[6px] text-center placeholder:text-slate-meta placeholder:font-medium placeholder:text-[14px] placeholder:tracking-[1px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
            />
          </div>

          {verifyState.error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <p className="text-[14px] text-red-900">{verifyState.error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={verifying}
            className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifying ? "Verifying…" : "Verify & Sign In"}
          </button>
        </form>

        <div className="pt-4 border-t border-[var(--rule)] flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Wrong email? Start over
          </button>

          <form action={sendCode}>
            <input type="hidden" name="email" value={codeEmail} />
            <button
              type="submit"
              disabled={sendingCode}
              className="text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2 disabled:opacity-60"
            >
              {sendingCode ? "Sending…" : "Send a new code"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Code mode (email entry) ────────────────────────────────
  if (mode === "code") {
    return (
      <form action={sendCode} className="space-y-5">
        <div className="hidden" aria-hidden="true">
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <div>
          <label
            htmlFor="employer-email-code"
            className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
          >
            Work Email <span className="text-heritage">*</span>
          </label>
          <input
            id="employer-email-code"
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@yourdso.com"
            defaultValue={emailState.email ?? passwordState.email ?? ""}
            className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
          />
        </div>

        {emailState.error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <p className="text-[14px] text-red-900">{emailState.error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={sendingCode}
          className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sendingCode ? "Sending Code…" : "Send Sign-In Code"}
          {!sendingCode && <Mail className="h-4 w-4" />}
        </button>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setMode("password")}
            className="text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            ← Use password instead
          </button>
        </div>
      </form>
    );
  }

  // ─── Password mode (default) ────────────────────────────────
  return (
    <form action={signInPassword} className="space-y-5">
      <div className="hidden" aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label
          htmlFor="employer-email-pw"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Work Email <span className="text-heritage">*</span>
        </label>
        <input
          id="employer-email-pw"
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@yourdso.com"
          defaultValue={passwordState.email ?? ""}
          className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      </div>

      <div>
        <label
          htmlFor="employer-password"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Password <span className="text-heritage">*</span>
        </label>
        <input
          id="employer-password"
          type="password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      </div>

      {passwordState.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{passwordState.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={signingInPassword}
        className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {signingInPassword ? "Signing In…" : "Sign In"}
        {!signingInPassword && <KeyRound className="h-4 w-4" />}
      </button>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => setMode("code")}
          className="text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
        >
          No password? Email me a sign-in code →
        </button>
      </div>

      <p className="text-[12px] text-slate-meta leading-relaxed text-center pt-3 border-t border-[var(--rule)]">
        Forgot your password? Sign in with a code, then reset it from{" "}
        <span className="font-semibold">Settings</span>.
      </p>
    </form>
  );
}
