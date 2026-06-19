"use client";

import { useActionState } from "react";
import { updateApplicationStatus, type ActionState } from "./actions";
import {
  Eye,
  MessagesSquare,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const initial: ActionState = { ok: false };

// Keyed by stage *kind* (post-Track-B). The form's `next_status` value is
// sent through updateApplicationStatus which resolves to the DSO's default
// stage of that kind. Surface is legacy; the StageSelector is canonical
// today but this component lingers in case any old surface re-imports it.
const ALL_TRANSITIONS: Record<
  string,
  Array<{ to: string; label: string; tone: "primary" | "neutral" | "danger" }>
> = {
  open: [
    { to: "screen", label: "Mark Reviewed", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  screen: [
    { to: "interview", label: "Schedule Interview", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  interview: [
    { to: "offer", label: "Make Offer", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  offer: [
    { to: "hired", label: "Mark Hired", tone: "primary" },
    { to: "rejected", label: "Withdrawn / Declined", tone: "danger" },
  ],
  hired: [],
  rejected: [
    { to: "screen", label: "Reopen", tone: "neutral" },
  ],
  withdrawn: [],
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  screen: Eye,
  interview: MessagesSquare,
  offer: Send,
  hired: CheckCircle2,
  rejected: XCircle,
};

export function StatusControls({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: string;
}) {
  const [state, action, pending] = useActionState(updateApplicationStatus, initial);
  const transitions = ALL_TRANSITIONS[currentStatus] ?? [];

  if (transitions.length === 0) {
    return (
      <div className="text-[13px] text-slate-meta italic">
        No further transitions available from this status.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2.5">
        {transitions.map((t) => {
          const Icon = ICONS[t.to];
          const className =
            t.tone === "primary"
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : t.tone === "danger"
                ? "border border-danger text-danger hover:bg-danger-bg"
                : "border border-[var(--rule-strong)] text-ink hover:bg-cream";
          return (
            <form key={t.to} action={action}>
              <input type="hidden" name="application_id" value={applicationId} />
              <input type="hidden" name="next_status" value={t.to} />
              <button
                type="submit"
                disabled={pending}
                className={`inline-flex items-center gap-2 px-5 py-2.5 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
              >
                {Icon && <Icon className="h-3.5 w-3.5" />}
                {t.label}
              </button>
            </form>
          );
        })}
      </div>
      {state.error && (
        <p className="mt-3 text-[13px] text-danger">{state.error}</p>
      )}
      {state.ok && state.message && (
        <p className="mt-3 text-[13px] text-heritage-deep font-semibold">
          {state.message}
        </p>
      )}
    </div>
  );
}
