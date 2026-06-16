/**
 * CandidatePipelineBoard — Day 35 (Direction A v2.1). The candidate's
 * applications as a full-width board: Applied → Reviewed → Interviewing
 * → Offer → Hired. Replaces the KPI grid + journeys stepper as the
 * primary pipeline view on the dashboard.
 *
 * Locked candidate-side rules carried forward (same as ApplicationJourneys):
 *   • NO "days-in-stage" anywhere — the only clock is the candidate's own
 *     "applied X ago" (their action). 2026-05-05 rule.
 *   • hide_stages_from_candidate → the card collapses into the "Reviewed"
 *     (in-review) column; the employer's specific interview/screen stage
 *     never leaks via the column it sits in.
 *   • Canonical candidate funnel only — never per-DSO stage labels.
 *   • Honest status line per card: offer → unread message → real per-DSO
 *     median (≥5 sample gate, computed upstream) → silence.
 *   • Fit pills reflect the real PracticeFit/DSOFit score; weak buckets
 *     show a plain "Fit NN" rather than a celebratory label.
 *
 * Server-rendered — cards are links, no client state.
 */

import Link from "next/link";
import { Check, MessageCircle, Star } from "lucide-react";
import type { FitBucket } from "@/lib/practice-fit/types";

export interface BoardCard {
  id: string;
  /** Job title. */
  role: string;
  /** Masked-safe DSO display name (affiliation resolver output). */
  dsoName: string;
  locationName?: string | null;
  stage: "open" | "screen" | "interview" | "offer" | "hired";
  /** Days since the candidate applied (their own action — allowed). */
  daysSinceApplied: number;
  /** Employer's per-job stage-visibility toggle. */
  hideStages: boolean;
  hasUnreadMessage: boolean;
  offerPending: boolean;
  /** Real per-practice median days-to-first-response, or null (gated). */
  medianResponseDays: number | null;
  /** PracticeFit/DSOFit score 0–100, or null when not scored. */
  fitScore: number | null;
  fitBucket: FitBucket | null;
  href: string;
}

type ColTone = "wait" | "move" | "you" | "done";

const COLUMNS: ReadonlyArray<{
  kind: BoardCard["stage"];
  label: string;
  tone: ColTone;
}> = [
  { kind: "open", label: "Applied", tone: "wait" },
  { kind: "screen", label: "Reviewed", tone: "wait" },
  { kind: "interview", label: "Interviewing", tone: "move" },
  { kind: "offer", label: "Offer", tone: "you" },
  { kind: "hired", label: "Hired", tone: "done" },
];

const DOT: Record<ColTone, string> = {
  wait: "bg-[#c4b59a]",
  move: "bg-heritage",
  you: "bg-amber-500",
  done: "bg-heritage-deep",
};

// hide_stages collapses screen + interview into the "Reviewed" (in-review)
// column so the employer's specific stage never leaks via card placement.
function columnFor(c: BoardCard): BoardCard["stage"] {
  if (c.hideStages && (c.stage === "screen" || c.stage === "interview")) {
    return "screen";
  }
  return c.stage;
}

