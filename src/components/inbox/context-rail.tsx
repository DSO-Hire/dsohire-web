"use client";

/**
 * <ContextRail> — the employer inbox's right-hand context column
 * (Lane 4 — Conversations 2.0, Model 02). Pure presentation: every
 * fact comes in through props, already RLS-scoped + anonymity-masked
 * upstream. xl-and-up only; the thread pane owns smaller widths.
 *
 * Honesty rules (register rule 7 family):
 *   • Journey steps show REAL dates from application_status_events —
 *     unreached stages render dimmed with no date, never a fake one.
 *   • Reply rhythm only renders when computed from ≥2 real reply gaps
 *     in THIS conversation.
 *   • The SMS card is explicitly dormant — "pending carrier approval",
 *     no working toggle, nothing implied to send.
 *   • Fit dial deliberately absent until fit scores ride the thread
 *     query (lane rider) — no placeholder number.
 */

import Link from "next/link";
import { ArrowUpRight, Clock, MapPin, MessageSquareOff } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { ThreadStageStep } from "@/lib/inbox/types";

/** Canonical forward path for the stepper. Terminal kinds (rejected /
 * withdrawn) render as a band below instead of a step. */
const JOURNEY_KINDS = ["open", "screen", "interview", "offer", "hired"] as const;

const JOURNEY_LABELS: Record<string, string> = {
  open: "Applied",
  screen: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function daysSince(iso: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  );
}

export interface ContextRailProps {
  applicationId: string;
  candidateName: string;
  avatarUrl: string | null;
  jobTitle: string;
  locationName: string | null;
  /** Current stage KIND from the thread (null when unknown). */
  stageKind: string | null;
  /** Stages this application has actually entered, with real dates. */
  journey: ThreadStageStep[];
  /** Pre-formatted candidate reply rhythm ("~2h"), or null to omit.
   * Computed by the owner from THIS thread's real messages. */
  replyRhythm: string | null;
  notesCount: number;
}

export function ContextRail({
  applicationId,
  candidateName,
  avatarUrl,
  jobTitle,
  locationName,
  stageKind,
  journey,
  replyRhythm,
  notesCount,
}: ContextRailProps) {
  const reachedByKind = new Map(journey.map((s) => [s.kind, s.at]));
  const terminal =
    stageKind === "rejected" || stageKind === "withdrawn" ? stageKind : null;
  const currentForwardKind = terminal ? null : stageKind;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-cream/30 px-4 py-4 space-y-4">
      {/* Identity */}
      <div className="flex items-start gap-3">
        <Avatar
          name={candidateName}
          imageUrl={avatarUrl}
          size="sm"
          className="shrink-0"
        />
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-ink leading-tight truncate">
            {candidateName}
          </p>
          <p className="text-[11px] text-slate-meta leading-snug">
            {jobTitle}
          </p>
          {locationName && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-meta">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{locationName}</span>
            </p>
          )}
          <Link
            href={`/employer/applications/${applicationId}`}
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-heritage-deep hover:text-ink underline-offset-2 hover:underline transition-colors"
          >
            Open application
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Reply rhythm — only when real samples exist */}
      {replyRhythm && (
        <div className="flex items-center gap-2 border border-[var(--rule)] bg-card px-3 py-2">
          <Clock className="h-3.5 w-3.5 text-heritage-deep shrink-0" aria-hidden />
          <p className="text-[11px] text-slate-body leading-snug">
            Replies in <span className="font-bold text-ink">{replyRhythm}</span>{" "}
            <span className="text-slate-meta">
              — based on this conversation
            </span>
          </p>
        </div>
      )}

      {/* Pipeline journey */}
      <div className="border border-[var(--rule)] bg-card px-3 py-3">
        <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep mb-2">
          Pipeline
        </p>
        <ol className="space-y-0">
          {JOURNEY_KINDS.map((kind, i) => {
            const at = reachedByKind.get(kind) ?? null;
            const isCurrent = currentForwardKind === kind;
            const isLast = i === JOURNEY_KINDS.length - 1;
            return (
              <li key={kind} className="relative flex items-start gap-2 pb-3 last:pb-0">
                {/* Connector */}
                {!isLast && (
                  <span
                    className={`absolute left-[5px] top-3.5 bottom-0 w-px ${
                      at ? "bg-heritage/50" : "bg-[var(--rule)]"
                    }`}
                    aria-hidden
                  />
                )}
                <span
                  className={`relative mt-1 h-[11px] w-[11px] rounded-full border-2 shrink-0 ${
                    isCurrent
                      ? "border-heritage-deep bg-heritage-deep"
                      : at
                        ? "border-heritage bg-heritage/30"
                        : "border-[var(--rule)] bg-card"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 flex items-baseline justify-between gap-2">
                  <span
                    className={`text-[12px] leading-tight ${
                      isCurrent
                        ? "font-bold text-ink"
                        : at
                          ? "font-semibold text-slate-body"
                          : "text-slate-meta"
                    }`}
                  >
                    {JOURNEY_LABELS[kind]}
                  </span>
                  <span className="text-[10px] text-slate-meta whitespace-nowrap">
                    {at
                      ? isCurrent
                        ? `${shortDate(at)} · ${daysSince(at)}d`
                        : shortDate(at)
                      : ""}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
        {terminal && (
          <p className="mt-2 border-t border-[var(--rule)] pt-2 text-[11px] font-semibold text-slate-meta">
            {JOURNEY_LABELS[terminal]}
            {reachedByKind.get(terminal)
              ? ` · ${shortDate(reachedByKind.get(terminal) as string)}`
              : ""}
          </p>
        )}
      </div>

      {/* Notes count — quiet pointer to the timeline's amber rows */}
      {notesCount > 0 && (
        <p className="text-[11px] text-slate-meta px-0.5">
          {notesCount} internal {notesCount === 1 ? "note" : "notes"} in this
          timeline — team-only.
        </p>
      )}

      {/* SMS — dormant until A2P approval */}
      <div className="border border-dashed border-[var(--rule)] bg-card/60 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
          <MessageSquareOff className="h-3 w-3 shrink-0" aria-hidden />
          SMS · pending approval
        </p>
        <p className="mt-1 text-[11px] text-slate-meta leading-snug">
          Once carrier (A2P) approval lands, texts will interleave into this
          same timeline — consent-gated per candidate.
        </p>
      </div>
    </div>
  );
}
