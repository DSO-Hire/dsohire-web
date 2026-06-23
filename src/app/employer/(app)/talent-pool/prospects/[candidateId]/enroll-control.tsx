"use client";

/**
 * Manual prospect sequence enroll (Sourcing CRM Phase 3). Scale+ gated in the
 * action; this is just the picker.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollProspectInSequence } from "@/lib/sequences/actions";

export function EnrollControl({
  candidateId,
  sequences,
}: {
  candidateId: string;
  sequences: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [sequenceId, setSequenceId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (sequences.length === 0) return null;

  function enroll() {
    if (!sequenceId || pending) return;
    setMsg(null);
    startTransition(async () => {
      const res = await enrollProspectInSequence(candidateId, sequenceId);
      setMsg(res.ok ? "Enrolled in sequence." : res.error ?? "Couldn't enroll.");
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-slate-meta">
        Nurture
      </span>
      <select
        value={sequenceId}
        onChange={(e) => setSequenceId(e.target.value)}
        className="rounded border border-[var(--rule)] bg-card px-2 py-1.5 text-[13px] text-ink"
      >
        <option value="">Add to sequence…</option>
        {sequences.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={enroll}
        disabled={pending || !sequenceId}
        className="border border-heritage-deep px-3 py-1.5 text-[12px] font-bold uppercase tracking-[1px] text-heritage-deep hover:bg-cream/60 disabled:opacity-40"
      >
        Enroll
      </button>
      {msg && <span className="text-[12px] text-slate-body">{msg}</span>}
    </div>
  );
}
