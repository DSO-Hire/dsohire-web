"use client";

import { PALETTE_EVENT, type PaletteMode } from "./shortcuts";

/* A button that opens the Cmd-K palette in a given mode. Lets server pages
   (Today, not-found, empty states) offer palette flows without becoming
   client components. */
export default function PaletteButton({
  mode = "search",
  label,
  className = "dbtn dbtn-line",
}: {
  mode?: PaletteMode;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={() => window.dispatchEvent(new CustomEvent(PALETTE_EVENT, { detail: { mode } }))}
    >
      {label}
    </button>
  );
}
