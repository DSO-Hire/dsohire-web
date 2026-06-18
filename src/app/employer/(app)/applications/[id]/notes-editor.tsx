"use client";

import { useActionState } from "react";
import { saveEmployerNotes, type ActionState } from "./actions";

const initial: ActionState = { ok: false };

export function NotesEditor({
  applicationId,
  initialValue,
}: {
  applicationId: string;
  initialValue: string;
}) {
  const [state, action, pending] = useActionState(saveEmployerNotes, initial);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="application_id" value={applicationId} />
      <textarea
        name="employer_notes"
        defaultValue={initialValue}
        rows={5}
        placeholder="Internal notes about this candidate. Only visible to your team."
        className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save Notes"}
        </button>
        {state.error && (
          <span className="text-[13px] text-red-700">{state.error}</span>
        )}
        {state.ok && state.message && (
          <span className="text-[13px] text-heritage-deep font-semibold">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
