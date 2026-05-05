"use client";

/**
 * <CommentsThread> — internal team comment thread for one application.
 *
 * Surface lives at the bottom of /employer/applications/[id], below the
 * existing "Internal Notes" textarea. RLS scopes everything to the DSO
 * that owns the job, so the dsoUsers + initialComments props are already
 * trustworthy from the server-rendered parent.
 *
 * Authoring model:
 *   - Mentions are stored in body as `@[Display Name](dso_user_auth_id)`
 *     tokens. The display name is rendered inline, and the auth UUID is
 *     forwarded to the server in `mentioned_user_ids` (derived from the
 *     body at submit time so the two can never drift).
 *   - The mention popover is triggered by typing `@` and lists DSO
 *     teammates filtered by the search fragment after the trigger. Up /
 *     down arrows select; Enter or click commits. Esc closes.
 *
 * Realtime model:
 *   - Subscribe to INSERT + UPDATE on application_comments filtered by
 *     application_id. Self-echo dedupe is by row id (we already have the
 *     row from the optimistic add). UPDATEs reconcile body + edited_at +
 *     mentioned_user_ids (DELETE is just an UPDATE setting deleted_at).
 *
 * What this PR does NOT do (deferred):
 *   - Reactions / emoji
 *   - Threading / replies
 *   - Rich text formatting beyond newlines + mention chips
 *   - Pagination — assumes <a few hundred comments per application
 *   - Typing indicators / presence
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { MoreHorizontal, AtSign } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimePostgresInsertPayload,
  type RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";
import {
  createApplicationComment,
  updateApplicationComment,
  deleteApplicationComment,
  type ApplicationCommentRow,
} from "./comments-actions";

export interface CommentDsoUser {
  /** dso_users.id — stored on the comment row as author_dso_user_id. */
  id: string;
  /** auth.users.id — used for mentions (mentioned_user_ids[]). */
  authUserId: string;
  fullName: string | null;
  role: "owner" | "admin" | "recruiter";
}

export interface CommentAuthor {
  /** dso_users.id */
  id: string;
  fullName: string | null;
  role: "owner" | "admin" | "recruiter";
}

export interface InitialComment extends ApplicationCommentRow {
  author: CommentAuthor | null;
}

interface CommentsThreadProps {
  applicationId: string;
  /** auth.users.id of the viewer — used to gate the edit/delete affordances. */
  currentUserId: string;
  /** All teammates in the viewer's DSO. Used for @-mention autocomplete +
   * to look up author display names on realtime echoes. */
  dsoUsers: CommentDsoUser[];
  initialComments: InitialComment[];
}

const EDIT_WINDOW_MS = 5 * 60 * 1000;
const MENTION_TOKEN_REGEX =
  /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

const ROLE_LABELS: Record<CommentDsoUser["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  recruiter: "Recruiter",
};

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

