"use client";

/**
 * <StageSelector> — full-pipeline stage control for the application detail page.
 *
 * Shows all five active KANBAN_STAGES as a segmented control with the current
 * stage highlighted (matched to STAGE_COLORS so the badge here looks identical
 * to the kanban column). Terminal/closed transitions (Reject, Withdrawn) live
 * in a "More actions" dropdown so primary moves stay one click away.
 *
 * Calls the same `moveApplicationStage` server action the kanban board uses.
 * Optimistic state via `useOptimistic` so the highlight snaps to the new stage
 * immediately; on failure we surface an inline error and the optimistic state
 * unwinds when the transition resolves. `useTransition` gates the buttons so
 * recruiters can't double-fire mid-flight.
 */

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { ChevronDown, MoreHorizontal, Loader2 } from "lucide-react";
import {
  KANBAN_STAGES,
  STAGE_COLORS,
  STAGE_LABELS,
  type ApplicationStatus,
  type KanbanStage,
} from "@/lib/applications/stages";
import { moveApplicationStage } from "./actions";

const CLOSED_TRANSITIONS: Array<{
  to: ApplicationStatus;
  label: string;
  tone: "danger" | "neutral";
}> = [
  { to: "rejected", label: "Reject", tone: "danger" },
  { to: "withdrawn", label: "Mark Withdrawn", tone: "neutral" },
];

interface StageSelectorProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
}

export function StageSelector({
  applicationId,
  currentStatus,
}: StageSelectorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Optimistic stage so the highlight moves the moment a button is clicked.
  // Reverts automatically when the transition finishes if the server action
  // failed (we set `error` and don't replace `currentStatus` in the parent).
  const [optimisticStatus, setOptimisticStatus] = useOptimistic<
    ApplicationStatus,
    ApplicationStatus
  >(currentStatus, (_prev, next) => next);

  // Close the More-actions menu on outside click / Esc.
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpen]);

  function move(next: ApplicationStatus) {
    if (next === optimisticStatus) return;
    setError(null);
    setMenuOpen(false);
    startTransition(async () => {
      setOptimisticStatus(next);
      const result = await moveApplicationStage(applicationId, next);
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Pipeline stage"
        className="inline-flex flex-wrap items-stretch gap-0 border border-[var(--rule-strong)] bg-white"
      >
        {KANBAN_STAGES.map((stage) => {
          const active = optimisticStatus === stage;
          const color = STAGE_COLORS[stage as KanbanStage];
          return (
            <button
              key={stage}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => move(stage)}
              className={`relative inline-flex items-center gap-2 px-4 py-2.5 text-[10px] font-bold tracking-[1.5px] uppercase border-r last:border-r-0 border-[var(--rule)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-inset ${
                active
                  ? `${color.bg} ${color.text} ring-1 ring-inset ${color.ring}`
                  : "text-slate-body hover:bg-cream"
              }`}
            >
              {active && pending ? (
                <Loader2
                  className="h-3 w-3 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    active ? color.text.replace("text-", "bg-") : "bg-slate-300"
                  }`}
                  aria-hidden="true"
                />
              )}
              {STAGE_LABELS[stage]}
            </button>
          );
        })}

        <div ref={menuRef} className="relative inline-flex">
          <button
            type="button"
            disabled={pending}
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More stage actions"
            className="inline-flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-bold tracking-[1.5px] uppercase border-l border-[var(--rule)] text-slate-body hover:bg-cream transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-inset"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
            <ChevronDown className="h-3 w-3" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full mt-1 z-20 min-w-[180px] border border-[var(--rule-strong)] bg-white shadow-lg"
            >
              {CLOSED_TRANSITIONS.map((t) => {
                const active = optimisticStatus === t.to;
                return (
                  <button
                    key={t.to}
                    type="button"
                    role="menuitem"
                    disabled={pending || active}
                    onClick={() => move(t.to)}
                    className={`block w-full text-left px-4 py-2.5 text-[12px] font-semibold transition-colors focus:outline-none focus-visible:bg-cream disabled:opacity-50 disabled:cursor-not-allowed ${
                      t.tone === "danger"
                        ? "text-red-700 hover:bg-red-50"
                        : "text-ink hover:bg-cream"
                    }`}
                  >
                    {active ? `${t.label} (current)` : t.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 text-[12px] text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
