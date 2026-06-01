"use client";

/**
 * ChatWidget — the bottom-right pop-up chat (Day 24). LinkedIn/Intercom-style:
 * a floating launcher with a live unread badge, opening a docked panel that
 * slides between a conversation LIST and a single CONVERSATION view. Handles
 * two thread kinds through one UI: teammate DMs (dm_* tables) and candidate
 * threads (application inbox). Live via Supabase realtime; teammate presence
 * via a realtime presence channel. Optimistic send, Enter-to-send.
 *
 * Mounted once in EmployerShell, so it rides every employer page.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle, X, ChevronLeft, ChevronUp, Search, Plus, Send, Loader2,
} from "lucide-react";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { sendApplicationMessage } from "@/lib/messages/actions";
import {
  listChatThreads, listTeammates, findOrCreateDmConversation,
  getDmThreadMessages, getCandidateThreadMessages, sendDmMessage, markDmRead,
} from "@/lib/chat/actions";
import type { ChatThread, ChatMessage, ChatTeammate } from "@/lib/chat/types";

function relTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type View = "list" | "thread" | "new";

export function ChatWidget({ dsoId, authId }: { dsoId: string; authId: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("list");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [active, setActive] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [teammates, setTeammates] = useState<ChatTeammate[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [query, setQuery] = useState("");

  const activeRef = useRef<ChatThread | null>(null);
  activeRef.current = active;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  const loadThreads = useCallback(async () => {
    setThreads(await listChatThreads());
  }, []);

  const loadMessages = useCallback(async (t: ChatThread) => {
    setLoadingMsgs(true);
    const msgs =
      t.kind === "dm"
        ? await getDmThreadMessages(t.id)
        : await getCandidateThreadMessages(t.id);
    setMessages(msgs);
    setLoadingMsgs(false);
    if (t.kind === "dm") {
      await markDmRead(t.id);
      void loadThreads();
    }
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
  }, [loadThreads]);

  // Initial load (so the badge is live even before opening).
  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Realtime: new messages + teammate presence.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const scheduleRefresh = () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void loadThreads();
        const a = activeRef.current;
        if (a) void loadMessages(a);
      }, 400);
    };

    const presence = supabase.channel(`dso-presence-${dsoId}`, {
      config: { presence: { key: authId } },
    });
    presence
      .on(REALTIME_LISTEN_TYPES.PRESENCE, { event: "sync" }, () => {
        setOnline(new Set(Object.keys(presence.presenceState())));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presence.track({ online_at: Date.now() });
        }
      });

    const msgChannel = supabase
      .channel(`chat-msgs-${authId}`)
      .on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        { event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT, schema: "public", table: "dm_messages" },
        scheduleRefresh)
      .on(REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        { event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT, schema: "public", table: "application_messages" },
        scheduleRefresh)
      .subscribe();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(presence);
      void supabase.removeChannel(msgChannel);
    };
  }, [dsoId, authId, loadThreads, loadMessages]);

  const openThread = (t: ChatThread) => {
    setActive(t);
    setView("thread");
    setMessages([]);
    void loadMessages(t);
  };

  const openNew = async () => {
    setView("new");
    if (teammates.length === 0) setTeammates(await listTeammates());
  };

  const startDm = async (mate: ChatTeammate) => {
    const res = await findOrCreateDmConversation(mate.dso_user_id);
    if (!res.ok) return;
    const t: ChatThread = {
      kind: "dm", id: res.conversationId, title: mate.name,
      subtitle: mate.role, last_message: null, last_at: null, unread: 0,
      initials: mate.initials, other_auth_id: mate.auth_user_id,
    };
    await loadThreads();
    openThread(t);
  };

  const send = async () => {
    const a = activeRef.current;
    const text = draft.trim();
    if (!a || !text || sending) return;
    setSending(true);
    setDraft("");
    const optimistic: ChatMessage = {
      id: `tmp-${Date.now()}`, body: text, created_at: new Date().toISOString(),
      mine: true, sender_name: "You",
    };
    setMessages((m) => [...m, optimistic]);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    if (a.kind === "dm") await sendDmMessage(a.id, text);
    else await sendApplicationMessage({ applicationId: a.id, body: text });
    setSending(false);
    void loadMessages(a);
    void loadThreads();
  };

  const filtered = threads.filter((t) =>
    !query.trim() ? true : t.title.toLowerCase().includes(query.trim().toLowerCase())
  );
  const dmThreads = filtered.filter((t) => t.kind === "dm");
  const candThreads = filtered.filter((t) => t.kind === "candidate");

  return (
    <div className="fixed bottom-0 right-6 z-[55] print:hidden">
      {open ? (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-5rem)] bg-white border border-[var(--rule-strong)] border-b-0 shadow-2xl rounded-t-lg overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-ink text-ivory px-4 py-3 flex items-center gap-2 shrink-0">
            {view !== "list" ? (
              <button onClick={() => setView("list")} aria-label="Back"
                className="text-ivory/80 hover:text-ivory"><ChevronLeft className="h-5 w-5" /></button>
            ) : (
              <MessageCircle className="h-4 w-4 text-[var(--heritage-bright,#8db8a3)]" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold tracking-[0.3px] truncate">
                {view === "thread" && active ? active.title
                  : view === "new" ? "New message" : "Messages"}
              </div>
              {view === "thread" && active && (
                <div className="text-[10px] text-ivory/60 flex items-center gap-1.5">
                  {active.kind === "dm" && active.other_auth_id && online.has(active.other_auth_id) && (
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--heritage-bright,#8db8a3)]" />
                  )}
                  {active.kind === "dm"
                    ? (active.other_auth_id && online.has(active.other_auth_id) ? "Active now" : active.subtitle)
                    : active.subtitle}
                </div>
              )}
            </div>
            {view === "list" && (
              <button onClick={openNew} aria-label="New message" className="text-ivory/80 hover:text-ivory">
                <Plus className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-ivory/80 hover:text-ivory">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto">
              <div className="p-2 border-b border-[var(--rule)]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-meta" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search conversations"
                    className="w-full h-8 pl-8 pr-3 bg-cream border border-[var(--rule)] text-[13px] text-ink focus:outline-none focus:border-heritage" />
                </div>
              </div>
              {threads.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-slate-meta">
                  No conversations yet. Tap + to message a teammate.
                </div>
              ) : (
                <>
                  <ThreadGroup label="Teammates" items={dmThreads} online={online} onOpen={openThread} />
                  <ThreadGroup label="Candidates" items={candThreads} online={online} onOpen={openThread} />
                </>
              )}
            </div>
          )}

          {view === "new" && (
            <div className="flex-1 overflow-y-auto">
              <div className="px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                Your team
              </div>
              {teammates.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-slate-meta">No teammates yet.</div>
              ) : teammates.map((mate) => (
                <button key={mate.dso_user_id} onClick={() => startDm(mate)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-cream/60 text-left">
                  <Avatar initials={mate.initials} online={!!mate.auth_user_id && online.has(mate.auth_user_id)} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink truncate">{mate.name}</div>
                    <div className="text-[11px] text-slate-meta">{mate.role}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {view === "thread" && active && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 bg-cream/30 space-y-2">
                {loadingMsgs ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-slate-meta" /></div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-[12px] text-slate-meta py-6">
                    No messages yet. Say hello.
                  </div>
                ) : messages.map((m) => (
                  <div key={m.id} className={"flex " + (m.mine ? "justify-end" : "justify-start")}>
                    <div className={"max-w-[78%] px-3 py-2 text-[13px] leading-snug " +
                      (m.mine ? "bg-heritage text-ivory" : "bg-white border border-[var(--rule)] text-ink")}>
                      {m.body}
                      <div className={"mt-0.5 text-[9px] " + (m.mine ? "text-ivory/60" : "text-slate-meta")}>
                        {relTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--rule)] p-2 flex items-end gap-2 shrink-0">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  rows={1} placeholder="Write a message…"
                  className="flex-1 resize-none max-h-24 px-3 py-2 bg-cream border border-[var(--rule)] text-[13px] text-ink focus:outline-none focus:border-heritage" />
                <button onClick={() => void send()} disabled={sending || !draft.trim()}
                  aria-label="Send"
                  className="h-9 w-9 flex items-center justify-center bg-ink text-ivory hover:bg-ink-soft disabled:opacity-40 shrink-0">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Docked bar (LinkedIn-style) — flush to the bottom edge. */
        <button onClick={() => setOpen(true)} aria-label="Open messages"
          className="w-[260px] max-w-[calc(100vw-2rem)] bg-ink text-ivory rounded-t-lg shadow-xl flex items-center gap-2.5 px-4 py-3 hover:bg-ink-soft transition-colors">
          <MessageCircle className="h-4 w-4 text-[var(--heritage-bright,#8db8a3)] shrink-0" />
          <span className="text-[13px] font-bold tracking-[0.3px] flex-1 text-left">
            Messages
          </span>
          {totalUnread > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-heritage text-ivory text-[11px] font-bold flex items-center justify-center">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
          <ChevronUp className="h-4 w-4 text-ivory/70 shrink-0" />
        </button>
      )}
    </div>
  );
}

