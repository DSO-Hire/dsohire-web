"use client";

/**
 * OnboardingChecklist — a dismissible "get set up" card for the candidate +
 * employer dashboards. Progressive onboarding (the LinkedIn/Greenhouse
 * pattern): a short list of high-value setup steps the user can knock out
 * over their first sessions, never a blocking wizard. Auto-hides when every
 * item is done; manual dismiss persists in localStorage.
 *
 * `done` states are computed server-side from real data and passed in, so
 * each item reflects actual progress + links straight to where to do it.
 */

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X, ChevronRight, Rocket } from "lucide-react";
import Link from "next/link";

export interface OnboardingItem {
  key: string;
  label: string;
  done: boolean;
  href: string;
}

export function OnboardingChecklist({
  title,
  subtitle,
  items,
  storageKey,
}: {
  title: string;
  subtitle: string;
  items: OnboardingItem[];
  storageKey: string;
}) {
  // Start hidden until we've read localStorage to avoid a dismiss flash.
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(window.localStorage.getItem(storageKey) === "1");
    setReady(true);
  }, [storageKey]);

  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  if (!ready || dismissed || allDone) return null;

  function dismiss() {
    window.localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }

  return (
    <section className="rounded-lg border border-heritage/30 bg-gradient-to-br from-heritage/[0.08] via-[#F7F4ED] to-white dark:via-card dark:to-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-heritage text-primary-foreground">
            <Rocket className="size-[18px]" aria-hidden />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded p-1 text-meta-foreground hover:bg-black/5 hover:text-foreground"
          aria-label="Dismiss setup checklist"
        >
          <X className="size-4" />
        </button>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-heritage">
        {doneCount} of {items.length} done
      </p>

      <ul className="mt-2 divide-y divide-heritage/10">
        {items.map((item) =>
          item.done ? (
            <li
              key={item.key}
              className="flex items-center gap-2 py-2.5 text-sm text-meta-foreground"
            >
              <CheckCircle2 className="size-4 shrink-0 text-heritage" />
              <span className="line-through">{item.label}</span>
            </li>
          ) : (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group flex items-center justify-between gap-3 py-2.5 text-sm text-foreground hover:text-foreground"
              >
                <span className="flex items-center gap-2">
                  <Circle className="size-4 shrink-0 text-meta-foreground group-hover:text-heritage" />
                  {item.label}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-heritage group-hover:text-foreground">
                  Do it
                  <ChevronRight className="size-3.5" />
                </span>
              </Link>
            </li>
          )
        )}
      </ul>
    </section>
  );
}
