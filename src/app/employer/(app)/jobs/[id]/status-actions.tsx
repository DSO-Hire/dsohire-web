"use client";

/**
 * Status transition buttons for the job edit page (Pause / Resume / Mark Filled).
 * Submits to the setJobStatus server action.
 */

import { useActionState } from "react";
import { Pause, Play, Check, Lock, Globe } from "lucide-react";
import {
  setJobStatus,
  setJobVisibility,
  type JobActionState,
} from "../actions";

const initial: JobActionState = { ok: false };

interface Props {
  jobId: string;
  currentStatus: string;
}

export function JobStatusActions({ jobId, currentStatus }: Props) {
  const [state, action, pending] = useActionState(setJobStatus, initial);

  const buttons: Array<{
    targetStatus: string;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    show: boolean;
  }> = [
    {
      targetStatus: "active",
      label: currentStatus === "draft" ? "Publish" : "Resume",
      Icon: Play,
      show: currentStatus === "draft" || currentStatus === "paused",
    },
    {
      targetStatus: "paused",
      label: "Pause",
      Icon: Pause,
      show: currentStatus === "active",
    },
    {
      targetStatus: "filled",
      label: "Mark filled",
      Icon: Check,
      show: currentStatus === "active" || currentStatus === "paused",
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {buttons
          .filter((b) => b.show)
          .map((b) => (
            <form key={b.targetStatus} action={action}>
              <input type="hidden" name="job_id" value={jobId} />
              <input type="hidden" name="new_status" value={b.targetStatus} />
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-xs font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors disabled:opacity-60"
              >
                <b.Icon className="h-3.5 w-3.5" />
                {b.label}
              </button>
            </form>
          ))}
      </div>
      {/* Surface the action's error (e.g. the demo-mode block message) —
          without this the useActionState result is discarded and a blocked
          write looks like nothing happened. */}
      {state.error && (
        <p className="text-xs text-danger" role="status">
          {state.error}
        </p>
      )}
    </div>
  );
}

/**
 * E1.22 — Toggle a job between public and internal-only. Internal-only
 * jobs are hidden from public discovery but still reachable by direct link
 * (which the recruiter can share). Submits to setJobVisibility.
 */
export function JobVisibilityToggle({
  jobId,
  currentVisibility,
}: {
  jobId: string;
  currentVisibility: string;
}) {
  const [state, action, pending] = useActionState(setJobVisibility, initial);
  const isInternal = currentVisibility === "internal_only";
  const target = isInternal ? "public" : "internal_only";

  return (
    <div className="flex flex-col gap-2">
      <form action={action}>
        <input type="hidden" name="job_id" value={jobId} />
        <input type="hidden" name="new_visibility" value={target} />
        <button
          type="submit"
          disabled={pending}
          title={
            isInternal
              ? "Make this job public — it will appear on the job board and company page."
              : "Make this job internal-only — it will be hidden from the job board, map, and company page, but still reachable by direct link."
          }
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-xs font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors disabled:opacity-60"
        >
          {isInternal ? (
            <Globe className="h-3.5 w-3.5" />
          ) : (
            <Lock className="h-3.5 w-3.5" />
          )}
          {isInternal ? "Make public" : "Make internal-only"}
        </button>
      </form>
      {state.error && (
        <p className="text-xs text-danger" role="status">
          {state.error}
        </p>
      )}
    </div>
  );
}
