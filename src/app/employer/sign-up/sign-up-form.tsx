"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Lightbulb } from "lucide-react";
import { LocationAutocompleteField } from "@/components/ui/location-autocomplete-input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  signUpEmployer,
  verifySignUpEmployer,
  resendSignUpCode,
  type SignUpState,
} from "./actions";
import {
  PRICING_TIERS,
  type PricingTier,
  type BillingPeriod,
} from "@/lib/stripe/prices";

const initialForm: SignUpState = { ok: false, step: "form" };
const initialVerify: SignUpState = { ok: false, step: "verify" };
const initialResend: SignUpState = { ok: false, step: "verify" };

export function SignUpForm({
  initialTier,
  initialPeriod,
  authedEmail,
}: {
  initialTier: PricingTier;
  initialPeriod: BillingPeriod;
  /** Set when the visitor is signed in without a DSO — the form then skips
   *  account creation and creates the DSO under the existing session. */
  authedEmail?: string | null;
}) {
  const router = useRouter();

  // Tier nudge (2026-07-15): the form defaults to Solo when no ?tier= param
  // is present, so a large group could buy the wrong tier without noticing.
  // As soon as they type a practice count we SUGGEST the fitting tier — a
  // one-click switch, never an auto-change (tier stays consumer-chosen).
  const [practiceCount, setPracticeCount] = useState<number | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const suggestedTier =
    practiceCount != null && practiceCount >= 1
      ? suggestTierForPracticeCount(practiceCount)
      : null;
  const showTierNudge =
    suggestedTier !== null && suggestedTier !== initialTier && !nudgeDismissed;

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
          <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5">
            Account created
          </div>
          <p className="text-sm text-ink leading-relaxed">
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
              className="block text-2xs font-bold tracking-[2px] uppercase text-slate-body mb-2"
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
              maxLength={10}
              pattern="[0-9 ]{6,16}"
              placeholder="Enter code from email"
              className="w-full px-4 py-4 bg-cream border border-[var(--rule-strong)] text-ink text-[22px] font-bold tracking-[6px] text-center placeholder:text-slate-meta placeholder:font-medium placeholder:text-sm placeholder:tracking-[1px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
            />
          </div>

          {verifyState.error && (
            <div role="alert" className="bg-danger-bg border-l-4 border-danger p-4">
              <p className="text-sm text-danger">{verifyState.error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={verifying}
            className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-primary text-primary-foreground text-xs font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {verifying ? "Verifying…" : "Verify & Continue"}
            {!verifying && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="text-xs text-slate-meta leading-relaxed">
            After verifying you&apos;ll land on your onboarding page where you
            can add locations, invite teammates, and post your first job.
          </p>
        </form>

        <div className="pt-4 border-t border-[var(--rule)] flex items-center justify-between gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to form
          </button>

          <form action={resend}>
            <input type="hidden" name="email" value={email} />
            <button
              type="submit"
              disabled={resending}
              className="text-xs font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2 disabled:opacity-60"
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
      <input type="hidden" name="period" value={initialPeriod} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="First name"
          name="first_name"
          autoComplete="given-name"
          placeholder="First name"
          required
        />
        <Field
          label="Last name"
          name="last_name"
          autoComplete="family-name"
          placeholder="Last name"
          required
        />
      </div>
      {authedEmail ? (
        <div className="border-l-4 border-heritage bg-cream p-4">
          <p className="text-sm text-ink leading-relaxed">
            You&apos;re signed in as{" "}
            <span className="font-semibold">{authedEmail}</span> — this DSO
            will be created under that account.{" "}
            <a
              href="/employer/sign-out"
              className="text-heritage underline underline-offset-2 hover:text-heritage-deep"
            >
              Use a different email
            </a>
          </p>
        </div>
      ) : (
        <>
          <Field
            label="Work email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@yourdso.com"
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
        </>
      )}

      <div className="pt-2 border-t border-[var(--rule)]" />

      <Field
        label="DSO name"
        name="dso_name"
        autoComplete="organization"
        placeholder="Lakeshore Dental Group"
        required
        helper="Used as the public name and to generate your dsohire.com URL slug. You can edit either later."
      />

      <div>
        <label className="block text-2xs font-bold tracking-[2px] uppercase text-slate-body mb-2">
          Headquarters city &amp; state <span className="text-heritage">*</span>
        </label>
        <LocationAutocompleteField
          cityName="headquarters_city"
          stateName="headquarters_state"
          placeholder="Start typing a city…"
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
        onChange={(e) => {
          const n = parseInt(e.currentTarget.value, 10);
          setPracticeCount(Number.isNaN(n) ? null : n);
          setNudgeDismissed(false);
        }}
      />

      {showTierNudge && suggestedTier && (
        <div
          role="status"
          className="border-l-4 border-heritage bg-cream p-4"
        >
          <p className="text-sm text-ink leading-relaxed mb-3 flex items-start gap-2">
            <Lightbulb className="h-4 w-4 text-heritage flex-shrink-0 mt-0.5" aria-hidden />
            <span>
              For a group of {practiceCount} location
              {practiceCount === 1 ? "" : "s"},{" "}
              <span className="font-semibold">
                {PRICING_TIERS[suggestedTier].name}
              </span>{" "}
              is usually the right fit —{" "}
              {PRICING_TIERS[suggestedTier].features[0].toLowerCase()}. You&apos;re
              currently signing up for {PRICING_TIERS[initialTier].name}.
            </span>
          </p>
          <div className="flex items-center gap-4 flex-wrap pl-6">
            <button
              type="button"
              onClick={() =>
                router.replace(
                  `/employer/sign-up?tier=${suggestedTier}&period=${initialPeriod}`,
                  { scroll: false }
                )
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-2xs font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors"
            >
              Switch to {PRICING_TIERS[suggestedTier].name}
            </button>
            <button
              type="button"
              onClick={() => setNudgeDismissed(true)}
              className="text-xs font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
            >
              Keep {PRICING_TIERS[initialTier].name}
            </button>
          </div>
        </div>
      )}

      {formState.error && (
        <div role="alert" className="bg-danger-bg border-l-4 border-danger p-4">
          <p className="text-sm text-danger">{formState.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submittingForm}
        className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-primary text-primary-foreground text-xs font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {submittingForm
          ? authedEmail
            ? "Creating DSO…"
            : "Creating Account…"
          : authedEmail
            ? "Create DSO & Continue"
            : "Create Account & Send Code"}
        {!submittingForm && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="text-xs text-slate-meta leading-relaxed">
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

/**
 * Suggest the fitting tier from a practice-location count. Boundaries come
 * from the tier definitions themselves: Solo is pitched at 2–5 locations,
 * Enterprise's tagline is "35+ practices", Growth/Scale split the middle
 * along their openings/seats capacity. A nudge only — never auto-applied.
 */
function suggestTierForPracticeCount(count: number): PricingTier {
  if (count <= 5) return "solo";
  if (count <= 20) return "growth";
  if (count < 35) return "scale";
  return "enterprise";
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
  onChange,
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
  onChange?: (e: { currentTarget: { value: string } }) => void;
}) {
  return (
    <div>
      <label
        htmlFor={`signup-${name}`}
        className="block text-2xs font-bold tracking-[2px] uppercase text-slate-body mb-2"
      >
        {label} {required && <span className="text-heritage">*</span>}
      </label>
      {type === "password" ? (
        <PasswordInput
          id={`signup-${name}`}
          name={name}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          maxLength={maxLength}
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-sm placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      ) : (
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
          onChange={onChange}
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-sm placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      )}
      {helper && (
        <p className="mt-1.5 text-xs text-slate-meta leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  );
}
