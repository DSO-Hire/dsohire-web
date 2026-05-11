"use client";

/**
 * Result row on the Discover tab. Click-through goes to the candidate
 * detail page; the inline "Save to pool" / "Saved" button is a client
 * action that doesn't navigate.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import {
  saveCandidateToPool,
  removeCandidateFromPool,
} from "./actions";

interface CandidateResultCardProps {
  candidateId: string;
  fullName: string | null;
  headline: string | null;
  currentTitle: string | null;
  yearsExperience: number | null;
  avatarUrl: string | null;
  licenseStates: string[] | null;
  cityState: string;
  availability: string | null;
  initiallySaved: boolean;
  initialEntryId: string | null;
}

const AVAILABILITY_LABELS: Record<string, string> = {
  immediate: "Available immediately",
  "2_weeks": "Two-week notice",
  "1_month": "One-month notice",
  passive: "Passive — open to fits",
};

export function CandidateResultCard({
  candidateId,
  fullName,
  headline,
  currentTitle,
  yearsExperience,
  avatarUrl,
  licenseStates,
  cityState,
  availability,
  initiallySaved,
  initialEntryId,
}: CandidateResultCardProps) {
  const [saved, setSaved] = useState(initiallySaved);
  const [entryId, setEntryId] = useState<string | null>(initialEntryId);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      if (saved && entryId) {
        const res = await removeCandidateFromPool(entryId);
        if (!res.ok) {
          setError(res.error ?? "Couldn't remove.");
          return;
        }
        setSaved(false);
        setEntryId(null);
      } else {
        const res = await saveCandidateToPool(candidateId);
        if (!res.ok) {
          setError(res.error ?? "Couldn't save.");
          return;
        }
        setSaved(true);
        setEntryId(res.entryId ?? null);
      }
    });
  }

  return (
    <div className="border border-[var(--rule)] bg-white p-4 flex items-start gap-4">
      <Avatar fullName={fullName} avatarUrl={avatarUrl} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <Link
            href={`/employer/candidates/${candidateId}`}
            className="text-[14px] font-bold text-ink hover:text-heritage-deep truncate"
          >
            {fullName ?? "Unnamed candidate"}
          </Link>
          <button
            type="button"
            onClick={handleToggle}
            disabled={pending}
            className={
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-[1.5px] uppercase border transition-colors shrink-0 disabled:opacity-60 " +
              (saved
                ? "bg-heritage text-ivory border-heritage hover:bg-heritage-deep"
                : "bg-white text-ink border-slate-300 hover:bg-cream")
            }
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : saved ? (
              <BookmarkCheck className="h-3 w-3" aria-hidden />
            ) : (
              <Bookmark className="h-3 w-3" aria-hidden />
            )}
            {saved ? "Saved" : "Save to pool"}
          </button>
        </div>

        {headline && (
          <div className="text-[13px] text-ink mb-1.5">{headline}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-meta">
          {currentTitle && <span>{currentTitle}</span>}
          {yearsExperience !== null && (
            <span>
              {yearsExperience} yr{yearsExperience === 1 ? "" : "s"} exp
            </span>
          )}
          {cityState && <span>{cityState}</span>}
          {licenseStates && licenseStates.length > 0 && (
            <span>
              Licensed: {licenseStates.slice(0, 4).join(", ")}
              {licenseStates.length > 4 ? ` +${licenseStates.length - 4}` : ""}
            </span>
          )}
          {availability && AVAILABILITY_LABELS[availability] && (
            <span className="text-heritage-deep font-semibold">
              {AVAILABILITY_LABELS[availability]}
            </span>
          )}
        </div>

        {error && (
          <div className="mt-2 text-[12px] text-red-700">{error}</div>
        )}
      </div>
    </div>
  );
}

function Avatar({
  fullName,
  avatarUrl,
}: {
  fullName: string | null;
  avatarUrl: string | null;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="h-12 w-12 rounded-full object-cover bg-cream shrink-0"
      />
    );
  }
  const initials = (fullName ?? "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <div className="h-12 w-12 rounded-full bg-heritage text-ivory flex items-center justify-center font-bold text-[14px] shrink-0">
      {initials || "?"}
    </div>
  );
}
