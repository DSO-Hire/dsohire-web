"use client";

/**
 * ThemeToggle — Light / Dark, persisted to localStorage('dso-theme').
 *
 * The no-flash inline script in the root layout owns the FIRST paint (reads the
 * same key before hydration); this control only toggles thereafter. Light is
 * the hard default — dark applies only when explicitly chosen. Styled with
 * currentColor so it sits correctly on any surface — the light marketing
 * header OR the navy rails. Square corners to match the brand (--radius: 0).
 */

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Choice = "light" | "dark";

const STORAGE_KEY = "dso-theme";

/** Apply a choice to <html> immediately (mirrors the no-flash script's logic). */
function applyChoice(choice: Choice) {
  document.documentElement.classList.toggle("dark", choice === "dark");
}

const OPTIONS: ReadonlyArray<{ key: Choice; label: string; Icon: typeof Sun }> = [
  { key: "light", label: "Light", Icon: Sun },
  { key: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle({ className = "" }: { className?: string }) {
  // null until mounted — keeps server + first client render identical (the
  // no-flash script already set the class on <html>), so no hydration mismatch.
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    // A stale 'system' (or anything else) resolves to light — no migration.
    setChoice(stored === "dark" || stored === "light" ? stored : "light");
  }, []);

  function pick(next: Choice) {
    localStorage.setItem(STORAGE_KEY, next);
    setChoice(next);
    applyChoice(next);
  }

  return (
    <div
      role="group"
      aria-label="Theme"
      className={`inline-flex items-center border border-current/20 ${className}`}
    >
      {OPTIONS.map(({ key, label, Icon }) => {
        const active = choice === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            aria-label={`${label} theme`}
            aria-pressed={active}
            title={label}
            className={`inline-flex items-center justify-center p-1.5 transition-opacity ${
              active ? "opacity-100 shadow-[inset_0_-2px_0_0_var(--heritage-bright)]" : "opacity-50 hover:opacity-100"
            }`}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
