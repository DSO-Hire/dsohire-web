"use client";

/**
 * Root error boundary — any uncaught render/data error below the root
 * layout lands here instead of Next's stock gray screen.
 *
 * Art direction mirrors not-found.tsx (the house 404 is the quality bar):
 * hairline blueprint grid + heritage glow, calm confident copy, square
 * geometry. Client component (Next requirement), so no SiteShell — the
 * section is self-sufficient and full-bleed.
 */

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Home, RotateCcw } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route-error]", error);
  }, [error]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-ivory px-6 pt-[140px] pb-24 sm:px-14">
      {/* Blueprint grid + heritage glow — same backdrop language as the 404 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(var(--rule) 1px, transparent 1px), linear-gradient(90deg, var(--rule) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage:
            "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 72%)",
          WebkitMaskImage:
            "radial-gradient(ellipse at 50% 30%, #000 0%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[18%] left-1/2 h-[60vw] w-[60vw] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(circle, var(--heritage-glow), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-[820px] text-center">
        <div className="mb-4 text-2xs font-bold uppercase tracking-[3.5px] text-heritage-deep">
          Something went wrong
        </div>
        <h1 className="mb-5 text-5xl font-extrabold leading-[1.02] tracking-[-0.025em] text-ink sm:text-6xl">
          We dropped the handpiece.
        </h1>
        <p className="mx-auto mb-10 max-w-[560px] text-lg leading-relaxed text-slate-body">
          An unexpected error interrupted this page — your data is safe.
          Trying again usually clears it
          {error.digest ? (
            <>
              ; if it doesn&apos;t, mention error{" "}
              <span className="tabular font-semibold text-ink">
                {error.digest}
              </span>{" "}
              when you contact us
            </>
          ) : (
            "; if it doesn't, we want to hear about it"
          )}
          .
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 bg-primary px-7 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 border border-[var(--rule-strong)] bg-card px-7 py-3 text-sm font-bold text-ink transition-colors hover:border-heritage"
          >
            Contact support
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-xs font-bold uppercase tracking-[1.8px]">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-slate-body transition-colors hover:text-ink"
          >
            <Home className="h-3.5 w-3.5" />
            Back home
          </Link>
          <Link
            href="/jobs"
            className="text-slate-body transition-colors hover:text-ink"
          >
            Browse Jobs
          </Link>
        </div>
      </div>
    </main>
  );
}
