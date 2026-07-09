"use client";

/**
 * RouteErrorPanel — shared body for the in-shell error boundaries
 * (employer/(app) + candidate/(app)). The shell (rail, top bar) survives
 * a route error, so this renders as a calm panel in the content area
 * rather than a full-bleed page. Same voice as the root boundary: plain,
 * confident, next-action-first — no "Oops!".
 */

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, RotateCcw } from "lucide-react";

export function RouteErrorPanel({
  error,
  reset,
  dashboardHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Where "Go to dashboard" points — differs per shell. */
  dashboardHref: string;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <section className="mx-auto flex min-h-[60vh] max-w-[560px] flex-col items-center justify-center px-6 text-center">
      <div className="mb-3 text-2xs font-bold uppercase tracking-[2.5px] text-heritage-deep">
        Something went wrong
      </div>
      <h2 className="mb-3 text-2xl font-extrabold leading-[1.15] tracking-[-0.6px] text-ink sm:text-3xl">
        This page hit an unexpected error.
      </h2>
      <p className="mb-7 text-sm leading-relaxed text-slate-body">
        Your data is safe — nothing was lost. Trying again usually clears
        it
        {error.digest ? (
          <>
            ; if it keeps happening, mention error{" "}
            <span className="tabular font-semibold text-ink">
              {error.digest}
            </span>{" "}
            to support
          </>
        ) : (
          "; if it keeps happening, let support know"
        )}
        .
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" />
          Try again
        </button>
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-2 border border-[var(--rule-strong)] bg-card px-6 py-2.5 text-sm font-bold text-ink transition-colors hover:border-heritage"
        >
          Go to dashboard
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
