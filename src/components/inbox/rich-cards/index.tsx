"use client";

/**
 * RichCard renderer registry — picks a card component based on
 * payload.kind. Used by MessagesThread when message.kind === 'rich_card'.
 *
 * Each card is a small, brand-aligned inline component sitting where a
 * regular text bubble would. The intent is to surface meaningful events
 * (offer sent, interview proposed/booked, reference completed, document
 * shared) RIGHT IN the thread instead of forcing the recipient to leave
 * for email + a separate audit page.
 */

import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  XCircle,
  Calendar,
  CalendarCheck,
  UserCheck,
  Paperclip,
} from "lucide-react";
import {
  parseRichCardPayload,
  type RichCardPayload,
  type OfferLetterCardPayload,
  type InterviewProposalCardPayload,
  type InterviewBookedCardPayload,
  type ReferenceCompletedCardPayload,
  type DocumentSharedCardPayload,
} from "@/lib/inbox/rich-card-types";

interface RichCardRendererProps {
  /** Raw payload from application_messages.payload — narrowed inside. */
  payload: unknown;
  /** Audience viewing the card — drives copy + which CTAs render. */
  audience: "candidate" | "employer";
}

export function RichCardRenderer({ payload, audience }: RichCardRendererProps) {
  const card = parseRichCardPayload(payload);
  if (!card) return <UnknownCard />;
  switch (card.kind) {
    case "offer_letter":
      return <OfferLetterCard payload={card} audience={audience} />;
    case "interview_proposal":
      return <InterviewProposalCard payload={card} audience={audience} />;
    case "interview_booked":
      return <InterviewBookedCard payload={card} />;
    case "reference_completed":
      return <ReferenceCompletedCard payload={card} />;
    case "document_shared":
      return <DocumentSharedCard payload={card} />;
    default:
      // Exhaustiveness check — TS would catch a missing case at compile time.
      return <UnknownCard />;
  }
}

/* ─────────────────────────────────────────────────────────────
 * Shared chrome — every card sits in the same border/padding so
 * the thread reads consistently regardless of card kind.
 * ───────────────────────────────────────────────────────────── */

interface CardShellProps {
  eyebrow: string;
  eyebrowIcon: typeof CheckCircle2;
  accent: "heritage" | "ink" | "slate";
  children: React.ReactNode;
}

function CardShell({ eyebrow, eyebrowIcon: Icon, accent, children }: CardShellProps) {
  const eyebrowColor =
    accent === "heritage"
      ? "text-heritage-deep"
      : accent === "ink"
        ? "text-ink"
        : "text-slate-body";
  const borderColor =
    accent === "heritage"
      ? "border-heritage/30"
      : accent === "ink"
        ? "border-[var(--rule-strong)]"
        : "border-[var(--rule)]";
  return (
    <div className={`border ${borderColor} bg-cream/40 p-4 max-w-[520px]`}>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon className={`size-3.5 ${eyebrowColor}`} aria-hidden />
        <span className={`text-[10px] font-bold tracking-[2px] uppercase ${eyebrowColor}`}>
          {eyebrow}
        </span>
      </div>
      {children}
    </div>
  );
}

