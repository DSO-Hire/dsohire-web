"use client";

/**
 * <InboxView> — shared 2-pane inbox UI (Phase 4.8).
 *
 * Used by both /employer/inbox and /candidate/inbox. The audience
 * prop drives:
 *   • Which filter dropdowns render (employer = Job + Location +
 *     Stage; candidate = Job only).
 *   • Which sender_role counts as "incoming" for unread (employer
 *     reads candidate messages; candidate reads employer messages).
 *   • Stage labels.
 *
 * Realtime: subscribes to application_messages INSERT events on
 * mount. New rows for threads we already know about bump the thread
 * to the top + increment unread; new rows for an unknown thread (e.g.
 * a freshly-applied candidate sending their first message) are
 * deferred to the next page reload — Inbox v0 doesn't lazy-fetch
 * thread metadata. v1 can subscribe to applications too.
 *
 * URL state: the active thread lives in `?app=<application_id>` so
 * the URL is shareable + back/forward works. selectThread updates
 * the URL via router.replace (no history entry per click).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Inbox as InboxIcon,
  Search as SearchIcon,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  X,
} from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
  type RealtimePostgresInsertPayload,
} from "@supabase/supabase-js";
import { Avatar } from "@/components/ui/avatar";
import { MessagesThread } from "@/components/messaging/messages-thread";
import type { ApplicationMessageRow } from "@/lib/messages/actions";
import type { InboxThread, ThreadNote } from "@/lib/inbox/types";
import {
  archiveThread,
  unarchiveThread,
  markThreadRead,
  getThreadNotes,
} from "@/lib/inbox/actions";

type Audience = "employer" | "candidate";
type Tab = "all" | "unread" | "archived";

// Keyed by stage kind (the system category snapshot delivered by the
// inbox composer). The candidate-side surface uses CANDIDATE_KIND_LABELS
// (canonical funnel: "Submitted" / "Interviewing" / "Offer extended")
// while the employer-side uses KIND_DEFAULT_LABELS ("New" / "Interview"
// / "Offer"). Pick the right map based on `audience` at render time.
// Per-DSO label customizations aren't surfaced here either way.
const EMPLOYER_STAGE_LABELS: Record<string, string> = {
  open: "New",
  screen: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
const CANDIDATE_STAGE_LABELS: Record<string, string> = {
  open: "Submitted",
  screen: "Reviewed",
  interview: "Interviewing",
  offer: "Offer extended",
  hired: "Hired",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
};

export interface InboxViewProps {
  audience: Audience;
  threads: InboxThread[];
  currentUserId: string;
  currentUserName: string;
  initialActiveApplicationId: string | null;
  initialActiveMessages: ApplicationMessageRow[];
  /**
   * Internal team notes for the initially-active thread (Lane 4 unified
   * timeline). Employer audience only — the candidate inbox page never
   * supplies this, and the notes fetch is audience-gated client-side too.
   */
  initialActiveNotes?: ThreadNote[];
}

