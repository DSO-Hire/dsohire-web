"use client";

/**
 * <RestoreForm> — restore-or-sign-out for the employer side (Phase 4.5.g).
 *
 * `canRestore` is gated by role at the page level; the form respects
 * the flag visually + the action enforces owner-only at the server.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, AlertCircle } from "lucide-react";
import { restoreOrg, signOutAndExit } from "./actions";

export function RestoreForm({ canRestore }: { canRestore: boolean }) {
  const router = useRouter();
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState<"restore" | "signout" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onRestore = () => {
    setError(null);
    setBusy("restore");
    startWork(async () => {
      const result = await restoreOrg();
      if (!result.ok) {
        setBusy(null);
        setError(result.error);
        return;
      }
      router.push("/employer/dashboard");
      router.refresh();
    });
  };

  const onSignOut = () => {
    setError(null);
    setBusy("signout");
    startWork(async () => {
      await signOutAndExit();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {canRestore && (
        <button
          type="button"
          onClick={onRestore}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {busy === "restore" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Restoring…
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Restore organization
            </>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onSignOut}
        disabled={busy !== null}
        className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-60"
      >
        {busy === "signout" ? "Signing out…" : "Sign me out"}
      </button>
      {error && (
        <p
          role="alert"
          className="inline-flex items-center gap-1 text-sm text-danger"
        >
          <AlertCircle className="size-3.5" />
          {error}
        </p>
      )}
    </div>
  );
}
