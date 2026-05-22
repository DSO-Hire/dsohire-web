"use client";

/**
 * HelpTip — the lightest contextual-help affordance (Dave call Note 5).
 *
 * A small ⓘ icon next to a label or heading. Hover or focus reveals a compact
 * popover with a one-liner from the help registry; click toggles it (so it
 * works on touch). Esc closes. Pure React + Tailwind, no popover lib.
 *
 * Use for 1–2 sentences. For a paragraph use <HelpDisclosure>; for a
 * walkthrough use <HelpDrawer>.
 *
 *   <HelpTip helpKey="jd.requirements" />
 *
 * Content comes from src/lib/help/help-content.ts so copy lives in one place.
 * Pass `tip`/`title` to override without a registry entry.
 */

import { useId, useRef, useState } from "react";
import { Info } from "lucide-react";
import { getHelp } from "@/lib/help/help-content";

export function HelpTip({
  helpKey,
  tip: tipOverride,
  title: titleOverride,
  align = "left",
  className = "",
}: {
  helpKey?: string;
  tip?: string;
  title?: string;
  /** Which edge of the popover aligns to the icon. */
  align?: "left" | "right";
  className?: string;
}) {
  const entry = helpKey ? getHelp(helpKey) : undefined;
  const tip = tipOverride ?? entry?.tip;
  const title = titleOverride ?? entry?.title;
  const [open, setOpen] = useState(false);
  const popId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nothing to show (bad key + no override) → render nothing rather than an
  // empty popover.
  if (!tip) return null;

  const show = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  // Small delay on leave so moving the pointer from icon → popover doesn't
  // flicker it closed.
  const scheduleHide = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 80);
  };

  return (
    <span
      className={"relative inline-flex align-middle " + className}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
    >
      <button
        type="button"
        aria-label={title ? `Help: ${title}` : "Help"}
        aria-expanded={open}
        aria-describedby={open ? popId : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={show}
        onBlur={scheduleHide}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-meta hover:text-heritage-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage/40 transition-colors"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>

      {open && (
        <span
          id={popId}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
          className={
            "absolute top-full z-50 mt-1.5 w-[280px] max-w-[78vw] rounded-md border border-[var(--rule-strong)] bg-white p-3 text-left shadow-lg " +
            (align === "right" ? "right-0" : "left-0")
          }
        >
          {title && (
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[1.5px] text-heritage-deep">
              {title}
            </span>
          )}
          <span className="block text-[12.5px] leading-relaxed text-slate-body">
            {tip}
          </span>
        </span>
      )}
    </span>
  );
}
