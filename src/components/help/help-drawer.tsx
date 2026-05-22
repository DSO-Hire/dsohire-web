"use client";

/**
 * HelpDrawer — the heaviest contextual-help affordance (Dave call Note 5).
 *
 * A right-side slide-out panel (Cam's "slide-out info box") for multi-section
 * walkthroughs and an embedded clip. Opens over the current screen without
 * navigating away; Esc / scrim / X close it. Portaled to document.body so it
 * escapes any `backdrop-blur` containing block (same gotcha the mobile menu
 * documents).
 *
 *   <HelpDrawer helpKey="jd.overview" />
 *
 * Drawers ship with WRITTEN steps now; `videoId` is a slot for a future GTM
 * walkthrough clip. While null, we render a quiet "video coming soon" note
 * rather than a broken player.
 *
 * Accessibility: role=dialog + aria-modal, focus moves into the panel on open
 * and returns to the trigger on close, body scroll locked while open, slide
 * animation suppressed under prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X, HelpCircle, Play } from "lucide-react";
import { getHelp } from "@/lib/help/help-content";

export function HelpDrawer({
  helpKey,
  triggerLabel = "How this works",
  className = "",
}: {
  helpKey: string;
  triggerLabel?: string;
  className?: string;
}) {
  const entry = getHelp(helpKey);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false); // drives the slide-in transition
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Open/close side effects: scroll lock, Esc, focus management. Every step is
  // wrapped/guarded so an unmount mid-flight never throws.
  useEffect(() => {
    if (!open) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Trigger the enter transition on the next frame (skip if reduced motion).
    let raf = 0;
    if (prefersReduced) {
      setShown(true);
    } else {
      raf = requestAnimationFrame(() => setShown(true));
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    // Move focus into the panel.
    const focusTimer = setTimeout(() => {
      panelRef.current?.focus();
    }, 0);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      setShown(false);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    // Return focus to the trigger for keyboard users.
    triggerRef.current?.focus();
  };

  if (!entry) return null;

  const drawer = open ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={entry.title}
      className="fixed inset-0 z-[70]"
    >
      {/* Scrim */}
      <button
        type="button"
        aria-label="Close help"
        onClick={close}
        className={
          "absolute inset-0 bg-ink/35 backdrop-blur-sm transition-opacity duration-200 " +
          (shown ? "opacity-100" : "opacity-0")
        }
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={
          "absolute top-0 right-0 bottom-0 flex w-[92vw] max-w-[420px] flex-col border-l border-[var(--rule-strong)] bg-ivory shadow-2xl outline-none transition-transform duration-200 ease-out " +
          (shown ? "translate-x-0" : "translate-x-full")
        }
      >
        <div className="flex h-[72px] items-center justify-between border-b border-[var(--rule)] px-6">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-heritage/15"
              aria-hidden
            >
              <Info className="h-3.5 w-3.5 text-heritage-deep" />
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[1.8px] text-heritage-deep">
              Guide
            </span>
          </div>
          <button
            type="button"
            aria-label="Close help"
            onClick={close}
            className="flex h-9 w-9 items-center justify-center text-ink transition-colors hover:text-heritage-deep"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <h2 className="font-display text-xl font-extrabold tracking-[-0.5px] text-ink">
            {entry.title}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-slate-body">
            {entry.tip}
          </p>

          {/* Video slot — written steps ship now; a clip drops in later. */}
          <VideoSlot videoId={entry.videoId ?? null} title={entry.title} />

          {entry.steps && entry.steps.length > 0 && (
            <ol className="mt-6 list-none space-y-5">
              {entry.steps.map((s, i) => (
                <li key={i} className="border-l-2 border-heritage/30 pl-4">
                  {s.heading && (
                    <div className="text-[13px] font-bold tracking-[-0.1px] text-ink">
                      {s.heading}
                    </div>
                  )}
                  <p className="mt-1 text-[13.5px] leading-relaxed text-slate-body">
                    {s.body}
                  </p>
                </li>
              ))}
            </ol>
          )}

          {entry.bullets && entry.bullets.length > 0 && (
            <ul className="mt-6 list-none space-y-2">
              {entry.bullets.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13.5px] leading-snug text-slate-body"
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
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className={
          "inline-flex items-center gap-1.5 text-[12px] font-semibold text-heritage-deep underline-offset-2 transition-colors hover:text-ink hover:underline " +
          className
        }
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
        {triggerLabel}
      </button>
      {drawer && typeof window !== "undefined"
        ? createPortal(drawer, document.body)
        : null}
    </>
  );
}

function VideoSlot({
  videoId,
  title,
}: {
  videoId: string | null;
  title: string;
}) {
  if (!videoId) {
    // No clip yet — a calm placeholder, not a broken player.
    return (
      <div className="mt-5 flex items-center gap-3 border border-dashed border-[var(--rule-strong)] bg-cream/50 px-4 py-3">
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-heritage/10"
          aria-hidden
        >
          <Play className="h-3.5 w-3.5 text-heritage-deep" />
        </span>
        <span className="text-[12px] leading-snug text-slate-meta">
          A short walkthrough video is coming soon. The written steps below
          cover everything for now.
        </span>
      </div>
    );
  }

  // A clip exists — render a responsive 16:9 embed. Host is decided alongside
  // the GTM video library; this assumes an embeddable URL by id.
  return (
    <div className="mt-5 aspect-video w-full overflow-hidden border border-[var(--rule)] bg-black">
      <iframe
        src={videoId}
        title={`${title} — walkthrough`}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}
