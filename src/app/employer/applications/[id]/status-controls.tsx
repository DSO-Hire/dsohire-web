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

const ALL_TRANSITIONS: Record<
  string,
  Array<{ to: string; label: string; tone: "primary" | "neutral" | "danger" }>
> = {
  new: [
    { to: "reviewed", label: "Mark Reviewed", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  reviewed: [
    { to: "interviewing", label: "Schedule Interview", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  interviewing: [
    { to: "offered", label: "Make Offer", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  offered: [
    { to: "hired", label: "Mark Hired", tone: "primary" },
    { to: "rejected", label: "Withdrawn / Declined", tone: "danger" },
  ],
  hired: [],
  rejected: [
    { to: "reviewed", label: "Reopen", tone: "neutral" },
  ],
  withdrawn: [],
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  reviewed: Eye,
  interviewing: MessagesSquare,
  offered: Send,
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
      <div className="text-[12px] text-slate-meta italic">
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
              ? "bg-ink text-ivory hover:bg-ink-soft"
              : t.tone === "danger"
                ? "border border-red-300 text-red-700 hover:bg-red-50"
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
        <p className="mt-3 text-[12px] text-red-700">{state.error}</p>
      )}
      {state.ok && state.message && (
        <p className="mt-3 text-[12px] text-heritage-deep font-semibold">
          {state.message}
        </p>
      )}
    </div>
  );
}
