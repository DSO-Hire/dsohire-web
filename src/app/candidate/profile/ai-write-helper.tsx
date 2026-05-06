"use client";

/**
 * <AiWriteHelper> — "Help me write" button + suggestions panel
 * for the Identity modal (Phase 4.2.d).
 *
 * Two flavors via the `kind` prop: "headline" or "summary". The
 * underlying server actions live in `./ai-write-actions.ts`. On
 * generate: shows a 3-7 sec loading state, then a panel of 3
 * suggestion cards below the input. Each card has a "Use this" button
 * that fires the parent's `onPick(text)` callback.
 *
 * Generate cost: ~$0.001 / call (Haiku 4.5). Free for all candidates;
 * no per-candidate cap. Usage logged via ai_usage_events.
 */

import { useState, useTransition } from "react";
import { Sparkles, Check, Loader2, RefreshCw } from "lucide-react";
import {
  generateHeadlineSuggestions,
  generateSummarySuggestions,
  type ProfileContext,
} from "./ai-write-actions";

interface AiWriteHelperProps {
  kind: "headline" | "summary";
  context: ProfileContext;
  /** Called when the user picks one of the suggestions. */
  onPick: (text: string) => void;
}

export function AiWriteHelper({ kind, context, onPick }: AiWriteHelperProps) {
  const [, startGenerate] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[] | null>(null);

  const generate = () => {
    setError(null);
    setBusy(true);
    startGenerate(async () => {
      const result =
        kind === "headline"
          ? await generateHeadlineSuggestions(context)
          : await generateSummarySuggestions(context);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuggestions(result.suggestions);
    });
  };

  return (
    <div className="mt-2 space-y-2">
      {!suggestions && !busy && (
        <button
          type="button"
          onClick={generate}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#4D7A60]/40 bg-[#F7F4ED] px-3 py-1.5 text-xs font-medium text-[#14233F] transition hover:border-[#4D7A60] hover:bg-[#F7F4ED]/70"
        >
          <Sparkles className="size-3.5 text-[#4D7A60]" />
          Help me write
        </button>
      )}

      {busy && (
        <div className="inline-flex items-center gap-2 rounded-md border border-[#4D7A60]/30 bg-[#F7F4ED]/60 px-3 py-1.5 text-xs text-slate-600">
          <Loader2 className="size-3.5 animate-spin text-[#4D7A60]" />
          {kind === "headline"
            ? "Drafting a few headline options…"
            : "Drafting a few summary options…"}
        </div>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}

      {suggestions && suggestions.length > 0 && (
        <div className="rounded-md border border-[#4D7A60]/25 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <p className="text-xs font-medium text-slate-700">
              {suggestions.length === 1
                ? "1 suggestion"
                : `${suggestions.length} suggestions`}
              <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-400">
                Pick one and edit
              </span>
            </p>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#4D7A60] hover:text-[#14233F] disabled:opacity-50"
            >
              <RefreshCw className="size-3" />
              Regenerate
            </button>
          </div>
          <ul className="divide-y divide-slate-100">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-3 p-3">
                <p className="flex-1 text-sm text-slate-700">{s}</p>
                <button
                  type="button"
                  onClick={() => {
                    onPick(s);
                    setSuggestions(null);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#14233F] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0d172b]"
                >
                  <Check className="size-3" />
                  Use this
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
