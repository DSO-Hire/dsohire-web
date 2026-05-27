"use client";

/**
 * MFA challenge form. Single input that accepts either a 6-digit TOTP
 * code OR a recovery code (12 chars in `xxxx-xxxx-xxxx` format). The
 * server action figures out which one and dispatches accordingly.
 */

import { useActionState } from "react";
import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { submitChallenge, type ChallengeState } from "./actions";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/contact";

const initialState: ChallengeState = { ok: false };

export function ChallengeForm({ next }: { next: string | null }) {
  const [state, formAction, pending] = useActionState(
    submitChallenge,
    initialState
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />

      <div>
        <label
          htmlFor="mfa-code"
          className="mb-1.5 block text-[12px] font-semibold text-ink"
        >
          Code
        </label>
        <div className="relative">
          <KeyRound
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-meta"
            aria-hidden="true"
          />
          <input
            id="mfa-code"
            name="code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456 or xxxx-xxxx-xxxx"
            maxLength={20}
            className="w-full border border-[var(--rule-strong)] bg-white pl-9 pr-3 py-3 font-mono text-[16px] text-ink focus:border-heritage focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-[11px] text-slate-meta">
          6-digit authenticator code or a 12-character recovery code.
        </p>
      </div>

      {state.error && (
        <p
          role="alert"
          className="inline-flex items-start gap-1.5 text-[13px] text-red-700"
        >
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
          {state.error}
        </p>
      )}

      <label className="flex items-start gap-2.5 cursor-pointer text-[13px] text-slate-body">
        <input
          type="checkbox"
          name="trust_device"
          defaultChecked
          className="mt-0.5 size-4 rounded border-[var(--rule-strong)] text-heritage focus:ring-heritage"
        />
        <span className="leading-snug">
          <span className="font-semibold text-ink">Trust this device for 30 days.</span>{" "}
          <span className="text-slate-meta">
            Skip the code on this browser next time. Sensitive actions
            (billing, role changes, data export) still require it.
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 text-[12px] font-bold tracking-[1.5px] uppercase text-ivory hover:bg-ink-soft disabled:opacity-40"
      >
        {pending ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Verifying…
          </>
        ) : (
          "Continue"
        )}
      </button>

      <p className="pt-3 text-center text-[11px] text-slate-meta border-t border-[var(--rule)]">
        Locked out entirely?{" "}
        <a
          href={SUPPORT_MAILTO}
          className="font-semibold underline underline-offset-2 hover:text-ink"
          aria-label={`Email ${SUPPORT_EMAIL}`}
        >
          Email support
        </a>
        .
      </p>
    </form>
  );
}
