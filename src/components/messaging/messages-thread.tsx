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
import {
  MoreHorizontal,
  MessageCircle,
  Check,
  CheckCheck,
  Eye,
  CheckCircle2,
  Inbox,
  X as XIcon,
  Briefcase,
  Calendar,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
  getApplicationMessageAttachmentSignedUrl,
  type ApplicationMessageRow,
  type ApplicationMessageAttachment,
} from "@/lib/messages/actions";
import { RichCardRenderer } from "@/components/inbox/rich-cards";
import type { ThreadNote } from "@/lib/inbox/types";
import { useToast } from "@/components/app/toast";
import { createApplicationComment } from "@/app/employer/(app)/applications/[id]/comments-actions";

const EDIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_BODY = 5000;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const ATTACHMENT_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt";

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
  /**
   * Internal team notes interleaved into the timeline by created_at
   * (Lane 4 — Conversations 2.0). Employer surfaces only — candidate
   * surfaces must never pass this. Notes render amber + locked, take
   * no part in read/unread or realtime, and are never sent anywhere.
   * Passing this prop also enables the composer's internal-note toggle.
   */
  notes?: ThreadNote[];
  /**
   * Job title for slash-template merge fields. Employer surfaces only;
   * when absent, templates fall back to "this role".
   */
  jobTitle?: string;
  /** Fired after the composer saves an internal note, so the owner of
   * the `notes` prop can append it to the timeline without a refetch. */
  onNoteAdded?: (note: ThreadNote) => void;
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

/**
 * Mention-token highlighter for internal notes — `@[Name](uuid)` →
 * heritage chip. Mirrors the private renderBody in the application
 * page's comments-thread.tsx (kept local there on purpose: importing
 * across page boundaries would couple this shared client component to
 * an app-route file). If the token format ever changes, update both.
 */
const NOTE_MENTION_REGEX =
  /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

