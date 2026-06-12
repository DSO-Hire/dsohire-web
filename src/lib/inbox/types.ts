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

/**
 * Internal team note projected into the unified timeline (Lane 4 —
 * Conversations 2.0). Sourced from `application_comments` (RLS: DSO
 * members only — candidates structurally cannot read these). Inert in
 * the thread: no unread tracking, never emailed, no realtime in v1.
 */
export interface ThreadNote {
  id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  author_name: string;
}

/**
 * One reached pipeline step for the context rail's journey stepper
 * (Lane 4). `kind` is the stage-kind snapshot from
 * application_status_events; `at` = when the application entered it.
 * Real dates only — unreached stages simply aren't in the list.
 */
export interface ThreadStageStep {
  kind: string;
  at: string;
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
  /** Non-NULL when the most recent message is a system event. */
  last_message_event_kind: string | null;

  // Unread count — messages from the OTHER side with read_at IS NULL.
  unread_count: number;

  // Per-user archive state.
  archived: boolean;

  // Filter facets (employer-only fields are nullable on candidate side).
  stage: string | null;
  location_id: string | null;
  location_name: string | null;

  // ── Lane 4 (Conversations 2.0) facets ─────────────────────────
  /** True when the latest HUMAN message (system events excluded) came
   * from the other side — i.e. the ball is in this viewer's court. */
  awaiting_reply: boolean;
  /** Internal team notes on this application. Employer side only —
   * always 0 on the candidate side (notes are never fetched there). */
  notes_count: number;
  /** Latest internal note snapshot — drives the "Note:" row preview
   * when the note is newer than the last message. Employer only. */
  latest_note_preview: string | null;
  latest_note_at: string | null;
}
