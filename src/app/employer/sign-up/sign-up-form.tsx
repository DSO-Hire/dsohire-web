"use client";

import { useActionState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import {
  signUpEmployer,
  verifySignUpEmployer,
  resendSignUpCode,
  type SignUpState,
} from "./actions";
import type { PricingTier } from "@/lib/stripe/prices";

const initialForm: SignUpState = { ok: false, step: "form" };
const initialVerify: SignUpState = { ok: false, step: "verify" };
const initialResend: SignUpState = { ok: false, step: "verify" };

export function SignUpForm({ initialTier }: { initialTier: PricingTier }) {
  const [formState, submitForm, submittingForm] = useActionState(
    signUpEmployer,
    initialForm
  );
  const [verifyState, verify, verifying] = useActionState(
    verifySignUpEmployer,
    initialVerify
  );
  const [resendState, resend, resending] = useActionState(
    resendSignUpCode,
    initialResend
  );

  const showVerify = formState.ok && formState.step === "verify" && formState.email;
  const email = formState.email ?? verifyState.email ?? resendState.email;

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

          <div>
            <label
              htmlFor="signup-otp"
              className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
            >
              6-Digit Code <span className="text-heritage">*</span>
            </label>
            <input
              id="signup-otp"
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
            {verifying ? "Verifying…" : "Verify & Continue"}
            {!verifying && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="text-[12px] text-slate-meta leading-relaxed">
            After verifying you&apos;ll land on your onboarding page where you
            can add locations, invite teammates, and post your first job.
          </p>
        </form>

        <div className="pt-4 border-t border-[var(--rule)] flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to form
          </button>

          <form action={resend}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={resending}
              className="text-[12px] font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2 disabled:opacity-60"
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
      <input type="hidden" name="tier" value={initialTier} />

      <Field
        label="Your full name"
        name="full_name"
        autoComplete="name"
        placeholder="Cameron Eslinger"
        required
      />
      <Field
        label="Work email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@yourdso.com"
        required
      />

      <div className="pt-2 border-t border-[var(--rule)]" />

      <Field
        label="DSO name"
        name="dso_name"
        autoComplete="organization"
        placeholder="SmileBright Dental DSO"
        required
        helper="Used as the public name and to generate your dsohire.com URL slug. You can edit either later."
      />

      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-4">
        <Field
          label="Headquarters city"
          name="headquarters_city"
          autoComplete="address-level2"
          placeholder="Kansas City"
        />
        <Field
          label="State"
          name="headquarters_state"
          autoComplete="address-level1"
          placeholder="KS"
          maxLength={2}
          required
        />
      </div>

      <Field
        label="Number of practice locations"
        name="practice_count"
        type="number"
        min={1}
        max={500}
        placeholder="12"
        required
        helper="Approximate is fine — used to suggest the right tier and validate later."
      />

      {formState.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[13px] text-red-900">{formState.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submittingForm}
        className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submittingForm ? "Creating Account…" : "Create Account & Send Code"}
        {!submittingForm && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="text-[12px] text-slate-meta leading-relaxed">
        By continuing you agree to our{" "}
        <a
          href="/legal/terms"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          Terms
        </a>{" "}
        and{" "}
        <a
          href="/legal/privacy"
          className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
        >
          Privacy Policy
        </a>
        . You won&apos;t be charged until you complete payment setup after
        verification.
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
  min,
  max,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
  helper?: string;
  min?: number;
  max?: number;
  maxLength?: number;
}) {
  return (
    <div>
      <label
        htmlFor={`signup-${name}`}
        className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      <input
        id={`signup-${name}`}
        type={type}
        name={name}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        min={min}
        max={max}
        maxLength={maxLength}
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
      />
      {helper && (
        <p className="mt-1.5 text-[11px] text-slate-meta leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  );
}
