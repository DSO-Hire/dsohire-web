"use client";

import { useActionState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import {
  signUpCandidate,
  verifySignUpCandidate,
  resendCandidateSignUpCode,
  type CandidateSignUpState,
} from "./actions";

const initialForm: CandidateSignUpState = { ok: false, step: "form" };
const initialVerify: CandidateSignUpState = { ok: false, step: "verify" };
const initialResend: CandidateSignUpState = { ok: false, step: "verify" };

export function CandidateSignUpForm({ next }: { next?: string }) {
  const [formState, submitForm, submittingForm] = useActionState(
    signUpCandidate,
    initialForm
  );
  const [verifyState, verify, verifying] = useActionState(
    verifySignUpCandidate,
    initialVerify
  );
  const [resendState, resend, resending] = useActionState(
    resendCandidateSignUpCode,
    initialResend
  );

  const showVerify = formState.ok && formState.step === "verify" && formState.email;
  const email = formState.email ?? verifyState.email ?? resendState.email;
  const carriedNext =
    formState.next ?? verifyState.next ?? resendState.next ?? next;

  if (showVerify && email) {
    return (
      <div className="space-y-5">
        <div className="border-l-4 border-heritage bg-cream p-5">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
            Account created
          </div>
          <p className="text-[14px] text-ink leading-relaxed">
            {resendState.ok && resendState.message
              ? resendState.message
              : formState.message}
          </p>
        </div>

        <form action={verify} className="space-y-4">
          <input type="hidden" name="email" value={email} />
          {carriedNext && <input type="hidden" name="next" value={carriedNext} />}

          <div>
            <label
              htmlFor="csignup-otp"
              className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
            >
              6-Digit Code <span className="text-heritage">*</span>
            </label>
            <input
              id="csignup-otp"
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
            {verifying ? "Verifying…" : "Verify & Continue"}
            {!verifying && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="text-[13px] text-slate-meta leading-relaxed">
            After verifying you&apos;ll land
            {carriedNext && carriedNext.startsWith("/jobs/")
              ? " back on the job you were applying to."
              : " on your candidate dashboard."}
          </p>
        </form>

        <div className="pt-4 border-t border-[var(--rule)] flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to form
          </button>

          <form action={resend}>
            <input type="hidden" name="email" value={email} />
            {carriedNext && <input type="hidden" name="next" value={carriedNext} />}
            <button
              type="submit"
              disabled={resending}
              className="text-[13px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2 disabled:opacity-60"
            >
              {resending ? "Sending…" : "Send a new code"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form action={submitForm} className="space-y-5">
      <div className="hidden" aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {next && <input type="hidden" name="next" value={next} />}

      <Field
        label="Your full name"
        name="full_name"
        autoComplete="name"
        placeholder="Jordan Rivera"
        required
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@email.com"
        required
      />
      <Field
        label="Password (optional)"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        helper="Set a password if you'd like to sign in without an emailed code each time. You can set or change this anytime in Settings."
      />

      {formState.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{formState.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submittingForm}
        className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submittingForm ? "Creating Account…" : "Create Account & Send Code"}
        {!submittingForm && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="text-[13px] text-slate-meta leading-relaxed">
        By continuing you agree to our{" "}
        <a
          href="/legal/candidate-terms"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          Candidate Terms
        </a>{" "}
        and{" "}
        <a
          href="/legal/privacy"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          Privacy Policy
        </a>
        . Always free for job seekers.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
  placeholder,
  helper,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <div>
      <label
        htmlFor={`csignup-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <input
        id={`csignup-${name}`}
        type={type}
        name={name}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
      />
      {helper && (
        <p className="mt-1.5 text-[12px] text-slate-meta leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  );
}