export function InboxView({
  audience,
  threads: initialThreads,
  currentUserId,
  currentUserName,
  initialActiveApplicationId,
  initialActiveMessages,
  initialActiveNotes,
}: InboxViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pick stage label map per audience. Candidate side reads the
  // canonical funnel ("Interviewing"); employer side reads the
  // operational labels ("Interview").
  const STAGE_LABELS =
    audience === "candidate" ? CANDIDATE_STAGE_LABELS : EMPLOYER_STAGE_LABELS;

  const [threads, setThreads] = useState<InboxThread[]>(initialThreads);
  const [activeMessages, setActiveMessages] = useState<ApplicationMessageRow[]>(
    initialActiveMessages
  );
  // Internal team notes interleave into the unified timeline (employer
  // only). Fetched per-thread via the RLS-scoped getThreadNotes action.
  const [activeNotes, setActiveNotes] = useState<ThreadNote[]>(
    initialActiveNotes ?? []
  );
  const [activeId, setActiveId] = useState<string | null>(
    initialActiveApplicationId
  );
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [jobFilter, setJobFilter] = useState<string>("");
  const [locationFilter, setLocationFilter] = useState<string>("");
  const [stageFilter, setStageFilter] = useState<string>("");
  const [, startWork] = useTransition();
  const [busy, setBusy] = useState(false);

  // ── Filter facets ────────────────────────────────────────────
  const jobOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of threads) seen.set(t.job_id, t.job_title);
    return Array.from(seen.entries()).map(([id, title]) => ({ id, title }));
  }, [threads]);

  const locationOptions = useMemo(() => {
    if (audience !== "employer") return [];
    const seen = new Map<string, string>();
    for (const t of threads) {
      if (t.location_id && t.location_name) {
        seen.set(t.location_id, t.location_name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [threads, audience]);

  const stageOptions = useMemo(() => {
    if (audience !== "employer") return [];
    const seen = new Set<string>();
    for (const t of threads) if (t.stage) seen.add(t.stage);
    return Array.from(seen);
  }, [threads, audience]);

  // ── Filtered + sorted thread list ────────────────────────────
  const filteredThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((t) => {
      // Tab filter
      if (tab === "unread" && t.unread_count === 0) return false;
      if (tab === "archived" && !t.archived) return false;
      if (tab === "all" && t.archived) return false;
      // Search filter
      if (q.length > 0) {
        const haystack = `${t.peer.display_name} ${t.job_title}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      // Dropdowns
      if (jobFilter && t.job_id !== jobFilter) return false;
      if (locationFilter && t.location_id !== locationFilter) return false;
      if (stageFilter && t.stage !== stageFilter) return false;
      return true;
    });
  }, [threads, tab, query, jobFilter, locationFilter, stageFilter]);

  // Counts for the tab strip — count over the unfiltered list with
  // tab-specific gating only (no search/dropdowns), so the tabs always
  // tell the user how many threads they'd see.
  const tabCounts = useMemo(() => {
    let allCount = 0;
    let unreadCount = 0;
    let archivedCount = 0;
    for (const t of threads) {
      if (t.archived) archivedCount += 1;
      else {
        allCount += 1;
        if (t.unread_count > 0) unreadCount += 1;
      }
    }
    return { allCount, unreadCount, archivedCount };
  }, [threads]);

  // ── Active thread helpers ────────────────────────────────────
  const activeThread = activeId
    ? threads.find((t) => t.application_id === activeId) ?? null
    : null;

  const selectThread = useCallback(
    (thread: InboxThread) => {
      setActiveId(thread.application_id);
      // Optimistically clear the unread count locally; markThreadRead
      // confirms server-side.
      setThreads((prev) =>
        prev.map((t) =>
          t.application_id === thread.application_id
            ? { ...t, unread_count: 0 }
            : t
        )
      );
      // Push URL state without a history entry per click.
      const params = new URLSearchParams(searchParams);
      params.set("app", thread.application_id);
      router.replace(`?${params.toString()}`, { scroll: false });

      // Fetch messages for the right pane.
      void fetchActiveMessages(thread.application_id);

      // Internal notes for the unified timeline — employer side only.
      // Clear first so a slow fetch never shows the previous thread's
      // notes against the new thread's messages.
      setActiveNotes([]);
      if (audience === "employer") {
        void getThreadNotes(thread.application_id).then(setActiveNotes);
      }

      // Mark all incoming messages on this thread read, then refresh
      // so the shell-rendered inbox-unread badge picks up the new
      // count without requiring a navigation. (Cam ask: the inbox
      // counter was intermittent — the missing piece was that the
      // shell isn't a client component and doesn't re-fetch on its
      // own when read_at is updated mid-page.)
      void markThreadRead(thread.application_id).then(() => {
        router.refresh();
      });
    },
    [router, searchParams, audience]
  );

  const fetchActiveMessages = useCallback(
    async (applicationId: string) => {
      const supabase = createSupabaseBrowserClient();
      // Single-level embed of application_message_attachments — same
      // shape as APPLICATION_MESSAGE_SELECT in lib/inbox/queries.ts.
      // Inlined here because that file is server-only.
      const { data, error } = await supabase
        .from("application_messages")
        .select(
          "id, application_id, sender_user_id, sender_role, sender_dso_user_id, body, read_at, created_at, updated_at, edited_at, deleted_at, event_kind, kind, payload, application_message_attachments(id, message_id, storage_path, file_name, mime_type, size_bytes, created_at)"
        )
        .eq("application_id", applicationId)
        .order("created_at", { ascending: true });
      if (error) {
        // Don't silently coerce — log so it's visible, then clear the pane
        // to match prior behavior (an error read shouldn't leave a stale
        // list on screen for the new thread the user just clicked).
        console.warn("[inbox] fetchActiveMessages", error);
        setActiveMessages([]);
        return;
      }
      const projected = ((data ?? []) as Array<Record<string, unknown>>).map(
        (row) => ({
          id: row.id,
          application_id: row.application_id,
          sender_user_id: row.sender_user_id,
          sender_role: row.sender_role,
          sender_dso_user_id: row.sender_dso_user_id,
          body: row.body,
          read_at: row.read_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          edited_at: row.edited_at,
          deleted_at: row.deleted_at,
          event_kind: row.event_kind,
          kind: row.kind,
          payload: row.payload,
          attachments:
            (row.application_message_attachments as
              | Array<Record<string, unknown>>
              | null) ?? [],
        })
      );
      setActiveMessages(projected as unknown as ApplicationMessageRow[]);
    },
    []
  );

  // ── Mobile single-pane drilldown ─────────────────────────────
  const goBackToList = () => {
    setActiveId(null);
    setActiveMessages([]);
    setActiveNotes([]);
    const params = new URLSearchParams(searchParams);
    params.delete("app");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : `?`, { scroll: false });
  };

  // ── Archive toggles ──────────────────────────────────────────
  const onArchive = (thread: InboxThread) => {
    setBusy(true);
    startWork(async () => {
      const result = await archiveThread(thread.application_id);
      setBusy(false);
      if (!result.ok) return;
      setThreads((prev) =>
        prev.map((t) =>
          t.application_id === thread.application_id
            ? { ...t, archived: true }
            : t
        )
      );
      // If we just archived the open thread, drop selection.
      if (activeId === thread.application_id) {
        goBackToList();
      }
    });
  };

  const onUnarchive = (thread: InboxThread) => {
    setBusy(true);
    startWork(async () => {
      const result = await unarchiveThread(thread.application_id);
      setBusy(false);
      if (!result.ok) return;
      setThreads((prev) =>
        prev.map((t) =>
          t.application_id === thread.application_id
            ? { ...t, archived: false }
            : t
        )
      );
    });
  };

  // ── Realtime subscription ────────────────────────────────────
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`inbox-${audience}-${currentUserId}`)
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "application_messages",
        },
        (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
          const row = payload.new;
          const appId = row.application_id as string;
          const senderRole = row.sender_role as "candidate" | "employer";
          const body = (row.body as string | null) ?? "";
          const createdAt = (row.created_at as string | null) ?? new Date().toISOString();
          const eventKind = (row.event_kind as string | null) ?? null;
          const otherSide = audience === "candidate" ? "employer" : "candidate";

          setThreads((prev) => {
            const existing = prev.find((t) => t.application_id === appId);
            if (!existing) {
              // Inbox v0 skips lazy-fetching new applications; they
              // appear on next page reload.
              return prev;
            }
            const isIncoming = senderRole === otherSide;
            const isActive = activeId === appId;
            const updated: InboxThread = {
              ...existing,
              last_message_at: createdAt,
              last_message_preview: shortPreview(body),
              last_message_sender_role: senderRole,
              last_message_event_kind: eventKind,
              unread_count:
                isIncoming && !isActive
                  ? existing.unread_count + 1
                  : existing.unread_count,
            };
            const without = prev.filter((t) => t.application_id !== appId);
            return [updated, ...without];
          });

          // Don't touch activeMessages here — <MessagesThread> owns its
          // own realtime subscription scoped to applicationId and will
          // append the row to the right pane itself. Appending here too
          // would duplicate-render the message until MessagesThread's
          // self-echo dedupe runs.
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [audience, currentUserId, activeId]);

  // ── Render ───────────────────────────────────────────────────
  const showFilters =
    jobOptions.length > 0 ||
    locationOptions.length > 0 ||
    stageOptions.length > 0;

  return (
    <div className="flex flex-col">
      <header className="mb-6 max-w-[820px]">
        <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
          Inbox
        </div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
          {audience === "employer"
            ? "Every candidate conversation in one place."
            : "Every conversation about your applications."}
        </h1>
      </header>

      {/* Fixed-height window — viewport minus the nav + page padding
          + section header. Cap at 800px so it doesn't go absurdly tall
          on huge monitors. MessagesThread + the list pane both scroll
          internally inside this box (iMessage-style).
          NOTE: overflow-hidden + [grid-template-rows:minmax(0,1fr)] are
          load-bearing. Without minmax(0,1fr) the grid auto-row expands
          to fit intrinsic content (long thread → stretched page) even
          when the container has a fixed height. With overflow-hidden,
          any rogue child that ignores h-full gets clipped to the box. */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 h-[calc(100svh-200px)] max-h-[820px] min-h-[480px] [grid-template-rows:minmax(0,1fr)] overflow-hidden">
        {/* ─── List pane ─── */}
        <section
          className={`border border-[var(--rule)] bg-white flex-col min-h-0 overflow-hidden ${
            activeId ? "hidden lg:flex" : "flex"
          }`}
        >
          {/* Tab strip */}
          <div className="flex border-b border-[var(--rule)]">
            <TabButton
              label="All"
              count={tabCounts.allCount}
              active={tab === "all"}
              onClick={() => setTab("all")}
            />
            <TabButton
              label="Unread"
              count={tabCounts.unreadCount}
              active={tab === "unread"}
              onClick={() => setTab("unread")}
              badge
            />
            <TabButton
              label="Archived"
              count={tabCounts.archivedCount}
              active={tab === "archived"}
              onClick={() => setTab("archived")}
            />
          </div>

          {/* Search + filters */}
          <div className="border-b border-[var(--rule)] p-3 space-y-2">
            <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-cream px-3 py-2 text-sm focus-within:border-heritage focus-within:ring-1 focus-within:ring-heritage">
              <SearchIcon className="size-4 text-slate-meta" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  audience === "employer"
                    ? "Search candidate or job…"
                    : "Search DSO or job…"
                }
                className="flex-1 bg-transparent outline-none placeholder:text-slate-meta"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X className="size-3.5 text-slate-meta hover:text-ink" />
                </button>
              )}
            </div>

            {showFilters && (
              <div className="flex flex-wrap gap-2">
                {jobOptions.length > 0 && (
                  <FilterDropdown
                    label="Job"
                    value={jobFilter}
                    onChange={setJobFilter}
                    options={jobOptions.map((j) => ({
                      value: j.id,
                      label: j.title,
                    }))}
                  />
                )}
                {audience === "employer" && locationOptions.length > 0 && (
                  <FilterDropdown
                    label="Location"
                    value={locationFilter}
                    onChange={setLocationFilter}
                    options={locationOptions.map((l) => ({
                      value: l.id,
                      label: l.name,
                    }))}
                  />
                )}
                {audience === "employer" && stageOptions.length > 0 && (
                  <FilterDropdown
                    label="Stage"
                    value={stageFilter}
                    onChange={setStageFilter}
                    options={stageOptions.map((s) => ({
                      value: s,
                      label: STAGE_LABELS[s] ?? s,
                    }))}
                  />
                )}
              </div>
            )}
          </div>

          {/* Thread list */}
          <ul className="flex-1 overflow-y-auto list-none divide-y divide-[var(--rule)]">
            {filteredThreads.length === 0 ? (
              <li className="p-8 text-center text-sm text-slate-meta">
                {tab === "archived" ? (
                  "No archived threads."
                ) : tab === "unread" ? (
                  "Inbox zero. ✨"
                ) : (
                  <span>
                    No conversations yet.
                    <a
                      href={
                        audience === "employer"
                          ? "/employer/applications"
                          : "/candidate/applications"
                      }
                      className="mt-2 block font-semibold text-heritage hover:text-heritage-deep underline underline-offset-2"
                    >
                      {audience === "employer"
                        ? "Open applications →"
                        : "View your applications →"}
                    </a>
                  </span>
                )}
              </li>
            ) : (
              filteredThreads.map((thread) => (
                <ThreadRow
                  key={thread.application_id}
                  thread={thread}
                  audience={audience}
                  active={thread.application_id === activeId}
                  onSelect={() => selectThread(thread)}
                  onArchive={() => onArchive(thread)}
                  onUnarchive={() => onUnarchive(thread)}
                  busy={busy}
                />
              ))
            )}
          </ul>
        </section>

        {/* ─── Active thread pane ───
            min-h-0 + overflow-hidden are load-bearing here so that the
            inner flex-1 wrapper can compute its remaining height and
            MessagesThread's h-full resolves to the bounded section
            height rather than the intrinsic message-list height. */}
        <section
          className={`border border-[var(--rule)] bg-white flex-col min-h-0 overflow-hidden ${
            activeId ? "flex" : "hidden lg:flex"
          }`}
        >
          {activeThread ? (
            <>
              {/* Header */}
              <div className="border-b border-[var(--rule)] px-5 py-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={goBackToList}
                  className="lg:hidden rounded-md p-1.5 hover:bg-cream"
                  aria-label="Back to list"
                >
                  <ArrowLeft className="size-4 text-slate-meta" />
                </button>
                <Avatar
                  name={activeThread.peer.display_name}
                  imageUrl={activeThread.peer.avatar_url}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {activeThread.peer.display_name}
                  </p>
                  <p className="text-xs text-slate-meta truncate">
                    {/* Cam ask: the application must be a clickable link
                        from the inbox thread. Title routes to the
                        audience-correct application detail page. */}
                    <Link
                      href={`/${audience}/applications/${activeThread.application_id}`}
                      className="inline-flex items-center gap-1 text-heritage-deep hover:text-ink underline-offset-2 hover:underline transition-colors"
                      title="Open this application"
                    >
                      {activeThread.job_title}
                      <ArrowUpRight className="size-3" aria-hidden="true" />
                    </Link>
                    {activeThread.stage &&
                      ` · ${STAGE_LABELS[activeThread.stage] ?? activeThread.stage}`}
                  </p>
                </div>
                {activeThread.archived ? (
                  <button
                    type="button"
                    onClick={() => onUnarchive(activeThread)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-cream disabled:opacity-50"
                    title="Unarchive thread"
                  >
                    <ArchiveRestore className="size-3.5" />
                    Unarchive
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onArchive(activeThread)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-cream disabled:opacity-50"
                    title="Archive thread"
                  >
                    <Archive className="size-3.5" />
                    Archive
                  </button>
                )}
              </div>

              {/* Thread + composer — bleeds edge-to-edge horizontally.
                  Cam 2026-05-07: messaging window should fill the right
                  pane, not sit inside padding. Header above keeps its
                  own padding so the icon/peer-name row stays inset.
                  MessagesThread owns its own scroll so the wrapper just
                  needs `min-h-0` for the flex overflow. */}
              <div className="flex-1 min-h-0 flex">
                <MessagesThread
                  key={activeThread.application_id}
                  applicationId={activeThread.application_id}
                  currentUserId={currentUserId}
                  currentUserRole={audience}
                  currentUserName={currentUserName}
                  otherPartyName={activeThread.peer.display_name}
                  initialMessages={activeMessages}
                  notes={audience === "employer" ? activeNotes : undefined}
                />
              </div>
            </>
          ) : (
            <EmptyRightPane audience={audience} />
          )}
        </section>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Subcomponents
 * ─────────────────────────────────────────────────────────── */

function TabButton({
  label,
  count,
  active,
  onClick,
  badge,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  badge?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2.5 text-[13px] font-semibold transition-colors border-b-2 ${
        active
          ? "border-heritage-deep text-ink bg-cream/40"
          : "border-transparent text-slate-meta hover:text-ink hover:bg-cream/20"
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`ml-1.5 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
            badge && count > 0 && !active
              ? "bg-heritage-deep text-ivory"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function FilterDropdown({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-heritage focus:border-heritage focus:outline-none focus:ring-1 focus:ring-heritage"
    >
      <option value="">{label}: All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {label}: {o.label}
        </option>
      ))}
    </select>
  );
}

function ThreadRow({
  thread,
  audience,
  active,
  onSelect,
  onArchive,
  onUnarchive,
  busy,
}: {
  thread: InboxThread;
  audience: Audience;
  active: boolean;
  onSelect: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  busy: boolean;
}) {
  return (
    <li
      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
        active ? "bg-cream" : "hover:bg-cream/40"
      }`}
      onClick={onSelect}
    >
      <Avatar
        name={thread.peer.display_name}
        imageUrl={thread.peer.avatar_url}
        size="sm"
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={`text-[13px] truncate ${
              thread.unread_count > 0 && !active
                ? "font-bold text-ink"
                : "font-semibold text-ink"
            }`}
          >
            {thread.peer.display_name}
          </p>
          {thread.last_message_at && (
            <span className="text-[10px] text-slate-meta whitespace-nowrap shrink-0">
              {timeAgo(thread.last_message_at)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-meta truncate">
          {thread.job_title}
        </p>
        {thread.last_message_preview && (
          <p
            className={`mt-1 text-[12px] truncate ${
              thread.unread_count > 0 && !active
                ? "text-ink"
                : "text-slate-body"
            } ${thread.last_message_event_kind ? "italic text-slate-meta" : ""}`}
          >
            {/* Skip the "You:" prefix on system messages — system isn't anyone */}
            {thread.last_message_event_kind == null &&
            thread.last_message_sender_role &&
            isSelfSent(thread.last_message_sender_role, audience) ? (
              <span className="text-slate-meta">You: </span>
            ) : null}
            {thread.last_message_preview}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {thread.unread_count > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-heritage-deep px-1.5 py-0.5 text-[10px] font-bold text-ivory">
            {thread.unread_count}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            thread.archived ? onUnarchive() : onArchive();
          }}
          disabled={busy}
          className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-slate-meta hover:bg-white hover:text-ink disabled:opacity-40 transition-opacity"
          title={thread.archived ? "Unarchive" : "Archive"}
          aria-label={thread.archived ? "Unarchive thread" : "Archive thread"}
        >
          {thread.archived ? (
            <ArchiveRestore className="size-3.5" />
          ) : (
            <Archive className="size-3.5" />
          )}
        </button>
      </div>
    </li>
  );
}

function EmptyRightPane({ audience }: { audience: Audience }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
      <InboxIcon className="size-10 text-heritage-deep/40 mb-3" />
      <p className="font-display text-base font-bold text-ink mb-1">
        Pick a conversation
      </p>
      <p className="text-sm text-slate-body max-w-[320px]">
        {audience === "employer"
          ? "Click a thread on the left to read or reply. New messages bubble to the top in real time."
          : "Click a thread on the left to see the conversation. We surface new replies the moment they land."}
      </p>
      <p className="mt-3 inline-flex items-center gap-1 text-xs text-slate-meta">
        <CheckCheck className="size-3" />
        Read receipts on
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
 * Helpers
 * ─────────────────────────────────────────────────────────── */

function shortPreview(body: string): string {
  const clean = body.trim().replace(/\s+/g, " ");
  return clean.length > 140 ? `${clean.slice(0, 137)}…` : clean;
}

function isSelfSent(
  senderRole: "candidate" | "employer",
  audience: Audience
): boolean {
  return senderRole === audience;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
