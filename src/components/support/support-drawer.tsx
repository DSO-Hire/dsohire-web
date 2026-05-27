"use client";

/**
 * SupportDrawer — Tier 2 chat mode (Day 21 Phase C swap).
 *
 * Replaces the Tier 1 single-message form with a streaming Claude
 * conversation. Same drawer chrome (slide-out, header, suggested
 * articles, ESC dismiss) — only the body content changed.
 *
 * Flow:
 *   1. Drawer opens → load any prior conversation from localStorage
 *      (24h TTL); empty state shows suggested articles + an intro msg.
 *   2. User types → submit → POST /api/support/chat → SSE stream →
 *      tokens render into the assistant bubble in real-time.
 *   3. Conversation persists in localStorage on every message + on
 *      drawer close, so reopening within 24h restores the thread.
 *   4. "Escalate to a human" button below the input (visible once the
 *      user has sent ≥1 message) → confirms → POSTs the transcript to
 *      /api/support/escalate which emails Cam with the full context.
 *   5. Quota / kill switch / un-auth: surfaced as system messages
 *      inside the conversation, never as the modal-error pattern.
 *
 * Tier 1 form is dropped entirely. When a user is over quota or the
 * kill switch is frozen, they see a system message with an "Email
 * support directly" link — that's the fallback path now.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Lightbulb,
  Loader2,
  MessageSquareWarning,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { HELP_CONTENT, type HelpEntry } from "@/lib/help/help-content";
import {
  clearConversation,
  loadConversation,
  saveConversation,
  type StoredMessage,
} from "./conversation-storage";

const MAX_INPUT = 4000;
const MAX_SUGGESTIONS = 3;

interface Props {
  open: boolean;
  onClose: () => void;
  audience: "employer" | "candidate" | "both";
  /** Auth user id used to key the localStorage cache. Null = signed-out. */
  authUserId: string | null;
}

interface UiMessage {
  role: "user" | "assistant" | "system";
  content: string;
  /** Streaming state for the in-flight assistant message. */
  streaming?: boolean;
  /** Tool-use labels rendered as pills above the bubble while Claude is
   *  fetching real-data context. Set when tool_use SSE events arrive. */
  toolLabels?: string[];
}

