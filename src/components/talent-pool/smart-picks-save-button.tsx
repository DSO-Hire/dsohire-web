"use client";

/**
 * Inline save-to-pool toggle used inside Smart Picks rows.
 * Smaller variant than the candidate-detail-page button.
 */

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import {
  saveCandidateToPool,
  removeCandidateFromPool,
} from "@/app/employer/(app)/talent-pool/actions";

interface SmartPicksSaveButtonProps {
  candidateId: string;
  initialEntryId: string | null;
}

export function SmartPicksSaveButton({
  candidateId,
  initialEntryId,
}: SmartPicksSaveButtonProps) {
  const [entryId, setEntryId] = useState<string | null>(initialEntryId);
  const [pending, startTransition] = useTransition();
  const saved = entryId !== null;

  function handleToggle() {
    startTransition(async () => {
      if (saved && entryId) {
        const res = await removeCandidateFromPool(entryId);
        if (res.ok) setEntryId(null);
      } else {
        const res = await saveCandidateToPool(candidateId);
        if (res.ok) setEntryId(res.entryId ?? null);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={pending}
      className={
        "inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold tracking-[1.5px] uppercase border transition-colors disabled:opacity-60 " +
        (saved
          ? "bg-heritage text-ivory border-heritage hover:bg-heritage-deep"
          : "bg-white text-ink border-slate-300 hover:bg-cream")
      }
    >
      {pending ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : saved ? (
        <BookmarkCheck className="h-2.5 w-2.5" />
      ) : (
        <Bookmark className="h-2.5 w-2.5" />
      )}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
