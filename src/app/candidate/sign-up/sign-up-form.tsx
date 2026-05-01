"use client";

import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { signUpCandidate, type CandidateSignUpState } from "./actions";

const initial: CandidateSignUpState = { ok: false };

export function CandidateSignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUpCandidate, initial);

  if (state.ok && state.message) {
    return (
      <div className="border-l-4 border-heritage bg-cream p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Account created
        </div>
        <p className="text-[15px] text-ink leading-relaxed mb-3">
          {state.message}
        </p>
        <p className="text-[13px] text-slate-body leading-relaxed">
          The link expires in 15 minutes. After verifying, you&apos;ll land
          {next && next.startsWith("/jobs/")
            ? " back on the job you were applying to."
            : " on your candidate dashboard."}
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
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
        helper="We'll send a one-time sign-in link. No password needed."
      />

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[13px] text-red-900">{state.error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2.5 w-full px-9 py-4 bg-ink text-ivory text-[11px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Creating Account…" : "Create Account & Send Link"}
        {!pending && <ArrowRight className="h-4 w-4" />}
      </button>

      <p className="text-[12px] text-slate-meta leading-relaxed">
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
        <p className="mt-1.5 text-[11px] text-slate-meta leading-relaxed">
          {helper}
        </p>
      )}
    </div>
  );
}
