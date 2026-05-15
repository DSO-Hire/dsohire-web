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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  FileText,
  XCircle,
  Calendar,
  CalendarCheck,
  UserCheck,
  Paperclip,
  Loader2,
} from "lucide-react";
import {
  parseRichCardPayload,
  type OfferLetterCardPayload,
  type InterviewProposalCardPayload,
  type InterviewBookedCardPayload,
  type ReferenceCompletedCardPayload,
  type DocumentSharedCardPayload,
} from "@/lib/inbox/rich-card-types";
import { bookInterviewSlot } from "@/lib/interviews/actions";

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bookingOptionId, setBookingOptionId] = useState<string | null>(null);

  const eyebrow =
    payload.status === "booked"
      ? "Interview slot booked"
      : payload.status === "withdrawn"
        ? "Interview withdrawn"
        : "Interview proposed";

  const handleBook = (optionId: string): void => {
    if (pending) return;
    setError(null);
    setBookingOptionId(optionId);
    startTransition(async () => {
      const result = await bookInterviewSlot({
        proposalId: payload.proposal_id,
        optionId,
        // In-thread booking is a one-click "yes" — the candidate
        // doesn't get a notes field here. The dashboard booking flow
        // remains the path for any optional message.
        candidateNotes: null,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't book that slot. Please try again.");
        setBookingOptionId(null);
        return;
      }
      // Server-side syncInterviewProposalCardStatus flips the card to
      // 'booked'. Refresh so the page picks up the updated payload.
      router.refresh();
    });
  };

  // Normalize legacy `string[]` slots to the new {option_id, start_at}
  // shape. Legacy slots have no option_id, so we mark them as such and
  // suppress in-thread Book buttons — the candidate falls back to the
  // dashboard. `key` uses index as a stable fallback when option_id is
  // missing.
  const normalizedSlots = payload.offered_slots.map((slot, idx) => {
    if (typeof slot === "string") {
      return {
        key: `legacy-${idx}`,
        option_id: null as string | null,
        start_at: slot,
        legacy: true,
      };
    }
    return {
      key: slot.option_id,
      option_id: slot.option_id,
      start_at: slot.start_at,
      legacy: false,
    };
  });
  const hasLegacySlots = normalizedSlots.some((s) => s.legacy);

  const selectedSlot =
    payload.selected_option_id != null
      ? normalizedSlots.find((s) => s.option_id === payload.selected_option_id)
      : null;

  return (
    <CardShell eyebrow={eyebrow} eyebrowIcon={Calendar} accent="ink">
      {payload.job_title && (
        <div className="text-[14px] font-semibold text-ink mb-2">
          {payload.job_title}
        </div>
      )}
      {payload.message && (
        <p className="text-[13px] text-slate-body leading-[1.55] mb-3 italic">
          &ldquo;{payload.message}&rdquo;
        </p>
      )}

      {/* Booked state — show the chosen slot with checkmark, regardless of audience. */}
      {payload.status === "booked" && (
        <div className="flex items-center gap-2 text-[14px] text-heritage-deep font-semibold">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {selectedSlot
            ? `Booked: ${new Date(selectedSlot.start_at).toLocaleString()}`
            : "Slot booked."}
        </div>
      )}

      {/* Withdrawn state */}
      {payload.status === "withdrawn" && (
        <p className="text-[13px] text-slate-meta italic">
          The hiring team withdrew this proposal.
        </p>
      )}

      {/* Proposed state — candidate gets per-slot booking buttons,
          UNLESS the payload is legacy (no option_ids), in which case
          we render read-only + a dashboard fallback link. */}
      {payload.status === "proposed" && audience === "candidate" && !hasLegacySlots && (
        <div>
          <div className="text-[11px] font-semibold tracking-[1px] uppercase text-slate-meta mb-2">
            Pick a time
          </div>
          <div className="flex flex-col gap-1.5">
            {normalizedSlots.map((slot) => {
              const optId = slot.option_id;
              if (optId == null) return null; // exhaustiveness — hasLegacySlots already gated this
              const isBookingThis = pending && bookingOptionId === optId;
              return (
                <button
                  key={slot.key}
                  type="button"
                  onClick={() => handleBook(optId)}
                  disabled={pending}
                  className="inline-flex items-center justify-between gap-2 px-3 py-2 bg-white border border-[var(--rule-strong)] text-[13px] text-ink font-medium text-left hover:bg-cream hover:border-ink transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span>
                    {new Date(slot.start_at).toLocaleString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {isBookingThis ? (
                    <Loader2 className="size-3.5 animate-spin text-heritage-deep" aria-hidden />
                  ) : (
                    <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                      Book →
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {error && (
            <p
              role="alert"
              className="mt-2 text-[12px] text-red-700 leading-snug"
            >
              {error}
            </p>
          )}
        </div>
      )}

      {/* Legacy candidate fallback — proposal predates the in-thread
          booking feature, so we can't dispatch optionId. Punt to the
          dashboard. */}
      {payload.status === "proposed" && audience === "candidate" && hasLegacySlots && (
        <div>
          <div className="text-[11px] font-semibold tracking-[1px] uppercase text-slate-meta mb-1.5">
            Times offered
          </div>
          <ul className="list-none space-y-0.5 text-[13px] text-slate-body">
            {normalizedSlots.map((slot) => (
              <li key={slot.key}>{new Date(slot.start_at).toLocaleString()}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-slate-meta italic">
            Open this application on your dashboard to pick a slot.
          </p>
        </div>
      )}

      {/* Proposed state — employer sees the slots as read-only */}
      {payload.status === "proposed" && audience === "employer" && (
        <div>
          <div className="text-[11px] font-semibold tracking-[1px] uppercase text-slate-meta mb-1.5">
            Times offered
          </div>
          <ul className="list-none space-y-0.5 text-[13px] text-slate-body">
            {normalizedSlots.map((slot) => (
              <li key={slot.key}>{new Date(slot.start_at).toLocaleString()}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-slate-meta italic">
            Waiting on the candidate to pick a slot.
          </p>
        </div>
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
