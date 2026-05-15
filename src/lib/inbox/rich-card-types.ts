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

/** Interview proposed — sender shared availability with the other side. */
export interface InterviewProposalCardPayload {
  kind: "interview_proposal";
  /** interview_proposals.id */
  proposal_id: string;
  job_title: string | null;
  /** ISO datetimes of the offered slots. */
  offered_slots: string[];
  /** Optional message from sender. */
  message: string | null;
  status: "proposed" | "booked" | "withdrawn";
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
