"use client";

/**
 * Status transition buttons for the job edit page (Pause / Resume / Mark Filled).
 * Submits to the setJobStatus server action.
 */

import { useActionState } from "react";
import { Pause, Play, Check } from "lucide-react";
import { setJobStatus, type JobActionState } from "../actions";

const initial: JobActionState = { ok: false };

interface Props {
  jobId: string;
  currentStatus: string;
}

export function JobStatusActions({ jobId, currentStatus }: Props) {
  const [, action, pending] = useActionState(setJobStatus, initial);

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
      label: "Mark Filled",
      Icon: Check,
      show: currentStatus === "active" || currentStatus === "paused",
    },
  ];

  return (
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
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink hover:text-ivory hover:border-ink transition-colors disabled:opacity-60"
            >
              <b.Icon className="h-3.5 w-3.5" />
              {b.label}
            </button>
          </form>
        ))}
    </div>
  );
}