export function SupportDrawer({ open, onClose, audience, authUserId }: Props) {
  const pathname = usePathname() ?? "";
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /* ── Load conversation from localStorage on first open ── */
  useEffect(() => {
    if (!open || !authUserId) return;
    const stored = loadConversation(authUserId);
    if (stored && stored.messages.length > 0) {
      setMessages(
        stored.messages.map((m) => ({ role: m.role, content: m.content }))
      );
      setRequestId(stored.requestId);
    }
  }, [open, authUserId]);

  /* ── Save conversation whenever messages or requestId change ── */
  useEffect(() => {
    if (!authUserId || !requestId || messages.length === 0) return;
    const storable: StoredMessage[] = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        ts: Date.now(),
      }));
    saveConversation(authUserId, {
      requestId,
      messages: storable,
      updatedAt: Date.now(),
    });
  }, [messages, requestId, authUserId]);

  /* ── Focus textarea on open + ESC to close ── */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => textareaRef.current?.focus(), 150);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  /* ── Auto-scroll to bottom on new content ── */
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  /* ── Suggestions only when the conversation is empty ── */
  const suggestions = useMemo(
    () => (messages.length === 0 ? suggestArticles(pathname, audience) : []),
    [messages.length, pathname, audience]
  );

  const onReset = useCallback(() => {
    setMessages([]);
    setRequestId(null);
    setEscalated(false);
    setResetConfirmOpen(false);
    if (authUserId) clearConversation(authUserId);
  }, [authUserId]);

  const onSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (sending || !authUserId) return;
      const trimmed = input.trim();
      if (!trimmed) return;

      // Optimistically push user message + empty assistant placeholder.
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed },
        { role: "assistant", content: "", streaming: true },
      ]);
      setInput("");
      setSending(true);

      try {
        const res = await fetch("/api/support/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            request_id: requestId,
            page_url:
              typeof window !== "undefined" ? window.location.href : null,
            page_title:
              typeof document !== "undefined" ? document.title : null,
          }),
        });

        // Quota / kill-switch / error responses come back as JSON, not SSE.
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          const data = (await res.json()) as {
            ok: boolean;
            message?: string;
            error?: string;
            quota_exceeded?: boolean;
            frozen?: boolean;
          };
          // Replace the placeholder assistant message with a system message.
          setMessages((prev) => {
            const next = [...prev];
            next.pop(); // drop streaming placeholder
            next.push({
              role: "system",
              content:
                data.message ??
                data.error ??
                "Something went wrong. Try again in a moment, or email support@dsohire.com directly.",
            });
            return next;
          });
          setSending(false);
          return;
        }

        // Stream parser — Server-Sent Events over fetch.
        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("Stream not available");
        }
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";

        const consumeEvents = () => {
          // SSE events are separated by blank lines. Process complete events.
          let idx;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const lines = rawEvent.split("\n");
            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              }
            }
            const dataStr = dataLines.join("\n");
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr) as Record<string, unknown>;
              if (eventName === "start" && typeof parsed.requestId === "string") {
                setRequestId(parsed.requestId);
              } else if (eventName === "tool_use" && typeof parsed.friendly_label === "string") {
                const label = parsed.friendly_label as string;
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === "assistant") {
                    next[next.length - 1] = {
                      ...last,
                      toolLabels: [...(last.toolLabels ?? []), label],
                    };
                  }
                  return next;
                });
              } else if (eventName === "token" && typeof parsed.chunk === "string") {
                assistantText += parsed.chunk;
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === "assistant") {
                    next[next.length - 1] = {
                      ...last,
                      content: assistantText,
                    };
                  }
                  return next;
                });
              } else if (eventName === "error") {
                setMessages((prev) => {
                  const next = [...prev];
                  const last = next[next.length - 1];
                  if (last && last.role === "assistant" && !last.content) {
                    next.pop();
                  }
                  next.push({
                    role: "system",
                    content:
                      typeof parsed.message === "string"
                        ? parsed.message
                        : "Response interrupted. Try again.",
                  });
                  return next;
                });
              }
            } catch (parseErr) {
              console.warn("[support-drawer] SSE parse failed", parseErr, dataStr);
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          consumeEvents();
        }
        // Flush any tail content.
        if (buffer.length > 0) {
          buffer += "\n\n";
          consumeEvents();
        }

        // Mark streaming complete on the last assistant message.
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = { ...last, streaming: false };
          }
          return next;
        });
      } catch (err) {
        console.error("[support-drawer] chat error", err);
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant" && !last.content) {
            next.pop();
          }
          next.push({
            role: "system",
            content:
              "Network error — try again, or email support@dsohire.com if it keeps happening.",
          });
          return next;
        });
      } finally {
        setSending(false);
      }
    },
    [input, requestId, sending, authUserId]
  );

  const onEscalate = useCallback(async () => {
    if (!requestId || escalating) return;
    if (
      !window.confirm(
        "Send this conversation to a human at DSO Hire? We'll reply within one business day."
      )
    ) {
      return;
    }
    setEscalating(true);
    try {
      const res = await fetch("/api/support/escalate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request_id: requestId }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) {
        alert(data.error ?? "Couldn't escalate — try again or email support directly.");
        return;
      }
      setEscalated(true);
      // Drop the cached conversation so the next opening is fresh.
      if (authUserId) clearConversation(authUserId);
    } catch (err) {
      console.error("[support-drawer] escalate failed", err);
      alert("Network error — try again or email support@dsohire.com directly.");
    } finally {
      setEscalating(false);
    }
  }, [requestId, escalating, authUserId]);

  const hasUserMessage = messages.some((m) => m.role === "user");

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={
          "fixed inset-0 z-40 bg-black/40 transition-opacity " +
          (open ? "opacity-100" : "opacity-0 pointer-events-none")
        }
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Support"
        className={
          "fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] bg-white shadow-2xl flex flex-col transition-transform duration-200 ease-out " +
          (open ? "translate-x-0" : "translate-x-full")
        }
      >
        <header className="flex items-start justify-between gap-3 p-5 border-b border-[var(--rule)] shrink-0">
          <div className="min-w-0">
            <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1.5 inline-flex items-center gap-2">
              <Sparkles className="size-3" />
              Support — AI-assisted
            </div>
            <h2 className="font-display text-lg font-extrabold tracking-[-0.4px] text-ink leading-tight">
              Ask anything about DSO Hire.
            </h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && !escalated && (
              <button
                type="button"
                onClick={() => setResetConfirmOpen(true)}
                aria-label="Start a new conversation"
                title="Start a new conversation"
                className="p-1.5 rounded text-slate-meta hover:text-ink hover:bg-cream/60"
              >
                <Trash2 className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close support"
              className="p-1.5 rounded text-slate-meta hover:text-ink hover:bg-cream/60"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Scroll surface — fills remaining height, message list lives here */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
          {!authUserId ? (
            <SignedOutPrompt />
          ) : escalated ? (
            <EscalatedSuccess onClose={onClose} />
          ) : messages.length === 0 ? (
            <EmptyState suggestions={suggestions} onClose={onClose} />
          ) : (
            <>
              {messages.map((m, i) => (
                <Bubble key={i} message={m} />
              ))}
            </>
          )}
        </div>

        {/* Reset confirmation */}
        {resetConfirmOpen && (
          <div className="border-t border-[var(--rule)] bg-amber-50 px-5 py-3 text-[13px] text-amber-900 shrink-0">
            <p className="mb-2">
              Drop this conversation and start fresh? The current thread will
              be cleared from this browser.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded bg-amber-700 text-white px-3 py-1.5 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-amber-800"
              >
                Yes, start over
              </button>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                className="inline-flex items-center gap-1.5 rounded border border-amber-300 px-3 py-1.5 text-[11px] font-bold tracking-[1.5px] uppercase text-amber-900 hover:bg-amber-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Input footer */}
        {authUserId && !escalated && (
          <form
            onSubmit={onSubmit}
            className="border-t border-[var(--rule)] p-4 space-y-2 shrink-0 bg-white"
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim() && !sending) onSubmit();
                }
              }}
              rows={2}
              placeholder="Ask anything — bulk locations, MFA, sending a custom email…"
              disabled={sending}
              className="w-full resize-y min-h-[60px] max-h-[180px] px-3 py-2 bg-cream/30 border border-[var(--rule-strong)] text-ink text-[14px] placeholder:text-slate-meta focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {hasUserMessage && (
                  <button
                    type="button"
                    onClick={onEscalate}
                    disabled={escalating || sending}
                    title="Hand off this conversation to a human at DSO Hire"
                    className="inline-flex items-center gap-1.5 rounded border border-[var(--rule-strong)] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-body hover:bg-cream/60 hover:text-ink disabled:opacity-40"
                  >
                    {escalating ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <MessageSquareWarning className="size-3.5" />
                    )}
                    Escalate to human
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={sending || !input.trim()}
                className="inline-flex items-center gap-1.5 bg-ink text-ivory px-4 py-2 text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Thinking…
                  </>
                ) : (
                  <>
                    <Send className="size-3.5" />
                    Send
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] text-slate-meta">
              Enter to send · Shift+Enter for new line · {input.length}/{MAX_INPUT}
            </p>
          </form>
        )}
      </aside>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────── */