function ThreadGroup({
  label, items, online, onOpen,
}: {
  label: string;
  items: ChatThread[];
  online: Set<string>;
  onOpen: (t: ChatThread) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
        {label}
      </div>
      {items.map((t) => (
        <button key={`${t.kind}-${t.id}`} onClick={() => onOpen(t)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-cream/60 text-left">
          <Avatar initials={t.initials}
            online={t.kind === "dm" && !!t.other_auth_id && online.has(t.other_auth_id)} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className={"text-[13px] truncate " + (t.unread > 0 ? "font-bold text-ink" : "font-semibold text-ink")}>
                {t.title}
              </span>
              <span className="text-[10px] text-slate-meta shrink-0">{relTime(t.last_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={"text-[11px] truncate " + (t.unread > 0 ? "text-ink" : "text-slate-meta")}>
                {t.last_message ?? t.subtitle}
              </span>
              {t.unread > 0 && (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-heritage text-ivory text-[10px] font-bold flex items-center justify-center">
                  {t.unread}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function Avatar({ initials, online }: { initials: string; online: boolean }) {
  return (
    <div className="relative shrink-0">
      <div className="h-9 w-9 rounded-full bg-ink text-ivory flex items-center justify-center text-[12px] font-bold">
        {initials}
      </div>
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--heritage-bright,#8db8a3)] border-2 border-white" />
      )}
    </div>
  );
}
