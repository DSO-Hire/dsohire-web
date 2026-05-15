/**
 * RichCard payload types — inline cards that live in an application
 * inbox thread alongside text and system messages.
 *
 * Schema mechanics (migration 20260515000002):
 *   application_messages.kind = 'rich_card'
 *   application_messages.payload  = one of the discriminated shapes below
 *   application_messages.body     = a short text fallback that email
 *                                   digests and a11y readers degrade to
 *
 * Adding a new card kind:
 *   1. Add a new shape to RichCardPayload below.
 *   2. Add a renderer in src/components/inbox/rich-cards/.
 *   3. Add a dispatch helper (or extend dispatch-rich-card.ts) at the
 *      site that creates the underlying entity (e.g., offer-actions.ts
 *      dispatches an offer_letter card after sending the email).
 */

/** Offer letter — sent by employer, candidate can Accept/Decline. */
export interface OfferLetterCardPayload {
  kind: "offer_letter";
  /** application_offer_sends.id — the audit row. */
  offer_send_id: string;
  /** Token used to construct /o/[token] for the candidate's response. */
  response_token: string;
  subject: string;
  /** Short plain-text preview of the offer body (first ~280 chars). */
  preview: string;
  sent_at: string;
  /** Status mirror — kept in sync as the candidate responds. */
  status: "sent" | "accepted" | "declined";
}

/**
 * One offered interview slot.
 *
 * NEW shape (post 2026-05-15 fffda24): `{ option_id, start_at }` so the
 * candidate can book directly from the inbox card.
 *
 * LEGACY shape (pre-2026-05-15): bare `string` ISO timestamp. The
 * renderer detects this and falls back to a read-only display with a
 * "Pick from your dashboard" link rather than crashing with Invalid
 * Date / null option_id.
 */
export type InterviewProposalSlot =
  | string
  | { option_id: string; start_at: string };

/** Interview proposed — sender shared availability with the other side. */
export interface InterviewProposalCardPayload {
  kind: "interview_proposal";
  /** interview_proposals.id */
  proposal_id: string;
  job_title: string | null;
  /**
   * Offered slots — see InterviewProposalSlot for the union. New cards
   * always emit the object shape; legacy cards (created before the
   * in-thread booking work) may still contain bare strings.
   */
  offered_slots: InterviewProposalSlot[];
  /** Optional message from sender. */
  message: string | null;
  status: "proposed" | "booked" | "withdrawn";
  /** Populated once status flips to 'booked' — which option won. */
  selected_option_id?: string | null;
}

/** Interview booked — confirmation of a selected slot. */
export interface InterviewBookedCardPayload {
  kind: "interview_booked";
  /** interview_bookings.id */
  booking_id: string;
  /** ISO datetime of the booked slot. */
  start_at: string;
  duration_minutes: number;
  location_text: string | null;
  /** "video" | "phone" | "onsite" — copied from the proposal. */
  interview_kind: string;
}

/** Reference completed — a reference submitted their response. */
export interface ReferenceCompletedCardPayload {
  kind: "reference_completed";
  /** reference_requests.id */
  request_id: string;
  /** Anonymized reference name as displayed to the employer. */
  reference_display_name: string;
  submitted_at: string;
}

/** Document share — file dropped without a typed comment. */
export interface DocumentSharedCardPayload {
  kind: "document_shared";
  /** application_message_attachments.id of the primary file. */
  attachment_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  /** Optional short note from sender. */
  note: string | null;
}

export type RichCardPayload =
  | OfferLetterCardPayload
  | InterviewProposalCardPayload
  | InterviewBookedCardPayload
  | ReferenceCompletedCardPayload
  | DocumentSharedCardPayload;

/**
 * Narrow an unknown JSON blob (as stored in application_messages.payload)
 * into a typed RichCardPayload, or return null when it doesn't match a
 * known card shape. Used by the renderer to safely switch on payload.kind.
 */
export function parseRichCardPayload(input: unknown): RichCardPayload | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.kind !== "string") return null;
  switch (obj.kind) {
    case "offer_letter":
    case "interview_proposal":
    case "interview_booked":
    case "reference_completed":
    case "document_shared":
      return input as RichCardPayload;
    default:
      return null;
  }
}
