/**
 * Conversation persistence for the SupportDrawer (Tier 2 chat).
 *
 * 24-hour TTL on the locally-cached conversation — matches the spec
 * decision that conversations archive after 24h. Past that window we
 * drop the local copy and start fresh.
 *
 * Per-user key (auth_user_id) prevents leakage on shared computers
 * where two users sign in to the same browser.
 *
 * v1 storage: localStorage. Pros: zero dependency, syncs across tabs
 * via the storage event, instant. Cons: not encrypted (don't put PII
 * here), cleared by aggressive privacy plugins. For support chat
 * context that's acceptable — the canonical record lives in the DB.
 */

export const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  /** Local-only timestamp; the DB has the authoritative one. */
  ts: number;
}

export interface StoredConversation {
  requestId: string;
  messages: StoredMessage[];
  /** When the conversation was last touched. Used for TTL check. */
  updatedAt: number;
}

function keyFor(authUserId: string): string {
  return `dsohire_support_chat:${authUserId}`;
}

export function loadConversation(authUserId: string): StoredConversation | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(keyFor(authUserId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredConversation;
    if (
      !parsed.requestId ||
      !Array.isArray(parsed.messages) ||
      typeof parsed.updatedAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.updatedAt > CONVERSATION_TTL_MS) {
      clearConversation(authUserId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveConversation(
  authUserId: string,
  conv: StoredConversation
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(authUserId), JSON.stringify(conv));
  } catch (err) {
    console.warn("[conversation-storage] save failed", err);
  }
}

export function clearConversation(authUserId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(authUserId));
  } catch {
    // swallow — clearing local cache should never throw to caller
  }
}
