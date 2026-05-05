"use client";

/**
 * Phase 5D — Rejection-reason AI suggester surface.
 *
 * Reused inside both the single-reject confirmation dialog (StageSelector)
 * and the bulk-reject dialog when the recruiter has selected exactly one
 * candidate. Calls `suggestRejectionReason` and renders 2-3 selectable
 * draft cards. "Use this" pipes the body back up via `onApply` so the host
 * dialog can populate its reason textarea.
 *
 * Keeps the same heritage tint + sparkles iconography as the JD generator
 * panel so the AI surface reads consistently across the product.
 *
 * Tier gate: when `available` is false, the panel renders a ghost upgrade
 * state instead of the action button. The server action also enforces the
 * gate; this is just a UX courtesy so paying tiers don't see a button that
 * fails.
 *
 * Disabled state: when `hasContext` is false (no screening answers AND no
 * submitted scorecards), the button is disabled with helper copy. Without
 * any signal the model is just paraphrasing the JD, which isn't useful.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, RefreshCcw, Check, AlertCircle } from "lucide-react";
import {
  suggestRejectionReason,
  type RejectionSuggestion,
} from "./rejection-reason-action";

export interface RejectReasonAiSuggesterProps {
  applicationId: string;
  /** Whether the DSO's tier permits the suggester (Growth or Enterprise). */
  available: boolean;
  /** Whether the application has ≥1 screening answer or submitted scorecard. */
  hasContext: boolean;
  /** Called when the recruiter picks a suggestion — host populates its textarea. */
  onApply: (body: string) => void;
}

export function RejectReasonAiSuggester({
  applicationId,
  available,
  hasContext,
  onApply,
}: RejectReasonAiSuggesterProps) {
  const [pending, startTransition] = useTransition();
  const [suggestions, setSuggestions] = useState<RejectionSuggestion[] | null>(
    null
  );
  const [usage, setUsage] = useState<{
    cost_usd: number;
    elapsed_ms: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appliedIndex, setAppliedIndex] = useState<number | null>(null);

  if (!available) {
    return (
      <section
        aria-label="AI rejection-reason suggester"
        className="border border-heritage/30 bg-heritage/[0.04] p-4"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center bg-heritage/10 text-heritage-deep flex-shrink-0">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
              AI rejection-reason suggester
            </div>
            <p className="mt-1 text-[12px] text-slate-meta leading-relaxed">
              Available on Growth tier and above.{" "}
              <Link
                href="/pricing"
                className="text-heritage-deep underline-offset-2 hover:underline font-semibold"
              >
                Upgrade
              </Link>{" "}
              to draft fair, role-relevant rejection reasons in seconds.
            </p>
          </div>
        </div>
      </section>
    );
  }

  function run() {
    setError(null);
    setAppliedIndex(null);
    const startedAt = Date.now();
    startTransition(async () => {
      const res = await suggestRejectionReason(applicationId);
      const elapsed = Date.now() - startedAt;
      if (!res.ok) {
        setError(res.error);
        setSuggestions(null);
        setUsage(null);
        return;
      }
      setSuggestions(res.suggestions);
      setUsage({ cost_usd: res.usage.cost_usd, elapsed_ms: elapsed });
    });
  }

  const disabled = !hasContext || pending;

  return (
    <section
      aria-label="AI rejection-reason suggester"
      className="border border-heritage/40 bg-heritage/[0.04] p-4"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center bg-heritage/15 text-heritage-deep flex-shrink-0">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep">
            Suggest with AI
          </div>
          <p className="mt-0.5 text-[12px] text-slate-meta leading-relaxed">
            Get 2-3 draft rejection reasons based on this candidate&apos;s
            screening answers and scorecards.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={run}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <Spinner />
              Generating…
            </>
          ) : suggestions ? (
            <>
              <RefreshCcw className="h-3 w-3" aria-hidden="true" />
              Regenerate
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Generate suggestions
            </>
          )}
        </button>
        {!hasContext && !suggestions && (
          <span className="text-[11px] text-slate-meta">
            Need at least one screening answer or scorecard.
          </span>
        )}
        {usage && !pending && (
          <span className="text-[10px] text-slate-meta tracking-[0.5px]">
            Generated in {(usage.elapsed_ms / 1000).toFixed(1)}s · ~$
            {usage.cost_usd.toFixed(4)}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start justify-between gap-3 border-l-4 border-red-500 bg-red-50 p-3">
          <div className="flex items-start gap-2 text-[12px] text-red-900 leading-relaxed">
            <AlertCircle
              className="h-3.5 w-3.5 mt-0.5 flex-shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="text-[10px] font-bold tracking-[1.5px] uppercase text-red-900 hover:text-red-700 transition-colors flex-shrink-0"
          >
            Try again
          </button>
        </div>
      )}

      {suggestions && !pending && (
        <ul className="mt-3 grid gap-2">
          {suggestions.map((s, i) => {
            const isApplied = appliedIndex === i;
            return (
              <li
                key={i}
                className={`border bg-white p-3 transition-colors ${
                  isApplied
                    ? "border-heritage ring-1 ring-inset ring-heritage/40"
                    : "border-[var(--rule-strong)]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center px-2 py-0.5 bg-heritage/10 text-heritage-deep text-[10px] font-bold tracking-[1.5px] uppercase">
                    {s.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onApply(s.body);
                      setAppliedIndex(i);
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink transition-colors flex-shrink-0"
                  >
                    {isApplied ? (
                      <>
                        <Check className="h-3 w-3" aria-hidden="true" />
                        Applied
                      </>
                    ) : (
                      <>Use this</>
                    )}
                  </button>
                </div>
                <p className="mt-2 text-[13px] text-ink leading-relaxed whitespace-pre-wrap">
                  {s.body}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin"
    />
  );
}