function renderNoteBody(body: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  const re = new RegExp(NOTE_MENTION_REGEX.source, "gi");
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
 * Slash templates (Lane 4 — Composer 2.0). Employer-only quick
 * replies: type "/" as the FIRST character to open the picker.
 * Merge tokens render as chips in the preview and resolve to the
 * REAL thread context at insert — what lands in the textarea is
 * exactly what sends, no hidden substitution at send time.
 *
 * Honesty rules: no invented capabilities (no calendar links — we
 * don't have scheduling links), no invented facts. Candidate name
 * comes from the thread's display name, which is already anonymity-
 * masked upstream — never resolve from raw candidate rows here.
 * ───────────────────────────────────────────────────────────── */

interface ComposerTemplate {
  slug: string;
  label: string;
  description: string;
  /** Body with {{candidate.name}} / {{job.title}} / {{sender.name}} tokens. */
  body: string;
}

const COMPOSER_TEMPLATES: ComposerTemplate[] = [
  {
    slug: "interview-invite",
    label: "/interview-invite",
    description: "Propose interview times",
    body: "Hi {{candidate.name}} — we'd love to set up an interview for the {{job.title}} role. Could you share a few days and times that work for you over the next week or so? We're happy to work around your schedule.\n\n{{sender.name}}",
  },
  {
    slug: "screening-call",
    label: "/screening-call",
    description: "Invite to a quick screening call",
    body: "Hi {{candidate.name}} — thanks for your application for {{job.title}}. We'd love to start with a quick 15-minute call to talk through the role and hear what you're looking for. What does your availability look like this week?\n\n{{sender.name}}",
  },
  {
    slug: "interview-prep",
    label: "/interview-prep",
    description: "What to expect before an interview",
    body: "Hi {{candidate.name}} — looking forward to your interview for {{job.title}}. A quick note on what to expect: we'll walk through your background, talk about the day-to-day of the role, and leave plenty of time for your questions. Nothing to prepare — come as you are.\n\nIf anything comes up beforehand, just reply here.\n\n{{sender.name}}",
  },
  {
    slug: "gentle-nudge",
    label: "/gentle-nudge",
    description: "Re-engage a quiet candidate, no pressure",
    body: "Hi {{candidate.name}} — just checking in on the {{job.title}} conversation. No rush at all on our end; if you're still interested, I'd love to keep things moving. And if your situation has changed, that's completely fine too — just let me know either way.\n\n{{sender.name}}",
  },
  {
    slug: "next-steps",
    label: "/next-steps",
    description: "Where things stand + what happens next",
    body: "Hi {{candidate.name}} — thanks for your patience on the {{job.title}} role. Quick update: your application is with our team and we'll be back in touch shortly with next steps. Feel free to reply here with any questions in the meantime.\n\n{{sender.name}}",
  },
];

const TEMPLATE_TOKEN_REGEX =
  /\{\{(candidate\.name|job\.title|sender\.name)\}\}/g;

interface TemplateContext {
  candidateName: string;
  jobTitle: string;
  senderName: string;
}

function resolveTemplate(body: string, ctx: TemplateContext): string {
  return body.replace(TEMPLATE_TOKEN_REGEX, (_, token: string) => {
    switch (token) {
      case "candidate.name":
        return ctx.candidateName;
      case "job.title":
        return ctx.jobTitle;
      case "sender.name":
        return ctx.senderName;
      default:
        return _;
    }
  });
}

const TOKEN_CHIP_LABELS: Record<string, string> = {
  "candidate.name": "Candidate",
  "job.title": "Job title",
  "sender.name": "Your name",
};

/** Preview renderer — merge tokens become visible chips. */
function renderTemplatePreview(body: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  const re = new RegExp(TEMPLATE_TOKEN_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    if (match.index > lastIdx) {
      nodes.push(
        <span key={`t-${key++}`}>{body.slice(lastIdx, match.index)}</span>
      );
    }
    nodes.push(
      <span
        key={`c-${key++}`}
        className="inline-block px-1 py-0.5 -my-0.5 bg-heritage/15 text-heritage-deep text-[11px] font-semibold rounded-sm whitespace-nowrap"
      >
        {TOKEN_CHIP_LABELS[match[1]] ?? match[1]}
      </span>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < body.length) {
    nodes.push(<span key={`t-${key++}`}>{body.slice(lastIdx)}</span>);
  }
  return nodes;
}

function roleLabel(role: MessagesThreadRole): string {
  return role === "candidate" ? "Candidate" : "Hiring team";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentIcon(mime: string): LucideIcon {
  if (mime.startsWith("image/")) return ImageIcon;
  if (
    mime === "application/pdf" ||
    mime === "text/plain" ||
    mime === "application/msword" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return FileText;
  }
  return Paperclip;
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
  notes,
  jobTitle,
  onNoteAdded,
}: MessagesThreadProps) {
  const [messages, setMessages] = useState<ThreadMessage[]>(() =>
    [...initialMessages].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
  );

  // When the parent passes a fresh `initialMessages` prop (e.g. user
  // selected a different thread in the inbox and the list was fetched
  // client-side AFTER mount), reset our state to match. We key the
  // dependency on the IDs so realtime additions inside this component
  // don't loop into the parent's prop and trigger a reset.
  //
  // Caught 2026-05-07 PM: the inbox 2-pane layout passes
  // `initialMessages={[]}` on first mount because the click-handler
  // fires the fetch async; without this effect, MessagesThread is
  // stuck on the empty state forever. (The `key={applicationId}`
  // remount only triggers when the app changes, not when its
  // initial-messages payload arrives later.)
  const initialMessagesKey = useMemo(
    () => initialMessages.map((m) => m.id).join(","),
    [initialMessages]
  );
  useEffect(() => {
    setMessages(
      [...initialMessages].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessagesKey]);

  const [composerBody, setComposerBody] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  // ── Composer 2.0 (Lane 4) ──────────────────────────────────────
  // Internal-note mode — only offered when the surface opted into the
  // unified timeline (notes prop present) AND the viewer is employer-
  // side. Slash templates are employer-only as well.
  const toast = useToast();
  const [noteMode, setNoteMode] = useState(false);
  const noteModeAvailable =
    currentUserRole === "employer" && notes !== undefined;
  const slashEnabled = currentUserRole === "employer" && !noteMode;
  const [slashIdx, setSlashIdx] = useState(0);
  const slashOpen = slashEnabled && composerBody.startsWith("/");
  const slashFilter = slashOpen
    ? composerBody.slice(1).toLowerCase().trimStart()
    : "";
  const slashMatches = useMemo(() => {
    if (!slashOpen) return [];
    if (!slashFilter) return COMPOSER_TEMPLATES;
    return COMPOSER_TEMPLATES.filter(
      (t) =>
        t.slug.includes(slashFilter) ||
        t.description.toLowerCase().includes(slashFilter)
    );
  }, [slashOpen, slashFilter]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
            // Self-echo dedupe by id — happens when the server action's
            // optimistic swap (tempId → canonical id) already finished.
            if (current.some((m) => m.id === row.id)) return current;

            // Race fix (2026-05-15 stress test): realtime can fire BEFORE
            // the server action returns + swaps, so the pending row still
            // has tempId and id-match misses. CLAIM the pending row
            // instead of appending — match by sender + body, which is
            // unique enough for the brief pending window. Without this
            // we got two bubbles for messages with attachments.
            const pending = current.find(
              (m) =>
                m.pending &&
                m.sender_user_id === row.sender_user_id &&
                m.body === row.body,
            );
            if (pending) {
              return current.map((m) =>
                m === pending
                  ? {
                      ...(row as ThreadMessage),
                      attachments: m.attachments ?? [],
                      pending: false,
                    }
                  : m,
              );
            }

            const next = [
              ...current,
              { ...(row as ThreadMessage), attachments: [] },
            ];
            next.sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime()
            );
            return next;
          });
          // Pull any attachments for this incoming message — the parent
          // realtime channel only watches application_messages, so
          // attachment rows arrive separately. RLS gates this read to
          // participants only.
          void (async () => {
            const { data, error } = await supabase
              .from("application_message_attachments")
              .select(
                "id, message_id, storage_path, file_name, mime_type, size_bytes, created_at"
              )
              .eq("message_id", row.id);
            if (error) {
              console.warn(
                "[messages] realtime attachment fetch failed",
                error
              );
              return;
            }
            const atts = (data ?? []) as ApplicationMessageAttachment[];
            if (atts.length === 0) return;
            setMessages((current) =>
              current.map((m) =>
                m.id === row.id ? { ...m, attachments: atts } : m
              )
            );
          })();
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

  /* ── Auto-scroll on new messages/notes when user is near the bottom ── */
  const notesLength = notes?.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (wasNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, notesLength]);

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
    setSlashIdx(0);
  }

  /** Insert a slash template — resolved against the REAL thread context
   * at insert time, so the textarea holds exactly what will send. */
  function insertTemplate(template: ComposerTemplate): void {
    const resolved = resolveTemplate(template.body, {
      candidateName: otherPartyName,
      jobTitle: jobTitle ?? "this role",
      senderName: currentUserName,
    });
    setComposerBody(resolved);
    setSlashIdx(0);
    // Refocus + caret to end after React commits the new value.
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }

  /** Save the composer body as an internal team note (application_comments
   * — the same write path as the application page's comments thread).
   * Inert: never emailed, never visible to the candidate. */
  const handleSaveNote = useCallback(async (): Promise<void> => {
    const body = composerBody.trim();
    if (!body) {
      setComposerError("Note cannot be empty.");
      return;
    }
    if (body.length > 4000) {
      setComposerError("Note is too long (4000 character max).");
      return;
    }
    setSubmitting(true);
    setComposerError(null);
    const result = await createApplicationComment({
      applicationId,
      body,
      mentionedUserIds: [],
    });
    if (!result.ok) {
      setComposerError(result.error);
      setSubmitting(false);
      return;
    }
    wasNearBottomRef.current = true;
    onNoteAdded?.({
      id: result.comment.id,
      body: result.comment.body,
      created_at: result.comment.created_at,
      edited_at: result.comment.edited_at,
      author_name: currentUserName,
    });
    setComposerBody("");
    setSubmitting(false);
    toast({
      title: "Note saved",
      body: "Visible to your team only — never sent to the candidate.",
    });
  }, [applicationId, composerBody, currentUserName, onNoteAdded, toast]);

  function handleEditChange(e: ChangeEvent<HTMLTextAreaElement>): void {
    setEditingBody(e.target.value);
    setEditingError(null);
  }

  const handleSubmit = useCallback(async (): Promise<void> => {
    const body = composerBody.trim();
    const filesToSend = stagedFiles;

    // Allow empty body when there's at least one attachment — the server
    // synthesizes a fallback body so the NOT NULL CHECK still passes.
    if (!body && filesToSend.length === 0) {
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
    const optimisticBody =
      body ||
      `Sent ${filesToSend.length} file${filesToSend.length === 1 ? "" : "s"}`;
    const optimistic: ThreadMessage = {
      id: tempId,
      application_id: applicationId,
      sender_user_id: currentUserId,
      sender_role: currentUserRole,
      sender_dso_user_id: null,
      body: optimisticBody,
      read_at: null,
      created_at: nowIso,
      updated_at: nowIso,
      edited_at: null,
      deleted_at: null,
      pending: true,
      attachments: [],
    };
    setMessages((m) => [...m, optimistic]);
    setComposerBody("");
    setStagedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    wasNearBottomRef.current = true;

    const result = await sendApplicationMessage({
      applicationId,
      body,
      attachments: filesToSend,
    });

    if (!result.ok) {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setComposerError(result.error);
      setComposerBody(body);
      setStagedFiles(filesToSend);
      setSubmitting(false);
      return;
    }

    // Swap the optimistic row's id for the canonical one. Realtime INSERT
    // echo will be deduped by id-match. Attachments come back from the
    // server action so we render them immediately without a refetch.
    setMessages((m) =>
      m.map((x) =>
        x.id === tempId
          ? { ...result.message, pending: false }
          : x
      )
    );
    setSubmitting(false);
  }, [applicationId, composerBody, currentUserId, currentUserRole, stagedFiles]);

  function handleFilesPicked(e: ChangeEvent<HTMLInputElement>): void {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;

    setComposerError(null);
    setStagedFiles((current) => {
      const next = [...current];
      for (const file of picked) {
        if (next.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
          setComposerError(
            `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`
          );
          break;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          setComposerError(`"${file.name}" is larger than the 25 MB limit.`);
          continue;
        }
        // De-dupe by name+size — picking the same file twice is almost
        // always an accident, never useful.
        if (
          next.some(
            (f) => f.name === file.name && f.size === file.size
          )
        ) {
          continue;
        }
        next.push(file);
      }
      return next;
    });
    // Reset the input so the same file can be re-picked after a remove.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeStagedFile(index: number): void {
    setStagedFiles((current) => current.filter((_, i) => i !== index));
    setComposerError(null);
  }

  async function handleAttachmentClick(
    attachment: ApplicationMessageAttachment
  ): Promise<void> {
    const result = await getApplicationMessageAttachmentSignedUrl(
      attachment.id
    );
    if (!result.ok) {
      setComposerError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

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

  /* ── Keyboard shortcuts ──
   *
   * Chat convention (iMessage / Slack / Teams / LinkedIn / WhatsApp):
   *   Enter         → send
   *   Shift+Enter   → newline
   *   Cmd/Ctrl+Enter → also sends (back-compat for muscle memory from
   *                    the previous Gmail-style shortcut, and a no-op
   *                    relative to Enter since both submit).
   *
   * We also DO NOT submit if the IME composition is active — that's
   * the textarea's keyboard-composition state used by CJK input
   * methods. Sending on the IME's Enter would eat their final commit.
   */
  function handleComposerKeyDown(
    e: KeyboardEvent<HTMLTextAreaElement>
  ): void {
    // Slash-template picker owns the keyboard while open.
    if (slashOpen && slashMatches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => (i + 1) % slashMatches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx(
          (i) => (i - 1 + slashMatches.length) % slashMatches.length
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        if (e.nativeEvent.isComposing) return;
        e.preventDefault();
        insertTemplate(slashMatches[Math.min(slashIdx, slashMatches.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setComposerBody("");
        return;
      }
    }
    if (e.key !== "Enter") return;
    if (e.shiftKey) return; // newline
    if (e.nativeEvent.isComposing) return; // IME compose — let it through
    e.preventDefault();
    if (noteMode) {
      void handleSaveNote();
      return;
    }
    void handleSubmit();
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
      return;
    }
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    void handleEditSave();
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
      ? "text-danger"
      : remaining < 200
        ? "text-warning"
        : "text-slate-meta";

  const visibleCount = useMemo(
    () => messages.filter((m) => !m.deleted_at).length + (notes?.length ?? 0),
    [messages, notes]
  );

  // ── Unified timeline (Lane 4) ─────────────────────────────────
  // Messages and internal notes interleave by created_at. Notes are
  // inert overlays: they never touch read/unread, optimistic sends, or
  // the realtime subscription (all of which operate on `messages`
  // alone). Sort is stable, so equal timestamps keep messages first.
  type TimelineItem =
    | { kind: "message"; m: ThreadMessage }
    | { kind: "note"; n: ThreadNote };
  const timeline = useMemo<TimelineItem[]>(() => {
    if (!notes || notes.length === 0) {
      return messages.map((m) => ({ kind: "message" as const, m }));
    }
    const items: Array<TimelineItem & { ts: number }> = messages.map((m) => ({
      kind: "message" as const,
      m,
      ts: Date.parse(m.created_at),
    }));
    for (const n of notes) {
      items.push({ kind: "note" as const, n, ts: Date.parse(n.created_at) });
    }
    items.sort((a, b) => a.ts - b.ts);
    return items;
  }, [messages, notes]);

  /* ── Render ── */

  // External-banner copy flips based on which side is viewing. The component
  // is shared between /employer/applications/[id] and /candidate/applications/[id]
  // — same visual treatment, mirrored language so neither side can confuse
  // this surface for an internal/private one.
  const isEmployerView = currentUserRole === "employer";
  const externalAudienceLabel = isEmployerView ? "candidate" : "recruiter";
  const externalAudienceName = otherPartyName;

  return (
    <div className="relative flex flex-col bg-card border-2 border-heritage/30 shadow-[0_0_0_1px_var(--heritage-glow),0_4px_20px_-8px_var(--heritage-glow)] h-full min-h-[480px] overflow-hidden">
      {/* iMessage-style single-window layout. Top banner shrinks
          to a single condensed line; messages flex-grow + scroll;
          composer is pinned to the bottom edge of the same border.
          The disclaimers Cam wanted to keep stay — just compressed
          so the visual rhythm reads as one cohesive surface. */}

      {/* Top banner — External + audience reminder, single row */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-heritage/30 bg-heritage-tint">
        <Eye className="h-3.5 w-3.5 text-heritage-deep shrink-0" />
        <span className="text-[10px] font-bold tracking-[2px] uppercase text-heritage-deep shrink-0">
          External
        </span>
        <span className="text-[12px] text-heritage-deep/90 leading-tight truncate">
          · Visible to {externalAudienceLabel}{" "}
          <span className="font-semibold">{externalAudienceName}</span>{" "}
          {isEmployerView
            ? "· sent via email + applicant dashboard"
            : "· sent via your hiring dashboard"}
        </span>
      </div>

      {/* List — flex-1 takes the remaining vertical space */}
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-card"
      >
        {visibleCount === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="h-5 w-5 text-slate-meta mx-auto mb-2" />
            <p className="text-[14px] text-slate-meta">
              No messages yet. Start the conversation with{" "}
              <span className="font-bold text-ink">{otherPartyName}</span>.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--rule)]">
            {timeline.map((item) => {
              // Internal note — amber, locked, unmistakably not a message.
              // Employer surfaces only (the `notes` prop is never passed on
              // candidate surfaces; RLS would return zero rows regardless).
              if (item.kind === "note") {
                const n = item.n;
                return (
                  <li
                    key={`note-${n.id}`}
                    id={`note-${n.id}`}
                    className="px-4 py-3 bg-warning-bg/70"
                  >
                    <div className="border-l-2 border-warning pl-3">
                      <div className="flex items-baseline gap-2 mb-1 max-w-full">
                        <Lock
                          className="h-3 w-3 text-warning self-center shrink-0"
                          aria-hidden
                        />
                        <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-warning shrink-0">
                          Internal note
                        </span>
                        <span className="text-[14px] font-bold text-ink truncate">
                          {n.author_name}
                        </span>
                        <span
                          className="text-[12px] text-slate-meta whitespace-nowrap"
                          title={new Date(n.created_at).toLocaleString()}
                        >
                          {relativeTime(n.created_at)}
                          {n.edited_at ? " · edited" : ""}
                        </span>
                      </div>
                      <div className="text-[14px] leading-relaxed text-ink whitespace-pre-wrap break-words">
                        {renderNoteBody(n.body)}
                      </div>
                      <p className="mt-1 text-[11px] text-warning/80">
                        Visible to your team only — never sent to the
                        candidate.
                      </p>
                    </div>
                  </li>
                );
              }
              const m = item.m;
              if (m.deleted_at) {
                return (
                  <li
                    key={m.id}
                    id={`message-${m.id}`}
                    className="p-4 text-[13px] text-slate-meta italic"
                  >
                    Message deleted.
                  </li>
                );
              }
              // Day 14 — rich_card messages render as a structured
              // inline card via the RichCardRenderer registry. kind +
              // payload are the markers; falls through to text bubble
              // logic if either is missing.
              if (m.kind === "rich_card" && m.payload) {
                const isMine = m.sender_user_id === currentUserId;
                const senderLabel = isMine ? currentUserName : otherPartyName;
                return (
                  <li
                    key={m.id}
                    id={`message-${m.id}`}
                    className="p-4"
                  >
                    <div
                      className={`flex flex-col ${
                        isMine ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`flex items-baseline gap-2 mb-1.5 max-w-full ${
                          isMine ? "flex-row-reverse" : "flex-row"
                        }`}
                      >
                        <span className="text-[14px] font-bold text-ink truncate">
                          {senderLabel}
                        </span>
                        <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                          {roleLabel(m.sender_role)}
                        </span>
                        <span
                          className="text-[12px] text-slate-meta"
                          title={new Date(m.created_at).toLocaleString()}
                        >
                          {relativeTime(m.created_at)}
                        </span>
                      </div>
                      <RichCardRenderer
                        payload={m.payload}
                        audience={currentUserRole}
                      />
                    </div>
                  </li>
                );
              }
              // Phase 4.8 — system messages render as a thin centered
              // banner instead of an avatar bubble. event_kind being
              // non-NULL is the marker.
              if (m.event_kind) {
                const EventIcon = systemEventIcon(m.event_kind);
                return (
                  <li
                    key={m.id}
                    id={`message-${m.id}`}
                    className="px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-[12px] text-slate-meta italic justify-center">
                      <span
                        className="inline-block h-px flex-1 bg-[var(--rule)]"
                        aria-hidden
                      />
                      <EventIcon className="h-3 w-3 text-heritage-deep" />
                      <span className="px-2 text-center">{m.body}</span>
                      <span
                        className="text-[10px] text-slate-meta whitespace-nowrap"
                        title={new Date(m.created_at).toLocaleString()}
                      >
                        {relativeTime(m.created_at)}
                      </span>
                      <span
                        className="inline-block h-px flex-1 bg-[var(--rule)]"
                        aria-hidden
                      />
                    </div>
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
                      <span className="text-[14px] font-bold text-ink truncate">
                        {senderLabel}
                      </span>
                      <span className="text-[9px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                        {senderRoleLabel}
                      </span>
                      <span
                        className="text-[12px] text-slate-meta"
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
                            className="px-3 py-1.5 bg-primary text-primary-foreground text-[10px] font-bold tracking-[1.5px] uppercase hover:bg-primary/90 transition-colors"
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
                            <span className="text-[13px] text-danger">
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
                        {(m.attachments?.length ?? 0) > 0 && (
                          <ul
                            className={`mt-2 space-y-1 ${
                              m.body ? "pt-2 border-t border-heritage/25" : ""
                            }`}
                          >
                            {(m.attachments ?? []).map((att) => {
                              const Icon = attachmentIcon(att.mime_type);
                              return (
                                <li key={att.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleAttachmentClick(att)
                                    }
                                    className="w-full max-w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md bg-card/70 hover:bg-card border border-heritage/30 text-ink transition-colors"
                                    title={`Open ${att.file_name}`}
                                  >
                                    <Icon className="h-4 w-4 text-heritage-deep shrink-0" />
                                    <span className="truncate text-[13px] font-medium">
                                      {att.file_name}
                                    </span>
                                    <span className="ml-auto text-[11px] text-slate-meta shrink-0">
                                      {formatBytes(att.size_bytes)}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
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
                                className="absolute right-0 top-6 z-10 bg-popover border border-[var(--rule-strong)] shadow-lg min-w-[120px] py-1"
                              >
                                <button
                                  type="button"
                                  onClick={() => startEdit(m)}
                                  className="block w-full text-left px-3 py-1.5 text-[13px] text-ink hover:bg-cream"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDelete(m.id)}
                                  className="block w-full text-left px-3 py-1.5 text-[13px] text-danger hover:bg-cream"
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

      {/* Composer — pinned to the bottom edge of the same window */}
      <div
        className={`relative shrink-0 border-t px-4 py-3 transition-colors ${
          noteMode
            ? "border-warning bg-warning-bg/80"
            : "border-heritage/30 bg-cream/40"
        }`}
      >
        {/* Slash-template picker — floats above the composer row. */}
        {slashOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 z-20 bg-popover border border-heritage/40 shadow-[0_14px_30px_-12px_rgba(7,15,28,0.35)] max-h-72 overflow-y-auto">
            {slashMatches.length === 0 ? (
              <p className="px-3 py-2.5 text-[12px] text-slate-meta">
                No templates match &ldquo;{slashFilter}&rdquo; — keep typing
                to write your own message.
              </p>
            ) : (
              <ul>
                {slashMatches.map((t, i) => (
                  <li key={t.slug}>
                    <button
                      type="button"
                      onMouseEnter={() => setSlashIdx(i)}
                      onClick={() => insertTemplate(t)}
                      className={`w-full text-left px-3 py-2 border-b border-[var(--rule)] last:border-b-0 transition-colors ${
                        i === slashIdx ? "bg-heritage/10" : "bg-popover"
                      }`}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-[12px] font-bold text-heritage-deep shrink-0">
                          {t.label}
                        </span>
                        <span className="text-[12px] text-slate-meta truncate">
                          {t.description}
                        </span>
                      </span>
                      {i === slashIdx && (
                        <span className="block mt-1 text-[12px] leading-relaxed text-ink/80 whitespace-pre-wrap max-h-24 overflow-hidden">
                          {renderTemplatePreview(t.body)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-3 py-1.5 text-[10px] text-slate-meta border-t border-[var(--rule)] bg-cream/40">
              <span className="font-mono">↑↓</span> choose ·{" "}
              <span className="font-mono">↩</span> insert ·{" "}
              <span className="font-mono">Esc</span> dismiss — fields fill
              from this conversation
            </p>
          </div>
        )}
        {noteMode ? (
          /* Note-mode strip replaces the medical reminder. */
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-warning mb-2 leading-snug">
            <Lock className="h-3 w-3 shrink-0" aria-hidden />
            Internal note — added to the timeline for your team only, never
            sent to the candidate.
          </p>
        ) : (
          /* Compressed medical-info reminder — single line italic */
          <p className="text-[11px] italic text-heritage-deep/80 mb-2 leading-snug">
            Don&apos;t share medical information here — discuss accommodations
            directly with HR.
          </p>
        )}
        {stagedFiles.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-2">
            {stagedFiles.map((file, i) => {
              const Icon = attachmentIcon(file.type);
              return (
                <li
                  key={`${file.name}-${file.size}-${i}`}
                  className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-card border border-heritage/30 max-w-[260px]"
                >
                  <Icon className="h-3.5 w-3.5 text-heritage-deep shrink-0" />
                  <span className="truncate text-[12px] text-ink font-medium">
                    {file.name}
                  </span>
                  <span className="text-[10px] text-slate-meta shrink-0">
                    {formatBytes(file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeStagedFile(i)}
                    aria-label={`Remove ${file.name}`}
                    className="text-slate-meta hover:text-ink transition-colors shrink-0"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            onChange={handleFilesPicked}
            className="hidden"
          />
          {noteModeAvailable && (
            <button
              type="button"
              onClick={() => {
                setNoteMode((v) => !v);
                setComposerError(null);
              }}
              aria-pressed={noteMode}
              aria-label={
                noteMode ? "Switch back to message" : "Switch to internal note"
              }
              title={
                noteMode
                  ? "Back to messaging the candidate"
                  : "Internal note — visible to your team only"
              }
              className={`px-2 py-2 border transition-colors shrink-0 ${
                noteMode
                  ? "bg-warning-bg border-warning text-warning"
                  : "bg-card border-heritage/40 text-heritage-deep hover:text-ink hover:border-heritage"
              }`}
            >
              <Lock className="h-4 w-4" />
            </button>
          )}
          {!noteMode && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={
                submitting || stagedFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE
              }
              aria-label="Attach files"
              title={
                stagedFiles.length >= MAX_ATTACHMENTS_PER_MESSAGE
                  ? `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`
                  : "Attach files (PDF, image, doc, txt — 25 MB max each)"
              }
              className="px-2 py-2 bg-card border border-heritage/40 text-heritage-deep hover:text-ink hover:border-heritage transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          )}
          <textarea
            ref={composerRef}
            value={composerBody}
            onChange={handleComposerChange}
            onKeyDown={handleComposerKeyDown}
            rows={2}
            maxLength={MAX_BODY}
            placeholder={
              noteMode
                ? "Internal note for your team…"
                : slashEnabled
                  ? `Message ${otherPartyName}… ("/" for templates)`
                  : `Message ${otherPartyName}…`
            }
            className={`flex-1 px-3 py-2 text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:ring-1 transition-colors leading-relaxed resize-none border ${
              noteMode
                ? "bg-warning-bg border-warning focus:border-warning focus:ring-warning"
                : "bg-card border-heritage/40 focus:border-heritage focus:ring-heritage"
            }`}
          />
          <button
            type="button"
            onClick={() =>
              noteMode ? void handleSaveNote() : void handleSubmit()
            }
            disabled={
              submitting ||
              (composerBody.trim().length === 0 &&
                (noteMode || stagedFiles.length === 0))
            }
            className={`px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0 ${
              noteMode
                ? "bg-warning text-warning-foreground hover:bg-warning/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            {submitting
              ? noteMode
                ? "Saving…"
                : "Sending…"
              : noteMode
                ? "Save note"
                : "Send"}
          </button>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-meta flex-wrap">
          <span>
            <span className="font-mono">↩</span> {noteMode ? "saves" : "sends"},{" "}
            <span className="font-mono">Shift+↩</span> for newline
            {slashEnabled && (
              <>
                , <span className="font-mono">/</span> for templates
              </>
            )}
          </span>
          <span className={remainingClass}>
            {remaining} characters left
          </span>
          {stagedFiles.length > 0 && (
            <span>
              {stagedFiles.length}/{MAX_ATTACHMENTS_PER_MESSAGE} attachments
            </span>
          )}
          {composerError && (
            <span className="text-[11px] text-danger">{composerError}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Map event_kind → icon for the system-message banner. Falls back to
 * Eye for any unrecognized event kind so future events render with a
 * generic-but-on-brand glyph until we wire a specific one.
 */
function systemEventIcon(eventKind: string): LucideIcon {
  switch (eventKind) {
    case "stage_changed":
      return CheckCircle2;
    case "application_received":
      return Inbox;
    case "application_withdrawn":
      return XIcon;
    case "job_filled":
      return Briefcase;
    case "interview_proposed":
      return Calendar;
    case "interview_booked":
      return CheckCircle2;
    case "interview_cancelled":
      return XIcon;
    default:
      return Eye;
  }
}
