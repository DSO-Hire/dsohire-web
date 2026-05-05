"use client";

/**
 * <StageSelector> — full-pipeline stage control for the application detail page.
 *
 * Shows all five active KANBAN_STAGES as a segmented control with the current
 * stage highlighted (matched to STAGE_COLORS so the badge here looks identical
 * to the kanban column). Terminal/closed transitions (Reject, Withdrawn) live
 * in a "More actions" dropdown so primary moves stay one click away.
 *
 * Closed-state transitions open a confirmation dialog with an optional
 * recruiter reason textarea (parity with the bulk-reject + bulk-archive flow).
 * The reason is patched onto the trigger-seeded `application_status_events`
 * row via the shared helper at `@/lib/applications/status-event-notes` —
 * RLS denies client-side INSERT/UPDATE on that table, so the helper uses
 * the service-role client server-side.
 *
 * Calls the same `moveApplicationStage` server action the kanban board uses.
 * Optimistic state via `useOptimistic` so the highlight snaps to the new stage
 * immediately; on failure we surface an inline error and the optimistic state
 * unwinds when the transition resolves. `useTransition` gates the buttons so
 * recruiters can't double-fire mid-flight.
 */

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { ChevronDown, MoreHorizontal, Loader2 } from "lucide-react";
import {
  KANBAN_STAGES,
  STAGE_COLORS,
  STAGE_LABELS,
  type ApplicationStatus,
  type KanbanStage,
} from "@/lib/applications/stages";
import { moveApplicationStage } from "./actions";
import { rejectWithReason, withdrawWithReason } from "./reject-actions";
import { RejectReasonAiSuggester } from "./reject-reason-ai-suggester";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ClosedTone = "danger" | "neutral";

interface ClosedTransition {
  to: ApplicationStatus;
  label: string;
  tone: ClosedTone;
  // Dialog copy
  dialogTitle: string;
  dialogConfirmLabel: string;
  dialogReasonHelper: string;
}

const CLOSED_TRANSITIONS: ClosedTransition[] = [
  {
    to: "rejected",
    label: "Reject",
    tone: "danger",
    dialogTitle: "Reject this candidate?",
    dialogConfirmLabel: "Confirm Rejection",
    dialogReasonHelper:
      "This appears in your team's audit log; the candidate doesn't see it.",
  },
  {
    to: "withdrawn",
    label: "Mark Withdrawn",
    tone: "neutral",
    dialogTitle: "Mark this candidate as withdrawn?",
    dialogConfirmLabel: "Confirm Withdrawal",
    dialogReasonHelper:
      "This appears in your team's audit log; the candidate doesn't see it.",
  },
];

interface StageSelectorProps {
  applicationId: string;
  currentStatus: ApplicationStatus;
  candidateName: string;
  jobTitle: string;
  /**
   * Whether the DSO's tier permits the AI rejection-reason suggester.
   * Server action enforces this too; this prop drives the in-dialog UI
   * (panel vs upgrade ghost). Growth+ only.
   */
  aiSuggesterAvailable: boolean;
  /**
   * Whether the application has ≥1 screening answer or submitted scorecard
   * available as context. Without context the suggester button is disabled
   * (the model can only paraphrase the JD, which isn't useful).
   */
  aiSuggesterHasContext: boolean;
}

export function StageSelector({
  applicationId,
  currentStatus,
  candidateName,
  jobTitle,
  aiSuggesterAvailable,
  aiSuggesterHasContext,
}: StageSelectorProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [closedDialog, setClosedDialog] = useState<ClosedTransition | null>(
    null
  );

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

  function handleSegmentedClick(next: ApplicationStatus) {
    move(next);
  }

  function handleClosedMenuItem(transition: ClosedTransition) {
    if (transition.to === optimisticStatus) return;
    setMenuOpen(false);
    setClosedDialog(transition);
  }

  function handleClosedConfirm(transition: ClosedTransition, reason: string) {
    setClosedDialog(null);
    if (transition.to === optimisticStatus) return;
    setError(null);
    const next = transition.to;
    startTransition(async () => {
      setOptimisticStatus(next);
      const action =
        next === "rejected" ? rejectWithReason : withdrawWithReason;
      const result = await action(applicationId, reason);
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
              onClick={() => handleSegmentedClick(stage)}
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
                    onClick={() => handleClosedMenuItem(t)}
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

      <ClosedTransitionDialog
        applicationId={applicationId}
        transition={closedDialog}
        candidateName={candidateName}
        jobTitle={jobTitle}
        aiSuggesterAvailable={aiSuggesterAvailable}
        aiSuggesterHasContext={aiSuggesterHasContext}
        onCancel={() => setClosedDialog(null)}
        onConfirm={handleClosedConfirm}
      />
    </div>
  );
}

/**
 * Confirmation dialog for closed-state transitions (Reject / Mark Withdrawn).
 *
 * Mirrors the shape of the bulk-reject confirmation in the kanban board so
 * recruiters get the same flow whether they're moving one candidate or many:
 *  - headline naming the action
 *  - body line citing the candidate + role for context
 *  - optional reason textarea capped at 1000 chars (matches server cap)
 *  - Cancel + Confirm; Confirm is destructive-red for Reject, heritage for
 *    Mark Withdrawn
 *
 * The reason resets every time the dialog opens so a previous draft from a
 * cancelled action doesn't leak into the next confirmation.
 */
function ClosedTransitionDialog({
  applicationId,
  transition,
  candidateName,
  jobTitle,
  aiSuggesterAvailable,
  aiSuggesterHasContext,
  onCancel,
  onConfirm,
}: {
  applicationId: string;
  transition: ClosedTransition | null;
  candidateName: string;
  jobTitle: string;
  aiSuggesterAvailable: boolean;
  aiSuggesterHasContext: boolean;
  onCancel: () => void;
  onConfirm: (transition: ClosedTransition, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const open = transition !== null;

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  if (!transition) return null;

  const confirmClasses =
    transition.tone === "danger"
      ? "bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-700"
      : "bg-heritage text-white hover:bg-heritage-deep focus-visible:ring-heritage";

  // The AI suggester only makes sense for the Reject flow — withdrawn is a
  // candidate-side concept where there's nothing for AI to draft.
  const showAiSuggester = transition.to === "rejected";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transition.dialogTitle}</DialogTitle>
          <DialogDescription>
            {candidateName} · {jobTitle}
          </DialogDescription>
        </DialogHeader>
        {showAiSuggester && (
          <RejectReasonAiSuggester
            applicationId={applicationId}
            available={aiSuggesterAvailable}
            hasContext={aiSuggesterHasContext}
            onApply={(body) => setReason(body.slice(0, 1000))}
          />
        )}
        <div className="grid gap-2">
          <label
            htmlFor="single-reason"
            className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body"
          >
            Reason (optional)
          </label>
          <textarea
            id="single-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Add context for your team's audit log…"
            className="w-full resize-y border border-[var(--rule-strong)] bg-white px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage"
          />
          <p className="text-[11px] text-slate-meta">
            {transition.dialogReasonHelper}
          </p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] bg-white text-slate-body hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(transition, reason)}
            className={`inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${confirmClasses}`}
          >
            {transition.dialogConfirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
