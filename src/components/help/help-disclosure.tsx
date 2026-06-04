"use client";

/**
 * HelpDisclosure — inline, expand-in-place contextual help (Dave call Note 5).
 *
 * Generalizes the proven RoleHelp pattern (employer/team/role-help.tsx): an
 * Info-banner button that expands a brand-styled panel below it, in place, so
 * the user keeps their spot. Screen-reader friendly (controlled disclosure,
 * not a popover).
 *
 * Use for a paragraph / short list / worked example. For one sentence use
 * <HelpTip>; for a walkthrough + video use <HelpDrawer>.
 *
 *   <HelpDisclosure helpKey="jd.screening" />
 *
 * Renders nothing if the key is unknown and no children are supplied.
 */

import { useId, useState } from "react";
import { Info, X, ChevronDown } from "lucide-react";
import { getHelp } from "@/lib/help/help-content";

export function HelpDisclosure({
  helpKey,
  triggerLabel,
  className = "",
  children,
}: {
  helpKey?: string;
  /** Override the banner's call-to-action label. */
  triggerLabel?: string;
  className?: string;
  /** Optional custom body; falls back to the registry steps/bullets. */
  children?: React.ReactNode;
}) {
  const entry = helpKey ? getHelp(helpKey) : undefined;
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!entry && !children) return null;

  const title = entry?.title ?? "More info";
  const tip = entry?.tip;
  // Lowercase for the casual banner voice, but preserve the PracticeFit
  // brand casing (the title is sentence-case; toLowerCase would mangle the
  // wordmark to "practicefit").
  const label =
    triggerLabel ??
    `About ${title.toLowerCase().replace(/practicefit/g, "PracticeFit")}`;

  return (
    <div className={"max-w-[820px] " + className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group flex w-full items-center gap-3 border border-heritage/40 bg-cream px-4 py-3 text-left transition-colors hover:border-heritage hover:bg-heritage-tint"
        style={{ background: open ? "var(--heritage-tint)" : undefined }}
      >
        <span
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-heritage/15"
          aria-hidden
        >
          <Info className="h-3.5 w-3.5 text-heritage-deep" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-bold tracking-[-0.1px] text-ink">
            {label}
          </span>
        </span>
        <ChevronDown
          className={
            "h-4 w-4 flex-shrink-0 text-slate-meta transition-transform " +
            (open ? "rotate-180" : "")
          }
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="mt-2 border border-[var(--rule-strong)] bg-cream/60 p-5"
        >
          <div className="mb-3 flex items-start justify-between gap-4">
            <h3 className="text-[14px] font-extrabold tracking-[-0.3px] text-ink">
              {title}
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="p-1 text-slate-meta transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {children ?? <HelpBody tip={tip} entryKey={helpKey} />}
        </div>
      )}
    </div>
  );
}

/** Shared renderer for registry tip + steps + bullets. Also used by HelpDrawer. */
export function HelpBody({
  tip,
  entryKey,
}: {
  tip?: string;
  entryKey?: string;
}) {
  const entry = entryKey ? getHelp(entryKey) : undefined;
  return (
    <div className="space-y-3">
      {tip && (
        <p className="text-[13.5px] leading-relaxed text-slate-body">{tip}</p>
      )}

      {entry?.steps && entry.steps.length > 0 && (
        <div className="space-y-3">
          {entry.steps.map((s, i) => (
            <div key={i}>
              {s.heading && (
                <div className="text-[12px] font-bold tracking-[0.2px] text-ink">
                  {s.heading}
                </div>
              )}
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-body">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {entry?.bullets && entry.bullets.length > 0 && (
        <ul className="list-none space-y-1.5">
          {entry.bullets.map((b, i) => (
            <li
              key={i}
              className="flex items-start gap-2 text-[13px] leading-snug text-slate-body"
            >
              <span className="mt-[2px] flex-shrink-0 font-bold text-heritage-deep">
                ·
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
