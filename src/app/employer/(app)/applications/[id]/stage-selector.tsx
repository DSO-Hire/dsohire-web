"use client";

/**
 * <StageSelector> — full-pipeline stage control for the application detail page.
 *
 * Shows the DSO's visible kanban stages as a segmented control with the
 * current stage highlighted. Terminal/closed transitions (Reject, Withdrawn)
 * live in a "More actions" dropdown so primary moves stay one click away.
 *
 * Closed-state transitions open a confirmation dialog with an optional
 * recruiter reason textarea. The reason is patched onto the trigger-seeded
 * `application_status_events` row via the shared helper.
 *
 * Calls the same `moveApplicationStage` server action the kanban board
 * uses. Optimistic state via `useOptimistic` so the highlight snaps to the
 * new stage immediately.
 */

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal, Loader2 } from "lucide-react";
import {
  colorTripleFor,
  isTerminalKind,
  partitionStagesForKanban,
  type PipelineStage,
  type StageKind,
} from "@/lib/applications/stages";
import { moveApplicationStage } from "./actions";
import { useToast } from "@/components/app/toast";
import { rejectWithReason, withdrawWithReason } from "./reject-actions";
import { RejectReasonAiSuggester } from "./reject-reason-ai-suggester";
import { DispositionSelect } from "@/components/applications/disposition-select";
import { validateDisposition } from "@/lib/applications/disposition-reasons";
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
  toKind: Extract<StageKind, "rejected" | "withdrawn">;
  label: string;
  tone: ClosedTone;
  dialogTitle: string;
  dialogConfirmLabel: string;
  dialogReasonHelper: string;
}

