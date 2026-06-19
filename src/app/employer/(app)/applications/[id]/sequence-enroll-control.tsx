"use client";

/**
 * N16 v2 — manual drip-sequence control on the application detail.
 *
 * Not enrolled → pick an enabled sequence + "Start". Enrolled → show progress
 * (step X of N, next send date) + "Stop". Renders nothing when the DSO has no
 * sequence access and no active enrollment.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2, AlertCircle, X } from "lucide-react";
import { enrollInSequence, stopEnrollment } from "@/lib/sequences/actions";

export interface ActiveEnrollmentView {
  id: string;
  sequenceName: string;
  currentStep: number;
  totalSteps: number;
  nextSendAt: string | null;
}

export function SequenceEnrollControl({
  applicationId,
  canUse,
  enrollment,
  sequences,
}: {
  applicationId: string;
  canUse: boolean;
  enrollment: ActiveEnrollmentView | null;
  sequences: Array<{ id: string; name: string; stepCount: number }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>(sequences[0]?.id ?? "");

  if (!enrollment && !canUse) return null;

  function start() {
    if (!picked) return;
    setError(null);
    startTransition(async () => {
      const res = await enrollInSequence(applicationId, picked);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }
  function stop() {
    if (!enrollment) return;
    setError(null);
    startTransition(async () => {
      const res = await stopEnrollment(enrollment.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (enrollment) {
    const next = enrollment.nextSendAt ? new Date(enrollment.nextSendAt) : null;
    return (
      <div className="border border-heritage/30 bg-heritage/[0.05] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-0.5 inline-flex items-center gap-1.5">
              <Mail className="h-3 w-3" /> In a nurture sequence
            </div>
            <div className="text-[13px] text-ink leading-snug">
              <strong>{enrollment.sequenceName}</strong> · step{" "}
              {Math.min(enrollment.currentStep + 1, enrollment.totalSteps)} of{" "}
              {enrollment.totalSteps}
            </div>
            <div className="text-[12px] text-slate-meta mt-0.5">
              {next
                ? `Next email ${next.toLocaleDateString()} at ${next.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : "Scheduling…"}{" "}
              · stops automatically if they reply, change stage, or get an offer.
            </div>
          </div>
          <button
            type="button"
            onClick={stop}
            disabled={pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[var(--rule-strong)] text-ink bg-card text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-cream disabled:opacity-60 shrink-0"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Stop
          </button>
        </div>
        {error && (
          <div className="mt-2 text-[12px] text-danger flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
          </div>
        )}
      </div>
    );
  }

  // Not enrolled + has access.
  if (sequences.length === 0) {
    return (
      <div className="border border-[var(--rule)] bg-cream/40 p-3 text-[12px] text-slate-body">
        <span className="font-semibold text-ink">Nurture sequences:</span> create
        one under{" "}
        <a href="/employer/automations?tab=sequences" className="text-heritage-deep underline">
          Automations → Drip sequences
        </a>{" "}
        to start dripping re-engagement emails to a candidate.
      </div>
    );
  }

  return (
    <div className="border border-[var(--rule)] bg-card p-3">
      <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5 inline-flex items-center gap-1.5">
        <Mail className="h-3 w-3" /> Nurture sequence
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
          disabled={pending}
          className="flex-1 min-w-[180px] px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage"
        >
          {sequences.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.stepCount} step{s.stepCount === 1 ? "" : "s"})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={start}
          disabled={pending || !picked}
          className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
          Start sequence
        </button>
      </div>
      {error && (
        <div className="mt-2 text-[12px] text-danger flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> {error}
        </div>
      )}
    </div>
  );
}
