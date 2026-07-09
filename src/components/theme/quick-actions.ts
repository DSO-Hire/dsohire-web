/**
 * Theme / text-size quick actions for the ⌘K command palette.
 *
 * Mirrors the storage keys + apply logic of ThemeToggle ('dso-theme') and
 * TextSizeToggle ('dso-text-scale') — the no-flash script in the root
 * layout reads the same keys on first paint. If those toggles ever change
 * their keys or semantics, change this file with them.
 *
 * Client-only (touches document/localStorage) — call from event handlers
 * in "use client" components.
 */

export function toggleTheme(): "light" | "dark" {
  const dark = document.documentElement.classList.toggle("dark");
  const next = dark ? "dark" : "light";
  localStorage.setItem("dso-theme", next);
  return next;
}

const TEXT_SCALES = ["1", "1.11", "1.22"] as const;

export function cycleTextSize(): string {
  const stored = localStorage.getItem("dso-text-scale");
  const current = (TEXT_SCALES as readonly string[]).includes(stored ?? "")
    ? (stored as (typeof TEXT_SCALES)[number])
    : "1";
  const next =
    TEXT_SCALES[(TEXT_SCALES.indexOf(current) + 1) % TEXT_SCALES.length];
  localStorage.setItem("dso-text-scale", next);
  document.documentElement.style.setProperty("--text-scale", next);
  return next;
}
