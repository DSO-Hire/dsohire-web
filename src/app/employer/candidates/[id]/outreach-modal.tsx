"use client";

/**
 * Outreach composition modal (E7.10 / Phase 5D Day 2).
 *
 * Launched from the candidate detail page. Subject + body fields,
 * server-action submit, success-state replaces the form with a
 * "Message sent" confirmation. Closes on backdrop click or Escape.
 *
 * Candidate's email is never shown to the sender — the platform
 * handles the relay. Reply-to is the sender's own email so candidate
 * responses go directly to them.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, X, Loader2, CheckCircle2 } from "lucide-react";
import { sendOutreachToCandidate } from "./outreach-actions";

interface OutreachModalProps {
  candidateId: string;
  candidateName: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OutreachModal({
  candidateId,
  candidateName,
  isOpen,
  onClose,
}: OutreachModalProps) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const subjectRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSent(false);
      // Auto-focus the subject when the modal opens.
      setTimeout(() => subjectRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, pending, onClose]);

  if (!isOpen) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("candidate_id", candidateId);
    fd.set("subject", subject.trim());
    fd.set("body", body.trim());
    startTransition(async () => {
      const res = await sendOutreachToCandidate(fd);
      if (!res.ok) {
        setError(res.error ?? "Send failed.");
        return;
      }
      setSent(true);
      // Re-fetch the page so the history card picks up the new row.
      router.refresh();
      // Reset form for a potential follow-up send after the success
      // state dismisses.
      setSubject("");
      setBody("");
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="outreach-modal-title"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="bg-white border border-[var(--rule)] w-full max-w-2xl shadow-2xl mt-16">
        <header className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
          <h2
            id="outreach-modal-title"
            className="text-[14px] font-bold tracking-[-0.2px] text-ink"
          >
            Message {candidateName ?? "candidate"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md p-1 text-slate-400 hover:text-ink hover:bg-cream disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {sent ? (
          <div className="p-6 text-center">
            <CheckCircle2
              className="h-8 w-8 text-heritage-deep mx-auto mb-3"
              aria-hidden
            />
            <h3 className="text-[15px] font-bold text-ink mb-2">
              Message sent.
            </h3>
            <p className="text-[13px] text-slate-body leading-relaxed max-w-[360px] mx-auto mb-5">
              {candidateName ?? "The candidate"} will see your message in
              their inbox. Replies come back to your email.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label
                htmlFor="outreach-subject"
                className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5"
              >
                Subject
              </label>
              <input
                ref={subjectRef}
                id="outreach-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Associate Dentist role at our Prairie Village practice"
                maxLength={200}
                className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
              />
            </div>
            <div>
              <label
                htmlFor="outreach-body"
                className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5"
              >
                Message
              </label>
              <textarea
                id="outreach-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={9}
                placeholder="Introduce yourself, the role, and why you think they'd be a great fit. The candidate doesn't see your email address — replies route through DSO Hire back to you."
                maxLength={8000}
                className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage leading-relaxed resize-y"
              />
              <div className="mt-1 text-[10px] text-slate-meta text-right">
                {body.length} / 8000
              </div>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-[11px] text-slate-meta leading-relaxed flex-1">
                Sent from <strong>no-reply@dsohire.com</strong>. Candidate
                replies route to your email directly.
              </p>
              <button
                type="submit"
                disabled={pending || !subject.trim() || !body.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft disabled:opacity-60 shrink-0"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send message
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

interface OutreachLauncherProps {
  candidateId: string;
  candidateName: string | null;
}

export function OutreachLauncher({
  candidateId,
  candidateName,
}: OutreachLauncherProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft"
      >
        <Send className="h-3.5 w-3.5" aria-hidden />
        Message
      </button>
      <OutreachModal
        candidateId={candidateId}
        candidateName={candidateName}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