const CLOSED_TRANSITIONS: ClosedTransition[] = [
  {
    toKind: "rejected",
    label: "Reject",
    tone: "danger",
    dialogTitle: "Reject this candidate?",
    dialogConfirmLabel: "Confirm Rejection",
    dialogReasonHelper:
      "This appears in your team's audit log; the candidate doesn't see it.",
  },
  {
    toKind: "withdrawn",
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
  /** Current stage_id on the application. */
  currentStageId: string;
  /** Current stage kind (used for terminal-state detection + fallback). */
  currentKind: StageKind;
  /** Full pipeline stage list for the DSO. */
  stages: PipelineStage[];
  candidateName: string;
  jobTitle: string;
  aiSuggesterAvailable: boolean;
  aiSuggesterHasContext: boolean;
}

export function StageSelector({
  applicationId,
  currentStageId,
  currentKind,
  stages,
  candidateName,
  jobTitle,
  aiSuggesterAvailable,
  aiSuggesterHasContext,
}: StageSelectorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [closedDialog, setClosedDialog] = useState<ClosedTransition | null>(
    null
  );

  const { kanban: kanbanStages } = partitionStagesForKanban(stages);

  // Optimistic stage_id + kind so the highlight moves the moment a button
  // is clicked. Reverts when the transition finishes if the server action
  // fails (we set `error` and don't replace the parent values).
  const [optimisticState, setOptimisticState] = useOptimistic<
    { stageId: string; kind: StageKind },
    { stageId: string; kind: StageKind }
  >({ stageId: currentStageId, kind: currentKind }, (_prev, next) => next);

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

  function moveToStage(stage: PipelineStage) {
    if (stage.id === optimisticState.stageId) return;
    setError(null);
    setMenuOpen(false);
    startTransition(async () => {
      setOptimisticState({ stageId: stage.id, kind: stage.kind });
      const result = await moveApplicationStage(applicationId, {
        stageId: stage.id,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // First toast consumer (Day 32) — the "committed" verb for the
      // workspace's most common action.
      toast({ kind: "commit", title: `Moved to ${stage.label}` });
      // OFFER-UX — landing the candidate in the Offer stage opens the offer
      // composer automatically (the section is far down the page; this saves
      // the hunt). Only when moving INTO offer from a different kind.
      if (stage.kind === "offer" && optimisticState.kind !== "offer") {
        router.push(
          `/employer/applications/${applicationId}?compose=offer`,
          { scroll: false }
        );
      }
    });
  }

  function handleClosedMenuItem(transition: ClosedTransition) {
    if (transition.toKind === optimisticState.kind) return;
    setMenuOpen(false);
    setClosedDialog(transition);
  }

  function handleClosedConfirm(
    transition: ClosedTransition,
    reason: string,
    dispositionCode: string | null
  ) {
    setClosedDialog(null);
    if (transition.toKind === optimisticState.kind) return;
    setError(null);
    startTransition(async () => {
      // Optimistic: switch to the DSO's terminal stage row of the right
      // kind if we have it; otherwise just flip the kind so the highlight
      // moves off the segmented control while the server resolves it.
      const targetRow =
        stages.find(
          (s) => s.kind === transition.toKind && s.is_default
        ) ?? null;
      setOptimisticState({
        stageId: targetRow?.id ?? optimisticState.stageId,
        kind: transition.toKind,
      });
      const action =
        transition.toKind === "rejected" ? rejectWithReason : withdrawWithReason;
      const result = await action(applicationId, reason, dispositionCode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        kind: "commit",
        title:
          transition.toKind === "rejected"
            ? "Marked rejected — candidate notified per your template"
            : "Marked withdrawn",
      });
    });
  }

  const onSegmentedControl = !isTerminalKind(optimisticState.kind);

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Pipeline stage"
        className="inline-flex flex-wrap items-stretch gap-0 border border-[var(--rule-strong)] bg-card"
      >
        {kanbanStages.map((stage) => {
          const active = onSegmentedControl && optimisticState.stageId === stage.id;
          const color = colorTripleFor(stage.color_class, stage.kind);
          return (
            <button
              key={stage.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => moveToStage(stage)}
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
                    active ? color.text.replace("text-", "bg-") : "bg-meta-foreground"
                  }`}
                  aria-hidden="true"
                />
              )}
              {stage.label}
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
              className="absolute right-0 top-full mt-1 z-20 min-w-[180px] border border-[var(--rule-strong)] bg-popover shadow-lg"
            >
              {CLOSED_TRANSITIONS.map((t) => {
                const active = optimisticState.kind === t.toKind;
                return (
                  <button
                    key={t.toKind}
                    type="button"
                    role="menuitem"
                    disabled={pending || active}
                    onClick={() => handleClosedMenuItem(t)}
                    className={`block w-full text-left px-4 py-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:bg-cream disabled:opacity-50 disabled:cursor-not-allowed ${
                      t.tone === "danger"
                        ? "text-danger hover:bg-danger-bg"
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
          className="mt-3 text-[13px] text-danger"
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
  onConfirm: (
    transition: ClosedTransition,
    reason: string,
    dispositionCode: string | null
  ) => void;
}) {
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState("");
  const open = transition !== null;

  useEffect(() => {
    if (open) {
      setReason("");
      setDisposition("");
    }
  }, [open]);

  if (!transition) return null;

  const confirmClasses =
    transition.tone === "danger"
      ? "bg-danger text-danger-foreground hover:bg-danger/90 focus-visible:ring-danger"
      : "bg-heritage text-primary-foreground hover:bg-heritage-deep focus-visible:ring-heritage";

  const showAiSuggester = transition.toKind === "rejected";
  const dispositionRequired = transition.toKind === "rejected";
  // Mirror the server gate so Confirm only enables on a valid (code, note) pair.
  const dispositionError = validateDisposition(
    transition.toKind,
    disposition || null,
    reason
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transition.dialogTitle}</DialogTitle>
          <DialogDescription>
            {candidateName} · {jobTitle}
          </DialogDescription>
        </DialogHeader>
        <DispositionSelect
          kind={transition.toKind}
          value={disposition}
          onChange={setDisposition}
          required={dispositionRequired}
          id="single-disposition"
        />
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
            Note
          </label>
          <textarea
            id="single-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 1000))}
            rows={3}
            placeholder="Add context for your team's audit log…"
            className="w-full resize-y border border-[var(--rule-strong)] bg-card px-3 py-2 text-[14px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage"
          />
          <p className="text-[12px] text-slate-meta">
            {transition.dialogReasonHelper}
          </p>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase border border-[var(--rule-strong)] bg-card text-slate-body hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage focus-visible:ring-offset-2"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={dispositionError !== null}
            onClick={() =>
              onConfirm(transition, reason, disposition || null)
            }
            className={`inline-flex items-center justify-center px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${confirmClasses}`}
          >
            {transition.dialogConfirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
