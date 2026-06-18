"use client";

/**
 * <SaveJobButton> — bookmark toggle for a job (Phase 4.4 saved-jobs slice).
 *
 * Two visual variants via the `variant` prop:
 *   • "icon"  — small bookmark icon (used on list cards where space is tight)
 *   • "label" — icon + "Save"/"Saved" text (used on the /jobs/[id] detail header)
 *
 * Renders nothing if `candidateAuthed` is false — anonymous users can't
 * save jobs. The /jobs page determines auth state server-side and passes
 * it down so the button is conditionally rendered without leaking the
 * server action's auth check to anon users.
 *
 * Optimistic update — flips the icon before the round-trip completes.
 * On server error, the icon flips back + a small inline error appears.
 */

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, Loader2, AlertCircle } from "lucide-react";
import { toggleSavedJob } from "./actions";
import { useToast } from "@/components/app/toast";

interface SaveJobButtonProps {
  jobId: string;
  /** Initial saved state — fetched server-side on the consuming page. */
  initialSaved: boolean;
  variant?: "icon" | "label";
  /** When false, the button hides itself entirely (anonymous users). */
  candidateAuthed: boolean;
}

export function SaveJobButton({
  jobId,
  initialSaved,
  variant = "label",
  candidateAuthed,
}: SaveJobButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // No-op unless a ToastProvider is mounted above (it is inside CandidateShell,
  // so saves on /candidate/jobs confirm with a toast; public /jobs stays silent).
  const toast = useToast();

  if (!candidateAuthed) return null;

  const onToggle = () => {
    setError(null);
    const optimistic = !saved;
    setSaved(optimistic);
    setBusy(true);
    startWork(async () => {
      const result = await toggleSavedJob(jobId);
      setBusy(false);
      if (!result.ok) {
        setSaved(!optimistic); // rollback
        setError(result.error);
        return;
      }
      // Server confirms — usually matches our optimistic value, but if a
      // race + revalidation lands different state, trust the server.
      setSaved(result.saved);
      toast({
        title: result.saved ? "Job saved" : "Removed from saved",
      });
    });
  };

  const Icon = saved ? BookmarkCheck : Bookmark;

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-label={saved ? "Remove bookmark" : "Save this job"}
        aria-pressed={saved}
        className={`inline-flex size-8 items-center justify-center rounded-md transition ${
          saved
            ? "bg-[#4D7A60]/10 text-[#4D7A60] hover:bg-[#4D7A60]/15"
            : "text-slate-500 hover:bg-slate-100 hover:text-[#14233F]"
        } disabled:opacity-50`}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        aria-pressed={saved}
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition ${
          saved
            ? "border-[#4D7A60]/40 bg-[#4D7A60]/10 text-[#14233F] hover:border-[#4D7A60]"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        } disabled:opacity-50`}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}
        {saved ? "Saved" : "Save"}
      </button>
      {error && (
        <span
          role="alert"
          className="inline-flex items-center gap-1 text-xs text-red-700"
        >
          <AlertCircle className="size-3" />
          {error}
        </span>
      )}
    </div>
  );
}
