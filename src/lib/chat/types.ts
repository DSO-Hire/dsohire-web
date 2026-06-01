/**
 * Chat widget shared types. Kept OUT of actions.ts because a "use server"
 * module may only export async functions — exporting interfaces from it
 * fails the build.
 */

export interface ChatTeammate {
  dso_user_id: string;
  auth_user_id: string | null;
  name: string;
  role: string;
  /** Human job title, if set — shown under the name in the picker. */
  title: string | null;
  /** Uploaded headshot URL, if set. */
  avatar_url: string | null;
  initials: string;
}

export interface ChatThread {
  kind: "dm" | "candidate";
  /** conversation_id for dm, application_id for candidate. */
  id: string;
  title: string;
  subtitle: string;
  last_message: string | null;
  last_at: string | null;
  unread: number;
  initials: string;
  /** Headshot URL (teammate avatar or candidate photo) — preferred over initials. */
  avatar_url?: string | null;
  /** the other teammate's auth id (dm only) — drives presence. */
  other_auth_id?: string | null;
}

export interface ChatMessage {
  id: string;
  body: string;
  created_at: string;
  /** true if the current user sent it. */
  mine: boolean;
  sender_name: string;
}
