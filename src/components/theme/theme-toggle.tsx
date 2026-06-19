"use client";

/**
 * ThemeToggle — Light / Dark / System, persisted to localStorage('dso-theme').
 *
 * The no-flash inline script in the root layout owns the FIRST paint (reads the
 * same key before hydration); this control only toggles thereafter. "System"
 * follows prefers-color-scheme live. Styled with currentColor so it sits
 * correctly on any surface — the light marketing header OR the navy rails.
 * Square corners to match the brand (--radius: 0).
 */

import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

type Choice = "light" | "dark" | "system";

const STORAGE_KEY = "dso-theme";

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Apply a choice to <html> immediately (mirrors the no-flash script's logic). */
function applyChoice(choice: Choice) {
  const dark = choice === "dark" || (choice === "system" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
}

const OPTIONS: ReadonlyArray<{ key: Choice; label: string; Icon: typeof Sun }> = [
  { key: "light", label: "Light", Icon: Sun },
  { key: "dark", label: "Dark", Icon: Moon },
  { key: "system", label: "System", Icon: Monitor },
];

export function ThemeToggle({ className = "" }: { className?: string }) {
  // null until mounted — keeps server + first client render identical (the
  // no-flash script already set the class on <html>), so no hydration mismatch.
  const [choice, setChoice] = useState<Choice | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Choice | null;
    setChoice(stored ?? "system");
  }, []);

  // While on "system", follow live OS changes.
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyChoice("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [choice]);

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
              active ? "bg-current/10 opacity-100" : "opacity-50 hover:opacity-100"
            }`}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
