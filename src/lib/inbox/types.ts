/**
 * Inbox thread shapes (Phase 4.8 — Inbox v0).
 *
 * Co-located with queries.ts + actions.ts under src/lib/inbox/. Both
 * employer and candidate inboxes consume the same `InboxThread` type;
 * audience-specific fields (candidate_name vs dso_name) hang off the
 * thread under `peer` so the rendering components stay symmetrical.
 */

export interface InboxPeer {
  /** Display name shown in the thread list — candidate name (employer view) or DSO name (candidate view). */
  display_name: string;
  /** Optional avatar / logo URL. */
  avatar_url: string | null;
}

export interface InboxThread {
  application_id: string;
  job_id: string;
  job_title: string;
  /** Employer side: candidate; candidate side: DSO. */
  peer: InboxPeer;

  // Last message snapshot (NULL when no messages exist on the application).
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_sender_role: "candidate" | "employer" | null;

  // Unread count — messages from the OTHER side with read_at IS NULL.
  unread_count: number;

  // Per-user archive state.
  archived: boolean;

  // Filter facets (employer-only fields are nullable on candidate side).
  stage: string | null;
  location_id: string | null;
  location_name: string | null;
}