function UnknownCard() {
  return (
    <CardShell eyebrow="Unsupported card" eyebrowIcon={FileText} accent="slate">
      <p className="text-[13px] text-slate-body">
        This message couldn&apos;t be rendered. Please refresh the page.
      </p>
    </CardShell>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Offer letter — the marquee card.
 *
 * Employer side: shows a sent-confirmation + status mirror.
 * Candidate side: shows Accept / Decline CTAs that link to /o/[token]
 * for the audit-grade response capture (signed name, IP, UA). The /o
 * page is the source of truth — the card surfaces the entry point
 * without duplicating the audit logic.
 * ───────────────────────────────────────────────────────────── */

function OfferLetterCard({
  payload,
  audience,
}: {
  payload: OfferLetterCardPayload;
  audience: "candidate" | "employer";
}) {
  const responseUrl = `/o/${payload.response_token}`;
  const isAccepted = payload.status === "accepted";
  const isDeclined = payload.status === "declined";
  const isPending = payload.status === "sent";

  return (
    <CardShell
      eyebrow={
        isAccepted
          ? "Offer accepted"
          : isDeclined
            ? "Offer declined"
            : "Offer letter"
      }
      eyebrowIcon={isAccepted ? CheckCircle2 : isDeclined ? XCircle : FileText}
      accent={isAccepted ? "heritage" : isDeclined ? "slate" : "ink"}
    >
      <div className="text-[14.5px] font-semibold text-ink mb-1.5 leading-snug">
        {payload.subject}
      </div>
      <p className="text-[13px] text-slate-body leading-[1.55] mb-3">
        {payload.preview}
      </p>

      {audience === "candidate" && isPending && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={responseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 bg-ink text-ivory px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
          >
            <CheckCircle2 className="size-3.5" />
            Review & Accept
          </Link>
          <Link
            href={responseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 bg-transparent border border-[var(--rule-strong)] text-ink px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-cream transition-colors"
          >
            Review & Decline
          </Link>
        </div>
      )}

      {audience === "candidate" && !isPending && (
        <p className="text-[12px] text-slate-meta italic">
          You {payload.status} this offer. The hiring team has been notified.
        </p>
      )}

      {audience === "employer" && (
        <div className="text-[12px] text-slate-meta">
          {isPending && "Awaiting candidate response."}
          {isAccepted && "The candidate accepted this offer."}
          {isDeclined && "The candidate declined this offer."}
          {/* The full audit (signed name, timestamp, IP/UA) lives on the
              employer application detail page, reachable via the clickable
              job title in the thread header. Not linking the candidate
              splash page (/o/[token]) from here — that's candidate-only. */}
        </div>
      )}
    </CardShell>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Interview proposal / booked / reference / document — lightweight
 * v1 renderers. Each shows the key facts + a deeplink where useful.
 * Future passes can add inline pick-a-slot UX etc.
 * ───────────────────────────────────────────────────────────── */

function InterviewProposalCard({
  payload,
  audience,
}: {
  payload: InterviewProposalCardPayload;
  audience: "candidate" | "employer";
}) {
  const slotsLabel = payload.offered_slots
    .map((iso) => new Date(iso).toLocaleString())
    .join(" · ");
  const eyebrow =
    payload.status === "booked"
      ? "Interview slot booked"
      : payload.status === "withdrawn"
        ? "Interview withdrawn"
        : "Interview proposed";
  return (
    <CardShell eyebrow={eyebrow} eyebrowIcon={Calendar} accent="ink">
      {payload.job_title && (
        <div className="text-[14px] font-semibold text-ink mb-1.5">
          {payload.job_title}
        </div>
      )}
      {payload.offered_slots.length > 0 && (
        <p className="text-[13px] text-slate-body leading-[1.55] mb-2">
          <span className="font-semibold text-ink">Times offered:</span>{" "}
          {slotsLabel}
        </p>
      )}
      {payload.message && (
        <p className="text-[13px] text-slate-body leading-[1.55] mb-2 italic">
          &ldquo;{payload.message}&rdquo;
        </p>
      )}
      {audience === "candidate" && payload.status === "proposed" && (
        <p className="text-[12px] text-slate-meta">
          Tap your dashboard to pick a slot.
        </p>
      )}
    </CardShell>
  );
}

function InterviewBookedCard({ payload }: { payload: InterviewBookedCardPayload }) {
  const when = new Date(payload.start_at).toLocaleString();
  return (
    <CardShell
      eyebrow="Interview booked"
      eyebrowIcon={CalendarCheck}
      accent="heritage"
    >
      <p className="text-[14px] font-semibold text-ink mb-1.5">{when}</p>
      <p className="text-[13px] text-slate-body leading-[1.55]">
        {payload.duration_minutes}-minute {payload.interview_kind} interview
        {payload.location_text ? ` · ${payload.location_text}` : ""}.
      </p>
    </CardShell>
  );
}

function ReferenceCompletedCard({
  payload,
}: {
  payload: ReferenceCompletedCardPayload;
}) {
  const when = new Date(payload.submitted_at).toLocaleDateString();
  return (
    <CardShell
      eyebrow="Reference received"
      eyebrowIcon={UserCheck}
      accent="heritage"
    >
      <p className="text-[13px] text-slate-body leading-[1.55]">
        <span className="font-semibold text-ink">
          {payload.reference_display_name}
        </span>{" "}
        submitted a response on {when}.
      </p>
    </CardShell>
  );
}

function DocumentSharedCard({ payload }: { payload: DocumentSharedCardPayload }) {
  const sizeKb = Math.max(1, Math.round(payload.size_bytes / 1024));
  return (
    <CardShell eyebrow="Document shared" eyebrowIcon={Paperclip} accent="slate">
      <p className="text-[14px] font-semibold text-ink mb-1 truncate">
        {payload.file_name}
      </p>
      <p className="text-[12px] text-slate-meta mb-2">
        {payload.mime_type} · {sizeKb} KB
      </p>
      {payload.note && (
        <p className="text-[13px] text-slate-body leading-[1.55] italic">
          &ldquo;{payload.note}&rdquo;
        </p>
      )}
      <p className="text-[12px] text-slate-meta mt-2">
        See attachment below to download.
      </p>
    </CardShell>
  );
}