export function CandidatePipelineBoard({ cards }: { cards: BoardCard[] }) {
  const byCol = new Map<BoardCard["stage"], BoardCard[]>();
  for (const col of COLUMNS) byCol.set(col.kind, []);
  for (const c of cards) byCol.get(columnFor(c))?.push(c);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-start">
      {COLUMNS.map((col) => {
        const items = byCol.get(col.kind) ?? [];
        return (
          <div
            key={col.kind}
            className="rounded-xl border border-[var(--rule)] bg-white p-2.5 min-h-[120px]"
          >
            <div className="flex items-center gap-2 px-1.5 pb-2.5 pt-1">
              <span className={`h-2 w-2 rounded-full ${DOT[col.tone]}`} />
              <span className="text-[11px] font-extrabold tracking-[1.2px] uppercase text-slate-meta">
                {col.label}
              </span>
              <span className="ml-auto grid h-5 min-w-[20px] place-items-center rounded-full border border-[var(--rule)] bg-white px-1 text-[11px] font-semibold text-ink">
                {items.length}
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              {items.length === 0 ? (
                <p className="px-1.5 py-3 text-center text-[11px] leading-relaxed text-slate-meta/80">
                  {col.kind === "hired"
                    ? "Nothing here yet — your story isn’t finished."
                    : "—"}
                </p>
              ) : (
                items.map((c) => <BoardCardItem key={c.id} card={c} tone={col.tone} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ───── card ───── */

function BoardCardItem({ card: c, tone }: { card: BoardCard; tone: ColTone }) {
  const status = statusFor(c);
  const isOffer = tone === "you";
  return (
    <Link
      href={c.href}
      className={`block rounded-lg border p-3 shadow-[0_1px_3px_rgba(11,35,64,0.07)] transition-shadow hover:shadow-[0_8px_24px_rgba(11,35,64,0.12)] ${
        isOffer
          ? "border-amber-300 bg-amber-50/50"
          : "border-[var(--rule)] bg-cream/40"
      }`}
    >
      <div className="text-[13.5px] font-bold leading-tight text-ink">
        {c.role}
      </div>
      <div className="mt-0.5 text-[11.5px] text-slate-meta">
        {c.dsoName}
        {c.locationName ? ` · ${c.locationName}` : ""}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <FitPill score={c.fitScore} bucket={c.fitBucket} />
        <span className="text-[11px] text-slate-meta">
          applied {appliedLabel(c.daysSinceApplied)}
        </span>
      </div>
      {status && (
        <div
          className={`mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-snug ${
            status.tone === "you"
              ? "font-semibold text-amber-700"
              : status.tone === "move"
                ? "font-semibold text-heritage-deep"
                : "text-slate-body"
          }`}
        >
          {status.Icon && (
            <status.Icon className="mt-px h-3 w-3 shrink-0" aria-hidden />
          )}
          <span>{status.text}</span>
        </div>
      )}
    </Link>
  );
}

function FitPill({
  score,
  bucket,
}: {
  score: number | null;
  bucket: FitBucket | null;
}) {
  if (score == null || bucket == null) return null;
  const excellent = bucket === "excellent";
  const strong = bucket === "strong";
  const solid = bucket === "solid";
  const cls = excellent
    ? "bg-ink text-ivory"
    : strong
      ? "bg-heritage/12 text-heritage-deep"
      : "bg-slate-100 text-slate-600";
  const word = excellent
    ? "Excellent fit"
    : strong
      ? "Strong fit"
      : solid
        ? "Solid fit"
        : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${cls}`}
    >
      {(excellent || strong) && <span aria-hidden>✦</span>}
      {word ? `${word} · ${score}` : `Fit ${score}`}
    </span>
  );
}

/* ───── helpers ───── */

type Status = {
  text: string;
  tone: ColTone;
  Icon?: React.ComponentType<{ className?: string }>;
};

function statusFor(c: BoardCard): Status | null {
  if (c.offerPending) {
    return { text: "Offer extended — your move", tone: "you", Icon: Star };
  }
  if (c.hasUnreadMessage) {
    return {
      text: "New message from the hiring team",
      tone: "move",
      Icon: MessageCircle,
    };
  }
  if ((c.stage === "open" || c.stage === "screen") && c.medianResponseDays != null) {
    // Follow-up coach: once the wait exceeds the practice's own typical
    // reply window, turn waiting into agency (a supportive nudge, not a
    // day-counter — uses the candidate's applied date, never stage dwell).
    if (c.daysSinceApplied > c.medianResponseDays) {
      return {
        text: `Longer than their typical ~${c.medianResponseDays}-day reply — a polite follow-up is fair now.`,
        tone: "move",
      };
    }
    return {
      text: `In review — typically replies in ~${c.medianResponseDays} day${
        c.medianResponseDays === 1 ? "" : "s"
      }`,
      tone: "wait",
    };
  }
  if (c.stage === "hired") {
    return { text: "Hired — congratulations.", tone: "done", Icon: Check };
  }
  return null;
}

function appliedLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
