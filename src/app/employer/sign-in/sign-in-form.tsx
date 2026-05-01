"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { signInEmployer, type SignInState } from "./actions";

const initial: SignInState = { ok: false };

export function SignInForm() {
  const [state, action, pending] = useActionState(signInEmployer, initial);

  if (state.ok && state.message) {
    return (
      <div className="border-l-4 border-heritage bg-cream p-6">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Check your inbox
        </div>
        <p className="text-[15px] text-ink leading-relaxed mb-3">
          {state.message}
        </p>
        <p className="text-[13px] text-slate-body leading-relaxed">
          Didn&apos;t arrive?{" "}
          <button
            onClick={() => window.location.reload()}
            className="text-heritage font-semibold underline underline-offset-2 hover:text-heritage-deep"
          >
            Send another link
          </button>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
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
          className="w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-[15px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      </div>

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
        {pending ? "Sending Link…" : "Send Sign-In Link"}
        {!pending && <Mail className="h-4 w-4" />}
      </button>

      <p className="text-[12px] text-slate-meta leading-relaxed">
        We&apos;ll send a one-time sign-in link to your email. No password to
        remember. Read our{" "}
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
