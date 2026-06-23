"use client";

/**
 * DSO prospect composer. Sends through sendProspectMessage — which masks the
 * candidate, routes the nudge with no reply-to (platform no-reply), and never
 * exposes the candidate's email.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendProspectMessage } from "../../prospect-actions";
import { InsertMergeFieldButton } from "@/components/outreach/insert-merge-field-button";

export function ProspectComposer({ candidateId }: { candidateId: string }) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    if (!body.trim() || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await sendProspectMessage({ candidateId, body });
      if (!res.ok) {
        setError(res.error ?? "Couldn't send.");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--rule)] bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-meta">
          Personalization fills in on send (left blank for anonymous
          candidates).
        </span>
        <InsertMergeFieldButton
          fieldRef={textareaRef}
          onInsert={setBody}
          label="Insert field"
        />
      </div>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a message…"
        rows={4}
        disabled={pending}
        className="w-full resize-none rounded border border-[var(--rule)] bg-cream/30 px-3 py-2 text-[14px] text-ink focus:outline-none focus:border-heritage-deep"
      />
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-meta">
          Sent in-app + an email nudge. Replies come back here — never to your
          inbox.
        </span>
        <button
          type="button"
          onClick={send}
          disabled={pending || !body.trim()}
          className="bg-primary px-4 py-2 text-[12px] font-bold uppercase tracking-[1px] text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
