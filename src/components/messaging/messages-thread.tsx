"use client";

/**
 * <MessagesThread> — direct two-way messaging on one application.
 *
 * Used by both the employer-side detail page (/employer/applications/[id])
 * and the candidate-side detail page (/candidate/applications/[id]). The
 * server-rendered parent fetches initial messages with RLS already applied,
 * so we can render trustingly from the props.
 *
 * Realtime model:
 *   - Subscribe to INSERT + UPDATE on application_messages filtered by
 *     application_id. Self-echo dedupe by row id (same pattern as
 *     comments-thread). UPDATEs reconcile body / edited_at / deleted_at /
 *     read_at without touching anything else.
 *
 * Read-receipt model:
 *   - On render, any messages from the OTHER side that have read_at = null
 *     get marked read via markApplicationMessageRead(). Routed through a
 *     server action that uses the service-role client — non-senders can
 *     only flip read_at, never edit body.
 *
 * What this v1 does NOT do:
 *   - Attachments, search, canned messages, bulk send
 *   - @-mentions across the candidate/employer boundary
 *   - Reactions, typing indicators, granular read receipts beyond seen/unseen
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { MoreHorizontal, MessageCircle, Check, CheckCheck, Eye } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimePostgresInsertPayload,
  type RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";
import {
  sendApplicationMessage,
  editApplicationMessage,
  deleteApplicationMessage,
  markApplicationMessageRead,
  type ApplicationMessageRow,
} from "@/lib/messages/actions";

const EDIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_BODY = 5000;

export type MessagesThreadRole = "candidate" | "employer";

export interface MessagesThreadProps {
  applicationId: string;
  /** auth.users.id of the viewer — used to gate edit/delete affordances. */
  currentUserId: string;
  /** Which side the viewer is on. Drives the "you" alignment + label copy. */
  currentUserRole: MessagesThreadRole;
  /** Display name for the viewer (used as a fallback "you" label). */
  currentUserName: string;
  /** Display name for the other party shown in the header. */
  otherPartyName: string;
  initialMessages: ApplicationMessageRow[];
}

interface ThreadMessage extends ApplicationMessageRow {
  /** True when this row was inserted optimistically and hasn't been swapped
   * to the canonical id yet. Used so we don't try to mark a temp id read. */
  pending?: boolean;
}

/* ───────────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────────── */

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

function roleLabel(role: MessagesThreadRole): string {
  return role === "candidate" ? "Candidate" : "Hiring team";
}

/* ───────────────────────────────────────────────────────────────
 * Component
 * ───────────────────────────────────────────────────────────── */

