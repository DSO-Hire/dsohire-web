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
  MessageCircle, X, ChevronLeft, ChevronUp, Search, Plus, Send, Loader2, Users, Check,
} from "lucide-react";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  setChatOpen,
  useInputFocused,
  useSupportDrawerOpen,
} from "@/lib/ui/floating-ui";
import { sendApplicationMessage } from "@/lib/messages/actions";
import {
  listChatThreads, listTeammates, findOrCreateDmConversation,
  getDmThreadMessages, getCandidateThreadMessages, sendDmMessage, markDmRead,
  createGroupConversation,
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
  const supportDrawerOpen = useSupportDrawerOpen();
  const inputFocused = useInputFocused();

  // Publish open state to the floating-UI coordinator (hides the "?" while
  // the chat panel is open).
  useEffect(() => {
    setChatOpen(open);
    return () => setChatOpen(false);
  }, [open]);
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
  // New-chat composer: "direct" taps a teammate to 1:1; "group" multi-selects.
  const [newMode, setNewMode] = useState<"direct" | "group">("direct");
  const [groupSel, setGroupSel] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

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
    setNewMode("direct");
    setGroupSel([]);
    setGroupName("");
    if (teammates.length === 0) setTeammates(await listTeammates());
  };

  const toggleGroupMember = (id: string) => {
    setGroupSel((sel) =>
      sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]
    );
  };

  const startGroup = async () => {
    if (groupSel.length < 2 || creatingGroup) return;
    setCreatingGroup(true);
    const res = await createGroupConversation(groupSel, groupName);
    setCreatingGroup(false);
    if (!res.ok) return;
    await loadThreads();
    const memberNames = teammates
      .filter((t) => groupSel.includes(t.dso_user_id))
      .map((t) => t.name.split(" ")[0]);
    const title =
      groupName.trim() ||
      (memberNames.length > 3
        ? `${memberNames.slice(0, 3).join(", ")} +${memberNames.length - 3}`
        : memberNames.join(", "));
    openThread({
      kind: "dm", id: res.conversationId, title,
      subtitle: `${groupSel.length + 1} members`, last_message: null,
      last_at: null, unread: 0, initials: "", avatar_url: null,
      other_auth_id: null, is_group: true,
    });
  };

  const startDm = async (mate: ChatTeammate) => {
    const res = await findOrCreateDmConversation(mate.dso_user_id);
    if (!res.ok) return;
    const t: ChatThread = {
      kind: "dm", id: res.conversationId, title: mate.name,
      subtitle: mate.role, last_message: null, last_at: null, unread: 0,
      initials: mate.initials, avatar_url: mate.avatar_url,
      other_auth_id: mate.auth_user_id,
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
    <div
      className={
        "fixed bottom-0 right-6 z-[55] print:hidden" +
        // Yield the corner while the support drawer is open — kept mounted
        // (display:none) so realtime subscriptions + unread badge survive.
        (supportDrawerOpen ? " hidden" : "") +
        // On mobile, get out of the way when a text field is focused so the
        // bar never covers a composer/form field (desktop keeps it).
        (inputFocused ? " max-lg:hidden" : "")
      }
    >
      {open ? (
        <div className="w-[360px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-5rem)] bg-card border border-[var(--rule-strong)] border-b-0 shadow-2xl rounded-t-lg overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-hero text-hero-foreground px-4 py-3 flex items-center gap-2 shrink-0">
            {view !== "list" ? (
              <button onClick={() => setView("list")} aria-label="Back"
                className="text-hero-foreground/80 hover:text-hero-foreground"><ChevronLeft className="h-5 w-5" /></button>
            ) : (
              <MessageCircle className="h-4 w-4 text-[var(--heritage-bright,#8db8a3)]" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-bold tracking-[0.3px] truncate">
                {view === "thread" && active ? active.title
                  : view === "new" ? "New message" : "Messages"}
              </div>
              {view === "thread" && active && (
                <div className="text-[10px] text-hero-foreground/60 flex items-center gap-1.5">
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
              <button onClick={openNew} aria-label="New message" className="text-hero-foreground/80 hover:text-hero-foreground">
                <Plus className="h-5 w-5" />
              </button>
            )}
            <button onClick={() => setOpen(false)} aria-label="Close" className="text-hero-foreground/80 hover:text-hero-foreground">
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
            <div className="flex-1 overflow-y-auto flex flex-col">
              {/* Direct vs Group toggle */}
              <div className="flex gap-1 p-2 border-b border-[var(--rule)]">
                {(["direct", "group"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setNewMode(m)}
                    className={
                      "flex-1 py-1.5 text-[11px] font-bold tracking-[1px] uppercase rounded transition-colors " +
                      (newMode === m
                        ? "bg-primary text-primary-foreground"
                        : "bg-cream text-slate-body hover:text-ink")
                    }
                  >
                    {m === "direct" ? "Direct" : "Group"}
                  </button>
                ))}
              </div>

              {newMode === "group" && (
                <div className="p-3 border-b border-[var(--rule)] space-y-2">
                  <input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="Group name (optional)"
                    maxLength={80}
                    className="w-full h-8 px-3 bg-cream border border-[var(--rule)] text-[13px] text-ink focus:outline-none focus:border-heritage"
                  />
                  <button
                    onClick={startGroup}
                    disabled={groupSel.length < 2 || creatingGroup}
                    className="w-full py-2 bg-heritage text-primary-foreground text-[12px] font-bold tracking-[1px] uppercase rounded disabled:opacity-50 hover:bg-heritage-deep transition-colors"
                  >
                    {creatingGroup
                      ? "Creating…"
                      : `Create group${groupSel.length ? ` (${groupSel.length})` : ""}`}
                  </button>
                  {groupSel.length === 1 && (
                    <p className="text-[11px] text-slate-meta">Pick at least two teammates.</p>
                  )}
                </div>
              )}

              <div className="px-4 py-2 text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                {newMode === "group" ? "Add teammates" : "Your team"}
              </div>
              {teammates.length === 0 ? (
                <div className="p-6 text-center text-[13px] text-slate-meta">No teammates yet.</div>
              ) : teammates.map((mate) => {
                const picked = groupSel.includes(mate.dso_user_id);
                return (
                  <button
                    key={mate.dso_user_id}
                    onClick={() =>
                      newMode === "group"
                        ? toggleGroupMember(mate.dso_user_id)
                        : startDm(mate)
                    }
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-cream/60 text-left"
                  >
                    <Avatar initials={mate.initials} imageUrl={mate.avatar_url} online={!!mate.auth_user_id && online.has(mate.auth_user_id)} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink truncate">{mate.name}</div>
                      <div className="text-[11px] text-slate-meta truncate">{mate.title || mate.role}</div>
                    </div>
                    {newMode === "group" && (
                      <span
                        className={
                          "shrink-0 h-5 w-5 rounded-full border flex items-center justify-center " +
                          (picked
                            ? "bg-heritage border-heritage text-primary-foreground"
                            : "border-[var(--rule-strong)]")
                        }
                      >
                        {picked && <Check className="h-3 w-3" />}
                      </span>
                    )}
                  </button>
                );
              })}
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
                ) : messages.map((m) => {
                  // Multi-party threads (group DMs + candidate threads) show a
                  // small avatar + sender name on incoming messages so it's
                  // easy to follow who's talking. 1:1 DMs stay clean.
                  const multiParty =
                    !!active.is_group || active.kind === "candidate";
                  const showSender = multiParty && !m.mine;
                  return (
                    <div key={m.id} className={"flex items-end gap-2 " + (m.mine ? "justify-end" : "justify-start")}>
                      {showSender && (
                        <MsgAvatar
                          name={m.sender_name}
                          imageUrl={m.sender_avatar_url ?? null}
                        />
                      )}
                      <div className="max-w-[78%]">
                        {showSender && (
                          <div className="text-[10px] font-semibold text-slate-meta mb-0.5 ml-0.5">
                            {m.sender_name.split(" ")[0]}
                          </div>
                        )}
                        <div className={"px-3 py-2 text-[13px] leading-snug " +
                          (m.mine ? "bg-heritage text-primary-foreground" : "bg-card border border-[var(--rule)] text-ink")}>
                          {m.body}
                          <div className={"mt-0.5 text-[9px] " + (m.mine ? "text-primary-foreground/60" : "text-slate-meta")}>
                            {relTime(m.created_at)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-[var(--rule)] p-2 flex items-end gap-2 shrink-0">
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  rows={1} placeholder="Write a message…"
                  className="flex-1 resize-none max-h-24 px-3 py-2 bg-cream border border-[var(--rule)] text-[13px] text-ink focus:outline-none focus:border-heritage" />
                <button onClick={() => void send()} disabled={sending || !draft.trim()}
                  aria-label="Send"
                  className="h-9 w-9 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 shrink-0">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Docked bar (LinkedIn-style) — flush to the bottom edge. */
        <button onClick={() => setOpen(true)} aria-label="Open messages"
          className="w-[260px] max-w-[calc(100vw-2rem)] bg-primary text-primary-foreground rounded-t-lg shadow-xl flex items-center gap-2.5 px-4 py-3 hover:bg-primary/90 transition-colors">
          <MessageCircle className="h-4 w-4 text-[var(--heritage-bright,#8db8a3)] shrink-0" />
          <span className="text-[13px] font-bold tracking-[0.3px] flex-1 text-left">
            Messages
          </span>
          {totalUnread > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-heritage text-primary-foreground text-[11px] font-bold flex items-center justify-center">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
          <ChevronUp className="h-4 w-4 text-primary-foreground/70 shrink-0" />
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
          <Avatar initials={t.initials} imageUrl={t.avatar_url} isGroup={t.is_group}
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
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-heritage text-primary-foreground text-[10px] font-bold flex items-center justify-center">
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

function Avatar({
  initials,
  online,
  imageUrl,
  isGroup = false,
}: {
  initials: string;
  online: boolean;
  imageUrl?: string | null;
  isGroup?: boolean;
}) {
  return (
    <div className="relative shrink-0">
      {isGroup ? (
        <div className="h-9 w-9 rounded-full bg-heritage-deep text-primary-foreground flex items-center justify-center">
          <Users className="h-4 w-4" />
        </div>
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-9 w-9 rounded-full object-cover"
        />
      ) : (
        <div className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[12px] font-bold">
          {initials}
        </div>
      )}
      {online && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-[var(--heritage-bright,#8db8a3)] border-2 border-card" />
      )}
    </div>
  );
}

/** Small avatar shown beside an incoming message in multi-party threads. */
function MsgAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={imageUrl} alt="" className="h-6 w-6 rounded-full object-cover shrink-0" />
    );
  }
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[9px] font-bold shrink-0">
      {initials || "?"}
    </div>
  );
}
