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
import { CERTIFICATION_KINDS } from "@/lib/candidate/canonical-lists";
import { Tag, type TagTone } from "@/components/brand/tag";

const CERT_LABEL: Record<string, string> = Object.fromEntries(
  CERTIFICATION_KINDS.map((c) => [c.value, c.label])
);

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
  /** PMS systems the candidate has experience with (dental facet). */
  pmsSystems?: string[] | null;
  /** Certification kinds the candidate has furnished (dental facet). */
  certKinds?: string[];
  /** PracticeFit score against the picked job; null when no job picked. */
  fitScore?: number | null;
  /** PracticeFit bucket against the picked job; null when no job picked. */
  fitBucket?:
    | "excellent"
    | "strong"
    | "solid"
    | "light"
    | "low"
    | null;
}

const FIT_BUCKET_LABEL: Record<string, string> = {
  excellent: "Excellent fit",
  strong: "Strong fit",
  solid: "Solid fit",
  light: "Light fit",
  low: "Low fit",
};

const FIT_BUCKET_TONE: Record<string, TagTone> = {
  excellent: "heritage",
  strong: "success",
  solid: "info",
  light: "warning",
  low: "neutral",
};

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
  pmsSystems = null,
  certKinds = [],
  fitScore = null,
  fitBucket = null,
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
    <div className="relative border border-[var(--rule)] bg-card p-4 flex items-start gap-4 transition-colors hover:border-heritage/50 hover:bg-cream/30">
      <Avatar fullName={fullName} avatarUrl={avatarUrl} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1">
          {/* Overlay link — makes the whole card clickable. Interactive
              controls below carry `relative z-10` to stay above it. */}
          <Link
            href={`/employer/candidates/${candidateId}`}
            className="text-sm font-bold text-ink hover:text-heritage-deep truncate after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage/40"
          >
            {fullName ?? "Unnamed candidate"}
          </Link>
          <button
            type="button"
            onClick={handleToggle}
            disabled={pending}
            className={
              "relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border transition-colors shrink-0 disabled:opacity-60 " +
              (saved
                ? "bg-heritage text-primary-foreground border-heritage hover:bg-heritage-deep"
                : "bg-card text-ink border-border hover:bg-cream")
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

        {(fitScore !== null && fitBucket) && (
          <div className="mb-1.5">
            <Tag tone={FIT_BUCKET_TONE[fitBucket] ?? "neutral"} accent>
              <span className="tabular">{fitScore}</span>
              <span aria-hidden>·</span>
              <span>{FIT_BUCKET_LABEL[fitBucket] ?? "Fit"}</span>
            </Tag>
          </div>
        )}
        {headline && (
          <div className="text-xs text-ink mb-1.5">{headline}</div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-meta">
          {currentTitle && <span>{currentTitle}</span>}
          {yearsExperience !== null && (
            <span className="tabular">
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
            <span className="text-ink font-semibold">
              {AVAILABILITY_LABELS[availability]}
            </span>
          )}
        </div>

        {((pmsSystems && pmsSystems.length > 0) || certKinds.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(pmsSystems ?? []).slice(0, 4).map((p) => (
              <span
                key={`pms-${p}`}
                className="inline-flex items-center px-2 py-0.5 bg-cream border border-[var(--rule-strong)] text-2xs font-semibold tracking-[0.3px] text-ink"
              >
                {p}
              </span>
            ))}
            {certKinds.slice(0, 5).map((k) => (
              <span
                key={`cert-${k}`}
                className="inline-flex items-center px-2 py-0.5 bg-cream border border-[var(--rule-strong)] text-2xs font-semibold tracking-[0.3px] text-ink"
              >
                {CERT_LABEL[k] ?? k}
              </span>
            ))}
          </div>
        )}

        {error && (
          <div className="mt-2 text-xs text-danger">{error}</div>
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
    <div className="h-12 w-12 rounded-full bg-heritage text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">
      {initials || "?"}
    </div>
  );
}