export function MessagesThread({
  applicationId,
  currentUserId,
  currentUserRole,
  currentUserName,
  otherPartyName,
  initialMessages,
}: MessagesThreadProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>(() =>
    [...initialMessages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  );

  const [composerBody, setComposerBody] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editingError, setEditingError] = useState<string | null>(null);

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const editingRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const wasNearBottomRef = useRef(true);

  // Track which message ids we've already attempted to mark read so we don't
  // re-fire the action on every render.
  const markedReadRef = useRef<Set<string>>(new Set());

  /* ── Realtime subscription ── */
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`application_messages:${applicationId}`)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "application_messages",
          filter: `application_id=eq.${applicationId}`,
        },
        (
          payload: RealtimePostgresInsertPayload<ApplicationMessageRow>
        ) => {
          const row = payload.new;
          if (!row?.id) return;
          setMessages((current) => {
            // Self-echo dedupe by id — optimistic add already swapped to
            // canonical id once the server action returned.
            if (current.some((m) => m.id === row.id)) return current;
            const next = [...current, row as ThreadMessage];
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
          table: "application_messages",
          filter: `application_id=eq.${applicationId}`,
        },
        (
          payload: RealtimePostgresUpdatePayload<ApplicationMessageRow>
        ) => {
          const row = payload.new;
          if (!row?.id) return;
          setMessages((current) =>
            current.map((m) =>
              m.id === row.id
                ? {
                    ...m,
                    body: row.body,
                    read_at: row.read_at,
                    updated_at: row.updated_at,
                    edited_at: row.edited_at,
                    deleted_at: row.deleted_at,
                  }
                : m
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [applicationId]);

  /* ── Auto-scroll on new messages when user is near the bottom ── */
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length]);

  function handleListScroll(): void {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    wasNearBottomRef.current = distanceFromBottom < 80;
  }

  /* ── Mark unread other-side messages as read on render ── */
  useEffect(() => {
    const candidates = messages.filter(
      (m) =>
        !m.pending &&
        !m.deleted_at &&
        !m.read_at &&
        m.sender_user_id !== currentUserId &&
        !markedReadRef.current.has(m.id)
    );
    if (candidates.length === 0) return;
    candidates.forEach((m) => {
      markedReadRef.current.add(m.id);
      void markApplicationMessageRead(m.id);
    });
  }, [messages, currentUserId]);

  /* ── Composer / edit handlers ── */

  function handleComposerChange(
    e: ChangeEvent<HTMLTextAreaElement>
  ): void {
    setComposerBody(e.target.value);
    setComposerError(null);
  }

  function handleEditChange(e: ChangeEvent<HTMLTextAreaElement>): void {
    setEditingBody(e.target.value);
    setEditingError(null);
  }

  const handleSubmit = useCallback(async (): Promise<void> => {
    const body = composerBody.trim();
    if (!body) {
      setComposerError("Message cannot be empty.");
      return;
    }
    if (body.length > MAX_BODY) {
      setComposerError(`Message is too long (${MAX_BODY} character max).`);
      return;
    }
    setSubmitting(true);
    setComposerError(null);

    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const nowIso = new Date().toISOString();
    const optimistic: ThreadMessage = {
      id: tempId,
      application_id: applicationId,
      sender_user_id: currentUserId,
      sender_role: currentUserRole,
      sender_dso_user_id: null,
      body,
      read_at: null,
      created_at: nowIso,
      updated_at: nowIso,
      edited_at: null,
      deleted_at: null,
      pending: true,
    };
    setMessages((m) => [...m, optimistic]);
    setComposerBody("");
    wasNearBottomRef.current = true;

    const result = await sendApplicationMessage({ applicationId, body });

    if (!result.ok) {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setComposerError(result.error);
      setComposerBody(body);
      setSubmitting(false);
      return;
    }

    // Swap the optimistic row's id for the canonical one. Realtime INSERT
    // echo will be deduped by id-match.
    setMessages((m) =>
      m.map((x) =>
        x.id === tempId
          ? { ...result.message, pending: false }
          : x
      )
    );
    setSubmitting(false);
  }, [applicationId, composerBody, currentUserId, currentUserRole]);

  function startEdit(message: ThreadMessage): void {
    setEditingId(message.id);
    setEditingBody(message.body);
    setEditingError(null);
    setOpenMenuId(null);
  }

  function cancelEdit(): void {
    setEditingId(null);
    setEditingBody("");
    setEditingError(null);
  }

  const handleEditSave = useCallback(async (): Promise<void> => {
    if (!editingId) return;
    const body = editingBody.trim();
    if (!body) {
      setEditingError("Message cannot be empty.");
      return;
    }
    if (body.length > MAX_BODY) {
      setEditingError(`Message is too long (${MAX_BODY} character max).`);
      return;
    }
    const result = await editApplicationMessage({
      messageId: editingId,
      body,
    });
    if (!result.ok) {
      setEditingError(result.error);
      return;
    }
    setMessages((m) =>
      m.map((x) =>
        x.id === editingId
          ? {
              ...x,
              body: result.message.body,
              edited_at: result.message.edited_at,
              updated_at: result.message.updated_at,
            }
          : x
      )
    );
    cancelEdit();
  }, [editingBody, editingId]);

  async function handleDelete(messageId: string): Promise<void> {
    setOpenMenuId(null);
    const prior = messages.find((m) => m.id === messageId);
    if (!prior) return;
    setMessages((m) =>
      m.map((x) =>
        x.id === messageId
          ? { ...x, deleted_at: new Date().toISOString() }
          : x
      )
    );
    const result = await deleteApplicationMessage(messageId);
    if (!result.ok) {
      setMessages((m) =>
        m.map((x) =>
          x.id === messageId ? { ...x, deleted_at: prior.deleted_at } : x
        )
      );
    }
  }

  /* ── Keyboard shortcuts ── */
  function handleComposerKeyDown(
    e: KeyboardEvent<HTMLTextAreaElement>
  ): void {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleEditSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
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

  /* ── Derived values ── */
  const remaining = MAX_BODY - composerBody.length;
  const remainingClass =
    remaining < 0
      ? "text-red-700"
      : remaining < 200
        ? "text-amber-700"
        : "text-slate-meta";

  const visibleCount = useMemo(
    () => messages.filter((m) => !m.deleted_at).length,
    [messages]
  );

  /* ── Render ── */

  // External-banner copy flips based on which side is viewing. The component
  // is shared between /employer/applications/[id] and /candidate/applications/[id]
  // — same visual treatment, mirrored language so neither side can confuse
  // this surface for an internal/private one.
  const isEmployerView = currentUserRole === "employer";
  const externalAudienceLabel = isEmployerView ? "candidate" : "recruiter";
  const externalAudienceName = otherPartyName;

  return (
    <div className="relative bg-heritage/5 border-2 border-heritage/30 p-6 sm:p-7 shadow-[0_0_0_1px_var(--heritage-glow),0_4px_20px_-8px_var(--heritage-glow)]">
      {/* Layer 2 — EXTERNAL banner */}
      <div className="mb-5 flex items-start gap-3 px-4 py-3 bg-heritage-tint border border-heritage/40">
        <Eye className="h-4 w-4 text-heritage-deep flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            External · Visible to {externalAudienceLabel}
          </div>
          <p className="text-[12px] text-heritage-deep/90 mt-1 leading-snug">
            Anything you send here is sent directly to{" "}
            <span className="font-bold">{externalAudienceName}</span>{" "}
            {isEmployerView
              ? "via email and shown on their applicant dashboard."
              : "and shown on their hiring dashboard."}{" "}
            Internal team notes belong in the sections below.
          </p>
        </div>
      </div>

      {/* List */}
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="border border-heritage/30 bg-white max-h-[480px] overflow-y-auto"
      >
        {visibleCount === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="h-5 w-5 text-slate-meta mx-auto mb-2" />
            <p className="text-[13px] text-slate-meta">
              No messages yet. Start the conversation with{" "}
              <span className="font-bold text-ink">{otherPartyName}</span>.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule)]">
            {messages.map((m) => {
              if (m.deleted_at) {
                return (
                  <li
                    key={m.id}
                    id={`message-${m.id}`}
                    className="p-4 text-[12px] text-slate-meta italic"
                  >
                    Message deleted.
                  </li>
                );
              }
              const isMine = m.sender_user_id === currentUserId;
              const editable =
                isMine && !m.pending && isWithinEditWindow(m.created_at);
              const isEditing = editingId === m.id;

              const senderLabel = isMine
                ? currentUserName
                : otherPartyName;
              const senderRoleLabel = roleLabel(m.sender_role);

              return (
                <li
                  key={m.id}
                  id={`message-${m.id}`}
                  className="p-4 group relative"
                >
                  <div
                    className={`flex flex-col ${
                      isMine ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`flex items-baseline gap-2 mb-1 max-w-full ${
                        isMine ? "flex-row-reverse" : "flex-row"
                      }`}
                    >
                      <span className="text-[13px] font-bold text-ink truncate">
                        {senderLabel}
                      </span>
                      <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                        {senderRoleLabel}
                      </span>
                      <span
                        className="text-[11px] text-slate-meta"
                        title={new Date(m.created_at).toLocaleString()}
                      >
                        {relativeTime(m.created_at)}
                        {m.edited_at ? " · edited" : ""}
                        {m.pending ? " · sending…" : ""}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="w-full max-w-[520px]">
                        <textarea
                          ref={editingRef}
                          value={editingBody}
                          onChange={handleEditChange}
                          onKeyDown={handleEditKeyDown}
                          rows={3}
                          maxLength={MAX_BODY}
                          className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
                          autoFocus
                        />
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
                            <span className="text-[12px] text-red-700">
                              {editingError}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`max-w-[520px] px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words border ${
                          isMine
                            ? "bg-heritage/15 border-heritage/40 text-ink"
                            : "bg-[var(--heritage-tint)] border-heritage/25 text-ink"
                        }`}
                      >
                        {m.body}
                      </div>
                    )}

                    {!isEditing && isMine && !m.pending && (
                      <div className="flex items-center gap-2 mt-1">
                        {m.read_at ? (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1px] uppercase text-heritage-deep"
                            title={`Read ${new Date(
                              m.read_at
                            ).toLocaleString()}`}
                          >
                            <CheckCheck className="h-3 w-3" />
                            Read
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-[1px] uppercase text-slate-meta">
                            <Check className="h-3 w-3" />
                            Sent
                          </span>
                        )}
                        {editable && (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuId(
                                  openMenuId === m.id ? null : m.id
                                );
                              }}
                              aria-label="Message actions"
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 -m-1 text-slate-meta hover:text-ink"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                            {openMenuId === m.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-6 z-10 bg-white border border-[var(--rule-strong)] shadow-lg min-w-[120px] py-1"
                              >
                                <button
                                  type="button"
                                  onClick={() => startEdit(m)}
                                  className="block w-full text-left px-3 py-1.5 text-[12px] text-ink hover:bg-cream"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(m.id)}
                                  className="block w-full text-left px-3 py-1.5 text-[12px] text-red-700 hover:bg-cream"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Composer */}
      <div className="mt-5">
        {/* Layer 3 — inline warning directly above the textarea */}
        <div className="mb-2 px-3 py-2 bg-heritage-tint border-l-2 border-heritage text-[12.5px] leading-snug text-ink">
          <span className="font-semibold text-heritage-deep">
            Sending to {externalAudienceName}.
          </span>{" "}
          This message goes directly to them — internal team notes belong in
          the sections below.
        </div>
        <p className="text-[12px] italic text-heritage-deep mb-2 leading-snug">
          Don&apos;t share medical information here — discuss any
          accommodations or health-related context directly with HR.
        </p>
        <textarea
          ref={composerRef}
          value={composerBody}
          onChange={handleComposerChange}
          onKeyDown={handleComposerKeyDown}
          rows={3}
          maxLength={MAX_BODY}
          placeholder={`Message ${otherPartyName}…`}
          className="w-full px-4 py-3 bg-white border border-heritage/40 text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage transition-colors leading-relaxed"
        />
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || composerBody.trim().length === 0}
            className="px-5 py-2.5 bg-ink text-ivory text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Sending…" : "Send Message"}
          </button>
          <span className="text-[11px] text-slate-meta">
            <span className="font-mono">⌘↩</span> to send
          </span>
          <span className={`text-[11px] ${remainingClass}`}>
            {remaining} characters left
          </span>
          {composerError && (
            <span className="text-[12px] text-red-700">{composerError}</span>
          )}
        </div>
      </div>
    </div>
  );
}
