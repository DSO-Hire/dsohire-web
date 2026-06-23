"use client";

/**
 * Candidate prospect-thread panel — message list + reply (with the reveal
 * affordance) + mute/block. The candidate controls everything here.
 */

import { useState, useTransition } from "react";
import {
  sendProspectReply,
  muteProspectThread,
  blockProspectFromThread,
} from "../actions";

interface Message {
  id: string;
  sender_role: string;
  body: string;
  created_at: string;
}

export function ProspectThreadPanel({
  threadId,
  status: initialStatus,
  revealed: initialRevealed,
  messages,
}: {
  threadId: string;
  status: string;
  revealed: boolean;
  messages: Message[];
}) {
  const [status, setStatus] = useState(initialStatus);
  const [revealed, setRevealed] = useState(initialRevealed);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const blocked = status === "blocked";

  function reply(reveal: boolean) {
    if (!body.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendProspectReply(threadId, body, reveal);
      if (!res.ok) {
        setError(res.error ?? "Couldn't send.");
        return;
      }
      setBody("");
      if (reveal) setRevealed(true);
    });
  }

  function mute() {
    startTransition(async () => {
      const res = await muteProspectThread(threadId);
      if (res.ok) setStatus("muted");
    });
  }

  function block() {
    startTransition(async () => {
      const res = await blockProspectFromThread(threadId);
      if (res.ok) setStatus("blocked");
    });
  }

  return (
    <div>
      <div className="space-y-3 mb-6">
        {messages.length === 0 && (
          <p className="text-[13px] text-slate-meta">No messages yet.</p>
        )}
        {messages.map((m) => {
          const mine = m.sender_role === "candidate";
          const system = m.sender_role === "system";
          return (
            <div
              key={m.id}
              className={mine ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={
                  "max-w-[85%] rounded-lg px-3.5 py-2.5 text-[14px] whitespace-pre-wrap " +
                  (system
                    ? "bg-cream text-slate-body text-[12px] italic"
                    : mine
                      ? "bg-heritage text-primary-foreground"
                      : "bg-card border border-[var(--rule)] text-ink")
                }
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      {blocked ? (
        <div className="rounded-lg border border-[var(--rule)] bg-cream/40 px-4 py-3 text-[13px] text-slate-body">
          You&apos;ve blocked this employer. They can no longer find or message
          you.
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--rule)] bg-card p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a reply…"
            rows={3}
            disabled={pending}
            className="w-full resize-none rounded border border-[var(--rule)] bg-cream/30 px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-heritage-deep"
          />
          {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => reply(false)}
              disabled={pending || !body.trim()}
              className="bg-primary px-3 py-2 text-[12px] font-bold uppercase tracking-[1px] text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Reply anonymously
            </button>
            {!revealed && (
              <button
                type="button"
                onClick={() => reply(true)}
                disabled={pending || !body.trim()}
                className="border border-heritage-deep px-3 py-2 text-[12px] font-bold uppercase tracking-[1px] text-heritage-deep hover:bg-cream/60 disabled:opacity-40"
              >
                Reply &amp; share my profile
              </button>
            )}
            <span className="flex-1" />
            {status !== "muted" && (
              <button
                type="button"
                onClick={mute}
                disabled={pending}
                className="text-[12px] text-slate-meta hover:text-ink underline underline-offset-2"
              >
                Mute
              </button>
            )}
            <button
              type="button"
              onClick={block}
              disabled={pending}
              className="text-[12px] text-danger hover:underline underline-offset-2"
            >
              Block
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-meta">
            Replying anonymously keeps your name hidden. The employer never sees
            your email address.
          </p>
        </div>
      )}
    </div>
  );
}
