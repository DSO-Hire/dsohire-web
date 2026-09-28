"use client";

/**
 * LeadHandoff: the one-field ask.
 *
 * Borrowed from the EDC site's ToolHandoff: the hottest moment on a
 * marketing page is right after a visitor sees a number that matters to
 * them. Ask for ONE thing ("email or cell"), send the numbers they were
 * looking at along with it, and promise a specific, human reply.
 *
 * Used under the agency-cost calculator, as the Dental Hiring Report
 * signup, and as the job-alert capture on an empty job board. Every
 * submission lands in marketing_leads via captureLead (durable first,
 * notification second).
 */

import { useId, useState, useTransition } from "react";
import { ArrowRight, Check } from "lucide-react";
import { captureLead } from "@/lib/marketing/lead-actions";
import { readAttribution } from "@/lib/marketing/attribution";
import type { LeadKind } from "@/lib/marketing/leads";
import { cn } from "@/lib/utils";

export function LeadHandoff({
  kind,
  audience,
  context,
  label,
  placeholder = "Work email or cell",
  cta = "Send it",
  fine,
  success,
  tone = "light",
  className,
}: {
  kind: LeadKind;
  audience?: "dso" | "candidate";
  /** What the visitor is looking at right now (calculator inputs, filters). */
  context?: Record<string, string | number | boolean | null>;
  label: string;
  placeholder?: string;
  cta?: string;
  /** Small reassurance line under the field. */
  fine?: string;
  /** Replaces the form once saved. */
  success: string;
  tone?: "light" | "dark";
  className?: string;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [hp, setHp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const dark = tone === "dark";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const res = await captureLead({
          kind,
          audience,
          contact: value,
          context,
          website: hp,
          sourcePath: window.location.pathname + window.location.search,
          attribution: readAttribution(),
        });
        if (res.ok) setDone(true);
        else setError(res.error);
      } catch {
        setError("Network hiccup. Please try again.");
      }
    });
  }

  if (done) {
    return (
      <div
        role="status"
        className={cn(
          "lead-done flex items-start gap-3 border px-5 py-4",
          dark
            ? "border-heritage-bright/40 bg-heritage/15 text-ivory"
            : "border-heritage/40 bg-heritage/[0.07] text-ink",
          className
        )}
      >
        <span
          aria-hidden
          className="mt-0.5 grid size-5 shrink-0 place-items-center bg-heritage text-ivory"
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
        <p className="text-sm leading-relaxed">{success}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("w-full", className)} noValidate>
      <label
        htmlFor={id}
        className={cn(
          "block text-sm font-semibold mb-2.5",
          dark ? "text-ivory" : "text-ink"
        )}
      >
        {label}
      </label>
      <div
        className={cn(
          "flex flex-col sm:flex-row border transition-colors focus-within:border-heritage",
          dark
            ? "border-ivory/25 bg-ivory/[0.06]"
            : "border-[var(--rule-strong)] bg-card"
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="email"
          autoComplete="email"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : fine ? `${id}-fine` : undefined}
          className={cn(
            "min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm outline-none",
            dark
              ? "text-ivory placeholder:text-ivory/45"
              : "text-ink placeholder:text-slate-meta"
          )}
        />
        {/* Honeypot: off-screen, not display:none (some bots skip those). */}
        <input
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          name="website"
          className="absolute -left-[9999px] h-0 w-0 opacity-0"
        />
        <button
          type="submit"
          disabled={pending || value.trim().length < 3}
          className={cn(
            "btn-lift group inline-flex items-center justify-center gap-2 px-6 py-3.5 text-sm font-bold whitespace-nowrap transition-colors disabled:opacity-60",
            dark
              ? "bg-ivory text-ink hover:bg-ivory-deep"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
        >
          {pending ? "Saving…" : cta}
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </button>
      </div>
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-2 text-xs font-semibold text-danger">
          {error}
        </p>
      ) : fine ? (
        <p
          id={`${id}-fine`}
          className={cn("mt-2.5 text-xs", dark ? "text-ivory/55" : "text-slate-meta")}
        >
          {fine}
        </p>
      ) : null}
    </form>
  );
}
