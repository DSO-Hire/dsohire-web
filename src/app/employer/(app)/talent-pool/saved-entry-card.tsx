"use client";

/**
 * Saved-tab row — candidate from the DSO's pool with notes, tags, and
 * a remove action. Click-through goes to the candidate detail page.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2, Loader2, Tag } from "lucide-react";
import { removeCandidateFromPool, updatePoolEntry } from "./actions";

interface SavedEntryCardProps {
  entryId: string;
  candidateId: string;
  fullName: string | null;
  headline: string | null;
  currentTitle: string | null;
  yearsExperience: number | null;
  avatarUrl: string | null;
  notes: string | null;
  tags: string[] | null;
  addedAt: string;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString();
}

export function SavedEntryCard({
  entryId,
  candidateId,
  fullName,
  headline,
  currentTitle,
  yearsExperience,
  avatarUrl,
  notes,
  tags,
  addedAt,
}: SavedEntryCardProps) {
  const [removed, setRemoved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draftNotes, setDraftNotes] = useState(notes ?? "");
  const [currentNotes, setCurrentNotes] = useState(notes);

  if (removed) return null;

  function handleRemove() {
    if (!confirm("Remove this candidate from the talent pool?")) return;
    setError(null);
    startTransition(async () => {
      const res = await removeCandidateFromPool(entryId);
      if (!res.ok) {
        setError(res.error ?? "Couldn't remove.");
        return;
      }
      setRemoved(true);
    });
  }

  function handleSaveNotes() {
    setError(null);
    startTransition(async () => {
      const res = await updatePoolEntry(entryId, {
        notes: draftNotes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save notes.");
        return;
      }
      setCurrentNotes(draftNotes.trim() || null);
      setEditingNotes(false);
    });
  }

  return (
    <div className="relative border border-[var(--rule)] bg-card p-4 flex items-start gap-4 transition-colors hover:border-heritage/50 hover:bg-cream/30">
      <Avatar fullName={fullName} avatarUrl={avatarUrl} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            {/* Overlay link — whole card clickable; the remove button and the
                notes editor below carry `relative z-10` to stay above it. */}
            <Link
              href={`/employer/candidates/${candidateId}`}
              className="text-[14px] font-bold text-ink hover:text-heritage-deep after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage/40"
            >
              {fullName ?? "Unnamed candidate"}
            </Link>
            <span className="ml-2 text-[11px] text-slate-meta">
              Added {timeAgo(addedAt)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="relative z-10 rounded-md p-1.5 text-meta-foreground hover:bg-danger-bg hover:text-danger disabled:opacity-50"
            aria-label="Remove from pool"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>

        {headline && (
          <div className="text-[13px] text-ink mb-1.5">{headline}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-meta mb-3">
          {currentTitle && <span>{currentTitle}</span>}
          {yearsExperience !== null && (
            <span>
              {yearsExperience} yr{yearsExperience === 1 ? "" : "s"} exp
            </span>
          )}
        </div>

        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-heritage-deep border border-[var(--rule)] bg-cream/60"
              >
                <Tag className="h-2.5 w-2.5" aria-hidden />
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="relative z-10 mt-2 border-t border-[var(--rule)] pt-3">
          <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
            Notes
          </div>
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={draftNotes}
                onChange={(e) => setDraftNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage resize-y"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={pending}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraftNotes(currentNotes ?? "");
                    setEditingNotes(false);
                  }}
                  className="text-[11px] font-semibold text-slate-meta hover:text-ink"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : currentNotes ? (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="text-[13px] text-ink leading-relaxed hover:bg-cream/40 px-2 py-1 -mx-2 rounded text-left whitespace-pre-wrap"
            >
              {currentNotes}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="text-[12px] text-slate-meta italic hover:text-heritage-deep"
            >
              + Add notes
            </button>
          )}
        </div>

        {error && (
          <div className="mt-2 text-[12px] text-danger">{error}</div>
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
    <div className="h-12 w-12 rounded-full bg-heritage text-primary-foreground flex items-center justify-center font-bold text-[14px] shrink-0">
      {initials || "?"}
    </div>
  );
}
