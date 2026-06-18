"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { updatePassword, type PasswordState } from "./actions";

const initial: PasswordState = { ok: false };

export function PasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);

  return (
    <form action={action} className="space-y-5 max-w-[480px]">
      <div>
        <label
          htmlFor="settings-password"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          New Password <span className="text-heritage">*</span>
        </label>
        <input
          id="settings-password"
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="At least 8 characters"
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      </div>

      <div>
        <label
          htmlFor="settings-confirm"
          className="block text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2"
        >
          Confirm New Password <span className="text-heritage">*</span>
        </label>
        <input
          id="settings-confirm"
          type="password"
          name="confirm"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Type it again"
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors"
        />
      </div>

      {state.error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <p className="text-[14px] text-red-900">{state.error}</p>
        </div>
      )}
      {state.ok && state.message && (
        <div className="bg-emerald-50 border-l-4 border-heritage p-4">
          <p className="text-[14px] text-heritage-deep font-semibold">{state.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2.5 px-7 py-3 bg-ink text-ivory text-[12px] font-bold tracking-[2px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <KeyRound className="h-4 w-4" />
        {pending ? "Saving…" : "Update Password"}
      </button>
    </form>
  );
}
