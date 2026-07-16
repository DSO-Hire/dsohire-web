"use client";

import { useActionState } from "react";
import { PasswordInput } from "@/components/ui/password-input";
import { setAdminPassword, type SetPasswordState } from "./actions";

const initial: SetPasswordState = { ok: false };

const inputClasses =
  "w-full px-4 py-3.5 bg-cream border border-[var(--rule-strong)] text-ink text-sm placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors";
const labelClasses =
  "block text-2xs font-bold tracking-[2px] uppercase text-slate-body mb-2";

export function SetPasswordForm() {
  const [state, action, pending] = useActionState(setAdminPassword, initial);

  return (
    <form action={action} className="space-y-5 max-w-md">
      <div>
        <label htmlFor="admin-new-password" className={labelClasses}>
          New Password <span className="text-heritage">*</span>
        </label>
        <PasswordInput
          id="admin-new-password"
          name="password"
          required
          autoComplete="new-password"
          placeholder="At least 12 characters"
          className={inputClasses}
        />
      </div>

      <div>
        <label htmlFor="admin-confirm-password" className={labelClasses}>
          Confirm New Password <span className="text-heritage">*</span>
        </label>
        <PasswordInput
          id="admin-confirm-password"
          name="confirm"
          required
          autoComplete="new-password"
          placeholder="Same password again"
          className={inputClasses}
        />
      </div>

      {state.error && (
        <div role="alert" className="bg-danger-bg border-l-4 border-danger p-4">
          <p className="text-sm text-danger">{state.error}</p>
        </div>
      )}
      {state.ok && state.message && (
        <div role="status" className="bg-cream border-l-4 border-heritage p-4">
          <p className="text-sm text-ink">{state.message}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2.5 px-9 py-4 bg-primary text-primary-foreground text-xs font-bold tracking-[2px] uppercase hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? "Updating…" : "Update Password"}
      </button>
    </form>
  );
}