function Bubble({ message }: { message: UiMessage }) {
  if (message.role === "system") {
    return (
      <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950 inline-flex items-start gap-2 max-w-full">
        <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
        <div className="flex-1 leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-ink text-ivory px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap rounded">
          {message.content}
        </div>
      </div>
    );
  }
  // assistant
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-1.5">
        {message.toolLabels && message.toolLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolLabels.map((label, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-heritage-deep bg-heritage/[0.08] border border-heritage/20 px-2 py-0.5 rounded"
              >
                <Sparkles className="size-2.5" />
                {label}
              </span>
            ))}
          </div>
        )}
        <div className="bg-cream/40 border border-[var(--rule)] px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap rounded">
          {message.content || (
            <span className="inline-flex items-center gap-2 text-slate-meta italic">
              <Loader2 className="size-3 animate-spin" />
              Thinking…
            </span>
          )}
          {message.streaming && message.content && (
            <span className="inline-block w-2 h-4 align-text-bottom bg-heritage-deep/60 ml-0.5 animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  suggestions,
  onClose,
}: {
  suggestions: Array<{ key: string; entry: HelpEntry }>;
  onClose: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="border border-heritage/30 bg-heritage/[0.05] px-4 py-3 text-[13px] text-heritage-deep leading-relaxed inline-flex items-start gap-2">
        <ShieldCheck className="size-4 mt-0.5 shrink-0" />
        <div>
          Type a question below. I&apos;ll answer from the help docs and
          your account context. If I can&apos;t help, hit &ldquo;Escalate to
          human&rdquo; and a real person at DSO Hire will reply within one
          business day.
        </div>
      </div>

      {suggestions.length > 0 && (
        <section>
          <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-body mb-2 inline-flex items-center gap-1.5">
            <Lightbulb className="size-3 text-heritage-deep" />
            Common questions for this page
          </div>
          <ul className="space-y-1">
            {suggestions.map(({ key, entry }) => (
              <li key={key}>
                <Link
                  href={`/help/${key.replace(/\./g, "-")}`}
                  className="group flex items-start gap-2 px-3 py-2 -mx-3 rounded hover:bg-cream/60 transition-colors"
                  onClick={onClose}
                >
                  <ChevronRight className="size-3.5 text-slate-meta mt-1 shrink-0 group-hover:text-heritage-deep group-hover:translate-x-0.5 transition-all" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-ink text-[13px] leading-tight">
                      {entry.title}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-slate-meta leading-snug line-clamp-2">
                      {entry.tip}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SignedOutPrompt() {
  return (
    <div className="text-center py-10">
      <div className="inline-flex items-center justify-center size-12 rounded-full bg-cream/60 mb-4">
        <ShieldCheck className="size-6 text-slate-meta" />
      </div>
      <h3 className="font-display text-lg font-bold text-ink mb-2">
        Sign in to use AI support.
      </h3>
      <p className="text-[13px] text-slate-body leading-relaxed max-w-[320px] mx-auto mb-6">
        Or email{" "}
        <a
          href="mailto:support@dsohire.com"
          className="font-semibold text-heritage-deep underline-offset-2 hover:underline"
        >
          support@dsohire.com
        </a>{" "}
        directly — a real human replies within one business day.
      </p>
    </div>
  );
}

function EscalatedSuccess({ onClose }: { onClose: () => void }) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center size-12 rounded-full bg-heritage/[0.12] mb-4">
        <CheckCircle2 className="size-6 text-heritage-deep" />
      </div>
      <h3 className="font-display text-lg font-bold text-ink mb-2">
        Handed off to a human.
      </h3>
      <p className="text-[13px] text-slate-body leading-relaxed max-w-[320px] mx-auto mb-6">
        Someone from the DSO Hire team will reply directly to your email
        within one business day. Your conversation is saved and attached
        so we have the full context.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center justify-center px-5 py-2.5 border border-[var(--rule-strong)] text-ink text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-cream/60"
      >
        Close
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Suggested articles (carried over from Tier 1 drawer)
 * ────────────────────────────────────────────────────────── */

interface Suggestion {
  key: string;
  entry: HelpEntry;
}

const URL_TO_PREFIXES: Array<{ match: RegExp; prefixes: string[] }> = [
  { match: /\/employer\/jobs\/new|\/employer\/jobs\/[^/]+\/edit/, prefixes: ["jd."] },
  { match: /\/employer\/jobs\/[^/]+\/applications/, prefixes: ["pipeline."] },
  { match: /\/employer\/applications\//, prefixes: ["pipeline.", "inbox."] },
  { match: /\/employer\/inbox/, prefixes: ["inbox."] },
  { match: /\/employer\/talent-pool/, prefixes: ["talent.", "candidate.profile_view"] },
  { match: /\/employer\/billing/, prefixes: ["billing."] },
  { match: /\/employer\/locations\/bulk/, prefixes: ["locations.bulk_import", "locations."] },
  { match: /\/employer\/locations/, prefixes: ["locations.", "settings.affiliation"] },
  { match: /\/employer\/settings\/templates/, prefixes: ["settings.templates", "settings.custom_templates"] },
  { match: /\/employer\/settings\/account/, prefixes: ["settings.mfa"] },
  { match: /\/employer\/settings/, prefixes: ["settings."] },
  { match: /\/candidate\/profile/, prefixes: ["cand.onboarding", "cand.import", "cand.privacy"] },
  { match: /\/candidate\/applications/, prefixes: ["cand.applications", "cand.practice_fit"] },
  { match: /\/candidate\/settings/, prefixes: ["cand.privacy", "cand.credentials"] },
  { match: /\/candidate/, prefixes: ["cand."] },
];

function suggestArticles(
  pathname: string,
  audience: "employer" | "candidate" | "both"
): Suggestion[] {
  const matchedPrefixes: string[] = [];
  for (const rule of URL_TO_PREFIXES) {
    if (rule.match.test(pathname)) {
      for (const p of rule.prefixes) {
        if (!matchedPrefixes.includes(p)) matchedPrefixes.push(p);
      }
    }
  }
  if (matchedPrefixes.length === 0) {
    matchedPrefixes.push(audience === "candidate" ? "cand.onboarding" : "jd.overview");
  }
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const prefix of matchedPrefixes) {
    for (const [key, entry] of Object.entries(HELP_CONTENT)) {
      if (out.length >= MAX_SUGGESTIONS) break;
      if (seen.has(key)) continue;
      const isExact = key === prefix;
      const isPrefix = prefix.endsWith(".") && key.startsWith(prefix);
      if (!isExact && !isPrefix) continue;
      if (audience === "employer" && entry.lens === "candidate") continue;
      if (audience === "candidate" && entry.lens === "employer") continue;
      seen.add(key);
      out.push({ key, entry });
    }
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}
