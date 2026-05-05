/**
 * MyApplicationStages — candidate-side personal kanban-lite.
 *
 * Five-column view of the candidate's applications grouped by current
 * stage. Each card shows role, DSO, an optional badge (new message /
 * waiting on you / offer extended), and a relative timestamp.
 *
 * Important UX rule (locked 2026-05-05 with Cam): we deliberately do
 * NOT show "days waiting in stage" on the candidate side. Showing
 * "stuck in Reviewed for 14 days" to the candidate adds anxiety
 * without giving them anything actionable. Stage badge yes,
 * time-in-stage no.
 *
 * Stage labels use the candidate-friendly STAGE_LABELS (e.g.
 * "Reviewed" → "Screening", "rejected" → "Not selected"). Internal
 * jargon stays internal.
 *
 * When the per-job stage-visibility toggle is ON for a job, the card
 * for that application renders an abstracted "In review" stage in
 * place of the specific employer pipeline stage. The card *position*
 * in the kanban still uses the real stage so the layout makes sense,
 * but the visible label respects the employer's preference.
 */

import Link from "next/link";
import { MessageCircle, Reply, Star } from "lucide-react";

export interface MyApplicationCard {
  id: string;
  /** Job title at the DSO. */
  role: string;
  /** DSO name for the badge below the role. */
  dsoName: string;
  /** Optional location label appended to the DSO line. */
  locationName?: string | null;
  /** Current stage (kanban key). */
  stage: "new" | "reviewed" | "interviewing" | "offered" | "hired";
  /** Days since the candidate applied. Used only for the "Applied Xd ago" timestamp on Submitted column cards — never to flag staleness. */
  daysSinceApplied: number;
  /** When true, the candidate has unread messages from the employer on this app. */
  hasUnreadMessage?: boolean;
  /** When true, an action is required from the candidate (e.g., interview to confirm, info requested). */
  needsCandidateAction?: boolean;
  /** When true, an offer was extended and is pending decision. */
  offerPending?: boolean;
  /** Direct link to the candidate's view of this application. */
  href: string;
  /** When the employer has hidden stages for this job, render the badge as "In review" instead of the explicit stage. */
  hideStageBadge?: boolean;
}

interface MyApplicationStagesProps {
  cards: MyApplicationCard[];
  /** Title eyebrow. */
  title?: string;
  /** Subtitle one-liner. */
  subtitle?: string;
  /** Click-through to the full applications list. */
  viewAllHref?: string;
}

const STAGE_COLUMNS = [
  { key: "new" as const, label: "Submitted" },
  { key: "reviewed" as const, label: "Reviewed" },
  { key: "interviewing" as const, label: "Interview" },
  { key: "offered" as const, label: "Offer" },
  { key: "hired" as const, label: "Hired" },
];

export function MyApplicationStages({
  cards,
  title = "My Application Stages",
  subtitle = "Where each of your active applications sits, right now.",
  viewAllHref = "/candidate/applications",
}: MyApplicationStagesProps) {
  const grouped = STAGE_COLUMNS.map((col) => ({
    ...col,
    cards: cards.filter((c) => c.stage === col.key),
  }));

  return (
    <div className="bg-white border border-[var(--rule)] p-5 sm:p-7">
      <header className="flex items-baseline justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h2 className="text-[11px] font-extrabold tracking-[2.5px] uppercase text-heritage-deep">
            {title}
          </h2>
          <div className="text-[12px] text-slate-meta mt-1">{subtitle}</div>
        </div>
        <Link
          href={viewAllHref}
          className="text-[10px] font-extrabold tracking-[1.5px] uppercase text-heritage hover:text-heritage-deep transition-colors"
        >
          View all →
        </Link>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {grouped.map((col) => (
          <StageColumn key={col.key} label={col.label} cards={col.cards} />
        ))}
      </div>
    </div>
  );
}

/* ───── Subcomponents ───── */

function StageColumn({
  label,
  cards,
}: {
  label: string;
  cards: MyApplicationCard[];
}) {
  const isEmpty = cards.length === 0;
  return (
    <div className="flex flex-col">
      <div
        className={`pb-2 mb-2.5 flex items-center justify-between border-b-2 ${
          isEmpty ? "border-rule-strong" : "border-heritage"
        }`}
      >
        <div
          className={`text-[10px] font-extrabold tracking-[1.5px] uppercase ${
            isEmpty ? "text-slate-meta" : "text-heritage-deep"
          }`}
        >
          {label}
        </div>
        <span
          className={`text-[10px] font-extrabold tracking-[-0.2px] px-1.5 py-0.5 ${
            isEmpty
              ? "bg-cream text-slate-meta"
              : "bg-heritage text-ivory"
          }`}
        >
          {cards.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        {isEmpty ? (
          <div className="bg-cream text-center text-[11px] text-slate-meta px-3 py-5 leading-relaxed flex-1 grid place-items-center">
            Nothing here right now.
          </div>
        ) : (
          cards.map((card) => <Card key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

function Card({ card }: { card: MyApplicationCard }) {
  // Card border accent priority: offerPending → unread → action-needed → default.
  const accent = card.offerPending
    ? "border-l-heritage-light bg-heritage/5"
    : card.hasUnreadMessage
      ? "border-l-heritage"
      : card.needsCandidateAction
        ? "border-l-amber-700"
        : "border-l-rule-strong";

  return (
    <Link
      href={card.href}
      className={`block bg-cream hover:bg-ivory-deep transition-colors p-2.5 border-l-[3px] ${accent}`}
    >
      <div className="text-[12px] font-bold text-ink leading-tight truncate">
        {card.role}
      </div>
      <div className="text-[10px] text-slate-meta tracking-[0.3px] mt-0.5 truncate">
        {card.dsoName}
        {card.locationName && (
          <span className="text-slate-meta/80"> · {card.locationName}</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
        {card.offerPending ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-heritage text-ivory text-[9px] font-bold tracking-[0.5px] uppercase">
            <Star className="h-2.5 w-2.5" />
            Offer extended
          </span>
        ) : card.hasUnreadMessage ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-heritage text-ivory text-[9px] font-bold tracking-[0.5px] uppercase">
            <MessageCircle className="h-2.5 w-2.5" />
            New message
          </span>
        ) : card.needsCandidateAction ? (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold tracking-[0.5px] uppercase">
            <Reply className="h-2.5 w-2.5" />
            Waiting on you
          </span>
        ) : null}
        {card.stage === "new" && card.daysSinceApplied >= 0 && (
          <span className="text-[9px] text-slate-meta tracking-[0.3px]">
            Applied {timestampLabel(card.daysSinceApplied)}
          </span>
        )}
        {card.hideStageBadge && card.stage !== "new" && (
          <span className="text-[9px] text-slate-meta tracking-[0.3px] italic">
            In review
          </span>
        )}
      </div>
    </Link>
  );
}

/* ───── Helpers ───── */

function timestampLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}