function extractMentionAuthIds(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MENTION_TOKEN_REGEX.source, "gi");
  while ((m = re.exec(body)) !== null) {
    const id = m[2].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function isWithinEditWindow(createdAtIso: string): boolean {
  return Date.now() - new Date(createdAtIso).getTime() < EDIT_WINDOW_MS;
}

/* ───────────────────────────────────────────────────────────────
 * Mention rendering — turns the body string into React nodes,
 * highlighting `@[Name](uuid)` tokens. Plain text lines preserve
 * their newlines (whitespace-pre-wrap on the container handles it).
 * ───────────────────────────────────────────────────────────── */

function renderBody(body: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  const re = new RegExp(MENTION_TOKEN_REGEX.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(
        <span key={`t-${key++}`}>{body.slice(lastIdx, match.index)}</span>
      );
    }
    const display = match[1];
    nodes.push(
      <span
        key={`m-${key++}`}
        className="inline-block px-1 py-0.5 -my-0.5 bg-heritage/10 text-heritage-deep font-semibold rounded-sm"
        title={display}
      >
        @{display}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < body.length) {
    nodes.push(<span key={`t-${key++}`}>{body.slice(lastIdx)}</span>);
  }
  return nodes;
}

/* ───────────────────────────────────────────────────────────────
 * Mention popover state — drives both the create form and the edit
 * form via a small reducer-ish helper.
 * ───────────────────────────────────────────────────────────── */

interface MentionTriggerState {
  /** Index of the `@` character in the body string. */
  atIdx: number;
  /** Caret position when the trigger was opened or last updated. */
  caretIdx: number;
  /** Filter text after the `@` (lowercased). */
  filter: string;
  /** Current selection within the filtered teammate list. */
  selectedIdx: number;
}

/** Detect a @-trigger at the caret. Returns null if not in a mention. */
function detectMentionTrigger(
  body: string,
  caret: number
): { atIdx: number; filter: string } | null {
  // Walk back from the caret looking for an `@` that isn't preceded by a
  // word character (so emails/handles don't trigger by accident).
  for (let i = caret - 1; i >= 0; i--) {
    const ch = body[i];
    if (ch === "@") {
      const prev = i === 0 ? "" : body[i - 1];
      if (prev && /\w/.test(prev)) return null;
      const filter = body.slice(i + 1, caret);
      // Bail if the filter contains whitespace — user moved past the mention.
      if (/\s/.test(filter)) return null;
      // Bail if the user has already committed a token here (rare edge:
      // mid-token caret). Tokens look like `@[...](...)`.
      if (filter.startsWith("[")) return null;
      return { atIdx: i, filter };
    }
    if (/\s/.test(ch)) return null;
    if (i < caret - 32) return null; // sanity cap
  }
  return null;
}

/* ───────────────────────────────────────────────────────────────
 * Author resolver — turns a comment row's author_dso_user_id into
 * an author object, falling back to a stub when we don't recognize
 * the author (shouldn't happen in practice, but realtime can deliver
 * an INSERT before the dsoUsers list is refreshed).
 * ───────────────────────────────────────────────────────────── */

interface ThreadComment extends ApplicationCommentRow {
  authorName: string | null;
  authorRole: CommentDsoUser["role"] | null;
}

function buildThreadComment(
  row: ApplicationCommentRow,
  initialAuthor: CommentAuthor | null,
  dsoUsers: CommentDsoUser[]
): ThreadComment {
  const matched = dsoUsers.find((u) => u.id === row.author_dso_user_id);
  return {
    ...row,
    authorName:
      initialAuthor?.fullName ?? matched?.fullName ?? "Teammate",
    authorRole: initialAuthor?.role ?? matched?.role ?? null,
  };
}

/* ───────────────────────────────────────────────────────────────
 * Component
 * ───────────────────────────────────────────────────────────── */

export function CommentsThread({
  applicationId,
  currentUserId,
  dsoUsers,
  initialComments,
}: CommentsThreadProps) {
  const [comments, setComments] = useState<ThreadComment[]>(() =>
    initialComments.map((c) =>
      buildThreadComment(
        c,
        c.author,
        dsoUsers
      )
    )
  );

  const [composerBody, setComposerBody] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editingError, setEditingError] = useState<string | null>(null);

  // ⋯ menu open state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Refs
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const editingRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);

  // Mention popover state — one per active textarea (composer or edit). We
  // tag with `target` so the same hook can drive both.
  const [mention, setMention] = useState<
    | (MentionTriggerState & { target: "compose" | "edit" })
    | null
  >(null);

  /* ── Filtered teammate list for the popover ── */
  const filteredTeammates = useMemo(() => {
    if (!mention) return [] as CommentDsoUser[];
    const q = mention.filter.toLowerCase();
    const list = dsoUsers
      .filter((u) => u.authUserId !== currentUserId) // don't @-mention yourself
      .filter((u) => {
        if (!q) return true;
        const name = (u.fullName ?? "").toLowerCase();
        return name.includes(q);
      })
      .slice(0, 8);
    return list;
  }, [mention, dsoUsers, currentUserId]);

  // Clamp selectedIdx for rendering — derived rather than stored so the list
  // shrinking doesn't require a setState-in-effect cascade.
  const selectedIdx = mention
    ? Math.min(mention.selectedIdx, Math.max(0, filteredTeammates.length - 1))
    : 0;

  /* ── Realtime subscription ── */
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`application_comments:${applicationId}`)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "application_comments",
          filter: `application_id=eq.${applicationId}`,
        },
        (payload: RealtimePostgresInsertPayload<ApplicationCommentRow>) => {
          const row = payload.new;
          if (!row?.id) return;
          setComments((current) => {
            // Self-echo dedupe: optimistic add already inserted this id.
            if (current.some((c) => c.id === row.id)) return current;
            const next = [...current, buildThreadComment(row, null, dsoUsers)];
            next.sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            );
            return next;
          });
        }
      )
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.UPDATE,
          schema: "public",
          table: "application_comments",
          filter: `application_id=eq.${applicationId}`,
        },
        (payload: RealtimePostgresUpdatePayload<ApplicationCommentRow>) => {
          const row = payload.new;
          if (!row?.id) return;
          setComments((current) =>
            current.map((c) =>
              c.id === row.id
                ? {
                    ...c,
                    body: row.body,
                    mentioned_user_ids: row.mentioned_user_ids,
                    updated_at: row.updated_at,
                    edited_at: row.edited_at,
                    deleted_at: row.deleted_at,
                  }
                : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applicationId, dsoUsers]);

  /* ── Auto-scroll on new comments when user is near the bottom ── */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [comments.length]);

  function handleListScroll(): void {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    wasNearBottomRef.current = distanceFromBottom < 80;
  }

  /* ── Composer / editor change handlers (shared mention detection) ── */

  function handleBodyChange(
    target: "compose" | "edit",
    e: ChangeEvent<HTMLTextAreaElement>
  ): void {
    const body = e.target.value;
    const caret = e.target.selectionStart ?? body.length;
    if (target === "compose") {
      setComposerBody(body);
      setComposerError(null);
    } else {
      setEditingBody(body);
      setEditingError(null);
    }

    const trig = detectMentionTrigger(body, caret);
    if (!trig) {
      setMention(null);
      return;
    }
    setMention((prev) => ({
      target,
      atIdx: trig.atIdx,
      caretIdx: caret,
      filter: trig.filter,
      selectedIdx: prev?.target === target ? prev.selectedIdx : 0,
    }));
  }

  function commitMention(user: CommentDsoUser): void {
    if (!mention) return;
    const target = mention.target;
    const body = target === "compose" ? composerBody : editingBody;
    const before = body.slice(0, mention.atIdx);
    const after = body.slice(mention.caretIdx);
    const display = (user.fullName ?? "Teammate").trim() || "Teammate";
    const token = `@[${display}](${user.authUserId})`;
    const inserted = `${before}${token} ${after}`;

    if (target === "compose") {
      setComposerBody(inserted);
      // Move caret to just after the inserted token + space.
      const nextCaret = before.length + token.length + 1;
      window.requestAnimationFrame(() => {
        const ta = composerRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(nextCaret, nextCaret);
        }
      });
    } else {
      setEditingBody(inserted);
      const nextCaret = before.length + token.length + 1;
      window.requestAnimationFrame(() => {
        const ta = editingRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(nextCaret, nextCaret);
        }
      });
    }
    setMention(null);
  }

  function handleKeyDown(
    target: "compose" | "edit",
    e: KeyboardEvent<HTMLTextAreaElement>
  ): void {
    // Mention popover takes precedence
    if (mention && mention.target === target && filteredTeammates.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention((m) =>
          m
            ? {
                ...m,
                selectedIdx: (selectedIdx + 1) % filteredTeammates.length,
              }
            : m
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention((m) =>
          m
            ? {
                ...m,
                selectedIdx:
                  (selectedIdx - 1 + filteredTeammates.length) %
                  filteredTeammates.length,
              }
            : m
        );
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        commitMention(filteredTeammates[selectedIdx]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }

    // Cmd/Ctrl-Enter to submit
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (target === "compose") {
        void handleSubmit();
      } else {
        void handleEditSave();
      }
    }
    if (target === "edit" && e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }

  /* ── Submit a new comment ── */
  async function handleSubmit(): Promise<void> {
    const body = composerBody.trim();
    if (!body) {
      setComposerError("Comment cannot be empty.");
      return;
    }
    setSubmitting(true);
    setComposerError(null);

    // Optimistic add (so the list scrolls + the textarea clears immediately).
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const mentionedAuthIds = extractMentionAuthIds(body);
    const optimistic: ThreadComment = {
      id: tempId,
      application_id: applicationId,
      author_user_id: currentUserId,
      author_dso_user_id:
        dsoUsers.find((u) => u.authUserId === currentUserId)?.id ?? "",
      body,
      mentioned_user_ids: mentionedAuthIds,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      authorName:
        dsoUsers.find((u) => u.authUserId === currentUserId)?.fullName ??
        "You",
      authorRole:
        dsoUsers.find((u) => u.authUserId === currentUserId)?.role ?? null,
    };
    setComments((c) => [...c, optimistic]);
    setComposerBody("");
    wasNearBottomRef.current = true;

    const result = await createApplicationComment({
      applicationId,
      body,
      mentionedUserIds: mentionedAuthIds,
    });

    if (!result.ok) {
      // Roll back the optimistic insert.
      setComments((c) => c.filter((x) => x.id !== tempId));
      setComposerError(result.error);
      setComposerBody(body);
      setSubmitting(false);
      return;
    }

    // Swap the optimistic row's id for the real one. Realtime INSERT echo
    // will be deduped by id-match so we don't re-insert.
    setComments((c) =>
      c.map((x) =>
        x.id === tempId
          ? buildThreadComment(
              result.comment,
              {
                id: result.comment.author_dso_user_id,
                fullName: optimistic.authorName,
                role: optimistic.authorRole ?? "recruiter",
              },
              dsoUsers
            )
          : x
      )
    );
    setSubmitting(false);
  }

  /* ── Edit / delete handlers ── */

  function startEdit(comment: ThreadComment): void {
    setEditingId(comment.id);
    setEditingBody(comment.body);
    setEditingError(null);
    setOpenMenuId(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditingBody("");
    setEditingError(null);
    setMention((m) => (m && m.target === "edit" ? null : m));
  }

  async function handleEditSave(): Promise<void> {
    if (!editingId) return;
    const body = editingBody.trim();
    if (!body) {
      setEditingError("Comment cannot be empty.");
      return;
    }
    const mentionedAuthIds = extractMentionAuthIds(body);
    const result = await updateApplicationComment({
      commentId: editingId,
      body,
      mentionedUserIds: mentionedAuthIds,
    });
    if (!result.ok) {
      setEditingError(result.error);
      return;
    }
    setComments((c) =>
      c.map((x) =>
        x.id === editingId
          ? {
              ...x,
              body: result.comment.body,
              mentioned_user_ids: result.comment.mentioned_user_ids,
              edited_at: result.comment.edited_at,
              updated_at: result.comment.updated_at,
            }
          : x
      )
    );
    cancelEdit();
  }

  async function handleDelete(commentId: string): Promise<void> {
    setOpenMenuId(null);
    // Optimistic soft-delete
    const prior = comments.find((c) => c.id === commentId);
    if (!prior) return;
    setComments((c) =>
      c.map((x) =>
        x.id === commentId
          ? { ...x, deleted_at: new Date().toISOString() }
          : x
      )
    );
    const result = await deleteApplicationComment(commentId);
    if (!result.ok) {
      // Roll back
      setComments((c) =>
        c.map((x) =>
          x.id === commentId ? { ...x, deleted_at: prior.deleted_at } : x
        )
      );
    }
  }

  /* ── Close ⋯ menu on outside click ── */
  useEffect(() => {
    if (!openMenuId) return;
    function onDoc(): void {
      setOpenMenuId(null);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [openMenuId]);

  /* ── Render ── */

  const visibleComments = comments;
  const composerMentionOpen =
    mention?.target === "compose" && filteredTeammates.length > 0;
  const editMentionOpen =
    mention?.target === "edit" && filteredTeammates.length > 0;

  return (
    <div>
      {/* List */}
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="border border-[var(--rule)] bg-white max-h-[420px] overflow-y-auto"
      >
        {visibleComments.length === 0 ? (
          <div className="p-8 text-center">
            <AtSign className="h-5 w-5 text-slate-meta mx-auto mb-2" />
            <p className="text-[14px] text-slate-meta">
              No team comments yet. Use{" "}
              <span className="font-mono text-ink">@</span> to mention a
              teammate.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule)]">
            {visibleComments.map((c) => {
              if (c.deleted_at) {
                return (
                  <li
                    key={c.id}
                    id={`comment-${c.id}`}
                    className="p-4 text-[13px] text-slate-meta italic"
                  >
                    Comment deleted.
                  </li>
                );
              }
              const isAuthor = c.author_user_id === currentUserId;
              const editable = isAuthor && isWithinEditWindow(c.created_at);
              const isEditing = editingId === c.id;
              return (
                <li
                  key={c.id}
                  id={`comment-${c.id}`}
                  className="p-4 group relative"
                >
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[14px] font-bold text-ink truncate">
                        {c.authorName ?? "Teammate"}
                      </span>
                      {c.authorRole && (
                        <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                          {ROLE_LABELS[c.authorRole]}
                        </span>
                      )}
                      <span
                        className="text-[12px] text-slate-meta"
                        title={new Date(c.created_at).toLocaleString()}
                      >
                        {relativeTime(c.created_at)}
                        {c.edited_at && " · edited"}
                      </span>
                    </div>
                    {editable && !isEditing && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(
                              openMenuId === c.id ? null : c.id
                            );
                          }}
                          aria-label="Comment actions"
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1 text-slate-meta hover:text-ink"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {openMenuId === c.id && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-6 z-10 bg-white border border-[var(--rule-strong)] shadow-lg min-w-[120px] py-1"
                          >
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              className="block w-full text-left px-3 py-1.5 text-[13px] text-ink hover:bg-cream"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDelete(c.id)}
                              className="block w-full text-left px-3 py-1.5 text-[13px] text-red-700 hover:bg-cream"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="relative mt-2">
                      <textarea
                        ref={editingRef}
                        value={editingBody}
                        onChange={(e) => handleBodyChange("edit", e)}
                        onKeyDown={(e) => handleKeyDown("edit", e)}
                        rows={3}
                        className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
                        autoFocus
                      />
                      {editMentionOpen && (
                        <MentionPopover
                          users={filteredTeammates}
                          selectedIdx={selectedIdx}
                          onSelect={commitMention}
                        />
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => void handleEditSave()}
                          className="px-3 py-1.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-body hover:text-ink transition-colors"
                        >
                          Cancel
                        </button>
                        {editingError && (
                          <span className="text-[13px] text-red-700">
                            {editingError}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">
                      {renderBody(c.body)}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="relative mt-4">
        <textarea
          ref={composerRef}
          value={composerBody}
          onChange={(e) => handleBodyChange("compose", e)}
          onKeyDown={(e) => handleKeyDown("compose", e)}
          rows={3}
          placeholder="Comment to your team — type @ to mention a teammate."
          className="w-full px-4 py-3 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
        />
        {composerMentionOpen && (
          <MentionPopover
            users={filteredTeammates}
            selectedIdx={selectedIdx}
            onSelect={commitMention}
          />
        )}
        <div className="flex items-center gap-3 mt-3">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || composerBody.trim().length === 0}
            className="px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Posting…" : "Post Comment"}
          </button>
          <span className="text-[12px] text-slate-meta">
            <span className="font-mono">⌘↩</span> to post ·{" "}
            <span className="font-mono">@</span> to mention
          </span>
          {composerError && (
            <span className="text-[13px] text-red-700">{composerError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
 * Mention popover — small floating list anchored above the textarea.
 * Position is "below the textarea, full width" for simplicity. The
 * existing shadcn Popover would give us anchored positioning, but it
 * pulls in Radix and we don't have it installed yet, so this matches
 * the constraint to use no new dependencies.
 * ───────────────────────────────────────────────────────────── */

function MentionPopover({
  users,
  selectedIdx,
  onSelect,
}: {
  users: CommentDsoUser[];
  selectedIdx: number;
  onSelect: (user: CommentDsoUser) => void;
}) {
  return (
    <div className="absolute left-0 right-0 -top-1 -translate-y-full bg-white border border-[var(--rule-strong)] shadow-lg max-h-[220px] overflow-y-auto z-20">
      <div className="px-3 py-2 text-[9px] font-bold tracking-[2px] uppercase text-slate-meta border-b border-[var(--rule)]">
        Mention a teammate
      </div>
      <ul>
        {users.map((u, idx) => (
          <li key={u.id}>
            <button
              type="button"
              // onMouseDown so the click registers before the textarea blurs
              // and steals focus.
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(u);
              }}
              className={`w-full text-left px-3 py-2 flex items-baseline justify-between gap-3 ${
                idx === selectedIdx ? "bg-cream" : "hover:bg-cream"
              }`}
            >
              <span className="text-[14px] font-semibold text-ink truncate">
                {u.fullName ?? "Teammate"}
              </span>
              <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                {ROLE_LABELS[u.role]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
