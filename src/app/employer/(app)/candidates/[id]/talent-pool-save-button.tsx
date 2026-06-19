"use client";

/**
 * Save-to-pool button used in the candidate detail header.
 * Mirrors the toggle pattern from the result-card; lives in a separate
 * file so the parent page can stay a server component.
 */

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import {
  saveCandidateToPool,
  removeCandidateFromPool,
} from "@/app/employer/(app)/talent-pool/actions";

interface TalentPoolSaveButtonProps {
  candidateId: string;
  initialEntryId: string | null;
}

export function TalentPoolSaveButton({
  candidateId,
  initialEntryId,
}: TalentPoolSaveButtonProps) {
  const [entryId, setEntryId] = useState<string | null>(initialEntryId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const saved = entryId !== null;

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      if (saved && entryId) {
        const res = await removeCandidateFromPool(entryId);
        if (!res.ok) {
          setError(res.error ?? "Couldn't remove.");
          return;
        }
        setEntryId(null);
      } else {
        const res = await saveCandidateToPool(candidateId);
        if (!res.ok) {
          setError(res.error ?? "Couldn't save.");
          return;
        }
        setEntryId(res.entryId ?? null);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        className={
          "inline-flex items-center gap-2 px-4 py-2.5 text-[12px] font-bold tracking-[1.5px] uppercase border transition-colors disabled:opacity-60 " +
          (saved
            ? "bg-heritage text-primary-foreground border-heritage hover:bg-heritage-deep"
            : "bg-card text-ink border-border hover:bg-cream")
        }
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : saved ? (
          <BookmarkCheck className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <Bookmark className="h-3.5 w-3.5" aria-hidden />
        )}
        {saved ? "Saved to pool" : "Save to pool"}
      </button>
      {error && (
        <div className="text-[11px] text-danger">{error}</div>
      )}
    </div>
  );
}
