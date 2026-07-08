"use client";

/**
 * TextSizeToggle — Default / Large / Larger, persisted to
 * localStorage('dso-text-scale'). Sets --text-scale on <html>; the no-flash
 * script in the root layout owns the first paint. Everything rem-based (all
 * app text after the 2026-07-08 readability pass) scales in lockstep.
 * Mirrors ThemeToggle styling (square corners, currentColor, heritage
 * underline on active).
 */

import { useEffect, useState } from "react";
import { ALargeSmall, AArrowUp } from "lucide-react";

type Scale = "1" | "1.11" | "1.22";

const STORAGE_KEY = "dso-text-scale";

const OPTIONS: ReadonlyArray<{
  key: Scale;
  label: string;
  Icon: typeof ALargeSmall;
  iconClass: string;
}> = [
  { key: "1", label: "Default", Icon: ALargeSmall, iconClass: "size-4" },
  { key: "1.11", label: "Large", Icon: AArrowUp, iconClass: "size-4" },
  { key: "1.22", label: "Larger", Icon: AArrowUp, iconClass: "size-5" },
];

function apply(scale: Scale) {
  document.documentElement.style.setProperty("--text-scale", scale);
}

export function TextSizeToggle({ className = "" }: { className?: string }) {
  // null until mounted — the no-flash script already applied the stored
  // scale, so server + first client render stay identical.
  const [scale, setScale] = useState<Scale | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setScale(stored === "1.11" || stored === "1.22" ? stored : "1");
  }, []);

  function pick(next: Scale) {
    localStorage.setItem(STORAGE_KEY, next);
    setScale(next);
    apply(next);
  }

  return (
    <div
      role="group"
      aria-label="Text size"
      className={`inline-flex items-center border border-current/20 ${className}`}
    >
      {OPTIONS.map(({ key, label, Icon, iconClass }) => {
        const active = scale === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            aria-label={`${label} text size`}
            aria-pressed={active}
            title={label}
            className={`inline-flex h-7 w-7 items-center justify-center transition-opacity ${
              active ? "opacity-100 shadow-[inset_0_-2px_0_0_var(--heritage-bright)]" : "opacity-50 hover:opacity-100"
            }`}
          >
            <Icon className={iconClass} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
