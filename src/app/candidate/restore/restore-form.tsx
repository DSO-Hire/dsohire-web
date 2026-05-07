"use client";

/**
 * <RestoreForm> — two-button restore vs confirm-and-sign-out.
 *
 * Sits inside /candidate/restore (server component). Calls
 * restoreAccount() server action; on success, routes to the candidate
 * dashboard. The "confirm and sign out" path calls signOutAndExit()
 * which redirects to /candidate/sign-in itself.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { restoreAccount, signOutAndExit } from "./actions";

export function RestoreForm() {
  const router = useRouter();
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState<"restore" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRestore = () => {
    setError(null);
    setBusy("restore");
    startWork(async () => {
      const result = await restoreAccount();
      if (!result.ok) {
        setBusy(null);
        setError(result.error);
        return;
      }
      router.push("/candidate/dashboard");
      router.refresh();
    });
  };

  const onSignOut = () => {
    setError(null);
    setBusy("signout");
    startWork(async () => {
      await signOutAndExit();
      // signOutAndExit redirects; this line is unreachable.
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onRestore}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-ivory hover:bg-ink-soft disabled:opacity-60"
      >
        {busy === "restore" ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Restoring…
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Restore my account
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onSignOut}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy === "signout" ? "Signing out…" : "No, sign me out"}
      </button>
      {error && (
        <p
          role="alert"
          className="inline-flex items-center gap-1 text-sm text-red-700"
        >
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
