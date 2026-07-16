"use client";

import { useState, useActionState } from "react";
import { Mail, ArrowLeft, ShieldCheck } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";
import {
  adminSendCode,
  adminVerifyCode,
  adminSignInWithPassword,
  type AdminSignInState,
} from "./actions";

const initialEmail: AdminSignInState = { ok: false, step: "email" };
const initialVerify: AdminSignInState = { ok: false, step: "verify" };
const initialPassword: AdminSignInState = { ok: false, step: "email" };

type Mode = "password" | "code";

const inputClasses =
  "w-full px-4 py-3.5 bg-white/[0.06] border border-white/15 text-white text-sm placeholder:text-white/35 focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/40 transition-colors";
const labelClasses =
  "block text-2xs font-bold tracking-[2px] uppercase text-white/60 mb-2";
const buttonClasses =
  "inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-white text-ink text-xs font-bold tracking-[2px] uppercase hover:bg-white/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed";
const linkClasses =
  "text-xs font-semibold text-white/70 hover:text-white underline underline-offset-2";
const errorClasses = "bg-danger/15 border-l-4 border-danger p-4";

export function AdminSignInForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<Mode>("password");

  const [emailState, sendCode, sendingCode] = useActionState(
    adminSendCode,
    initialEmail
  );
  const [verifyState, verify, verifying] = useActionState(
    adminVerifyCode,
    initialVerify
  );
  const [passwordState, signInPassword, signingInPassword] = useActionState(
    adminSignInWithPassword,
    initialPassword
  );

  const showVerifyStep =
    emailState.ok && emailState.step === "verify" && emailState.email;
  const codeEmail = emailState.email ?? verifyState.email;
  const carriedNext =
    emailState.next ?? verifyState.next ?? passwordState.next ?? next;

  // ─── OTP code verify step ───────────────────────────────────
  if (mode === "code" && showVerifyStep && codeEmail) {
    return (
      <div className="space-y-5">
        <div className="border-l-4 border-white/40 bg-white/[0.06] p-5">
          <div className="text-2xs font-bold tracking-[2.5px] uppercase text-white/60 mb-1.5">
            Check your inbox
          </div>
          <p className="text-sm text-white/85 leading-relaxed">
            {emailState.message}
          </p>
        </div>

        <form action={verify} className="space-y-4">
          <input type="hidden" name="email" value={codeEmail} />
          {carriedNext && <input type="hidden" name="next" value={carriedNext} />}

          <div>
            <label htmlFor="admin-otp" className={labelClasses}>
              6-Digit Code <span className="text-white">*</span>
            </label>
            <input
              id="admin-otp"
              type="text"
              name="token"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              maxLength={10}
              pattern="[0-9 ]{6,16}"
              placeholder="Enter code from email"
              className={`${inputClasses} text-[22px] font-bold tracking-[6px] text-center placeholder:font-medium placeholder:text-sm placeholder:tracking-[1px]`}
            />
          </div>

          {verifyState.error && (
            <div role="alert" className={errorClasses}>
              <p className="text-sm text-danger">{verifyState.error}</p>
            </div>
          )}

          <button type="submit" disabled={verifying} className={buttonClasses}>
            {verifying ? "Verifying…" : "Verify & Enter"}
          </button>
        </form>

        <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className={`inline-flex items-center gap-1.5 ${linkClasses}`}
          >
            <ArrowLeft className="h-3 w-3" />
            Start over
          </button>

          <form action={sendCode}>
            <input type="hidden" name="email" value={codeEmail} />
            {carriedNext && <input type="hidden" name="next" value={carriedNext} />}
            <button type="submit" disabled={sendingCode} className={linkClasses}>
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
        {next && <input type="hidden" name="next" value={next} />}

        <div>
          <label htmlFor="admin-email-code" className={labelClasses}>
            Admin Email <span className="text-white">*</span>
          </label>
          <input
            id="admin-email-code"
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@dsohire.com"
            defaultValue={emailState.email ?? passwordState.email ?? ""}
            className={inputClasses}
          />
        </div>

        {emailState.error && (
          <div role="alert" className={errorClasses}>
            <p className="text-sm text-danger">{emailState.error}</p>
          </div>
        )}

        <button type="submit" disabled={sendingCode} className={buttonClasses}>
          {sendingCode ? "Sending Code…" : "Send Sign-In Code"}
          {!sendingCode && <Mail className="h-4 w-4" />}
        </button>

        <div className="pt-2 text-center">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={linkClasses}
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
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label htmlFor="admin-email-pw" className={labelClasses}>
          Admin Email <span className="text-white">*</span>
        </label>
        <input
          id="admin-email-pw"
          type="email"
          name="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@dsohire.com"
          defaultValue={passwordState.email ?? ""}
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="admin-password" className={labelClasses}>
          Password <span className="text-white">*</span>
        </label>
        <PasswordInput
          id="admin-password"
          name="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          className={inputClasses}
        />
      </div>

      {passwordState.error && (
        <div role="alert" className={errorClasses}>
          <p className="text-sm text-danger">{passwordState.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={signingInPassword}
        className={buttonClasses}
      >
        {signingInPassword ? "Signing In…" : "Enter Admin"}
        {!signingInPassword && <ShieldCheck className="h-4 w-4" />}
      </button>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => setMode("code")}
          className={linkClasses}
        >
          No password? Email me a sign-in code →
        </button>
      </div>
    </form>
  );
}
