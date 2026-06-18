"use client";

/**
 * AssigneePicker — manual "assigned teammate" control on the application
 * detail page (internal workspace). Mirrors what the N13 `assign` automation
 * action sets; here a recruiter can set/clear it by hand. Optimistic select
 * with a transition; reverts the visible value on error.
 */

import { useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { assignApplication } from "./assign-actions";

interface Teammate {
  id: string;
  name: string;
}

export function AssigneePicker({
  applicationId,
  teammates,
  current,
}: {
  applicationId: string;
  teammates: Teammate[];
  current: string | null;
}) {
  const [value, setValue] = useState<string>(current ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function change(next: string) {
    const prev = value;
    setValue(next);
    setErr(null);
    start(async () => {
      const res = await assignApplication(applicationId, next || null);
      if (!res.ok) {
        setErr(res.error);
        setValue(prev);
      }
    });
  }

  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[1.5px] text-slate-meta">
        <UserRound className="h-3 w-3" strokeWidth={2.5} />
        Assigned to
      </label>
      <select
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="w-full max-w-xs rounded border border-[var(--rule-strong)] bg-cream px-3 py-2 text-[14px] text-ink focus:border-heritage focus:outline-none disabled:opacity-50"
      >
        <option value="">Unassigned</option>
        {teammates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {err && <p className="mt-1 text-[12px] text-rose-600">{err}</p>}
    </div>
  );
}
