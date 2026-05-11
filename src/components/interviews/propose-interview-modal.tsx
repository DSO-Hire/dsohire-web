"use client";

/**
 * Propose-interview modal (Phase 5A Day 1).
 *
 * Employer-side launcher + modal for creating an interview proposal.
 * Fields: kind, duration, location/Zoom note, message, 1-6 candidate
 * time slots. On submit, server action fires the email to the
 * candidate and closes the modal.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Plus,
  Trash2,
  Send,
  X,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { proposeInterview } from "@/lib/interviews/actions";

interface ProposeInterviewLauncherProps {
  applicationId: string;
  candidateName: string | null;
  hasActiveProposal: boolean;
}

export function ProposeInterviewLauncher({
  applicationId,
  candidateName,
  hasActiveProposal,
}: ProposeInterviewLauncherProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 bg-ink text-ivory text-[11px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft"
      >
        <Calendar className="h-3 w-3" aria-hidden />
        {hasActiveProposal ? "Propose new times" : "Propose times"}
      </button>
      <ProposeInterviewModal
        applicationId={applicationId}
        candidateName={candidateName}
        isOpen={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

interface ProposeInterviewModalProps {
  applicationId: string;
  candidateName: string | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SlotDraft {
  id: string;
  date: string;
  time: string;
}

function emptySlot(): SlotDraft {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    date: "",
    time: "",
  };
}

function ProposeInterviewModal({
  applicationId,
  candidateName,
  isOpen,
  onClose,
}: ProposeInterviewModalProps) {
  const router = useRouter();
  const [kind, setKind] = useState<"phone" | "video" | "in_person" | "other">("video");
  const [duration, setDuration] = useState(30);
  const [locationText, setLocationText] = useState("");
  const [message, setMessage] = useState("");
  const [slots, setSlots] = useState<SlotDraft[]>([emptySlot()]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSent(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleSlotChange(id: string, key: "date" | "time", value: string) {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [key]: value } : s))
    );
  }
  function addSlot() {
    if (slots.length >= 6) return;
    setSlots((prev) => [...prev, emptySlot()]);
  }
  function removeSlot(id: string) {
    setSlots((prev) =>
      prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const isoStarts: string[] = [];
    for (const s of slots) {
      if (!s.date || !s.time) {
        setError("Fill in a date AND time for every proposed slot.");
        return;
      }
      const iso = new Date(`${s.date}T${s.time}`).toISOString();
      if (!Number.isFinite(new Date(iso).getTime())) {
        setError("One of the proposed times isn't valid.");
        return;
      }
      isoStarts.push(iso);
    }
    if (isoStarts.length === 0) {
      setError("Add at least one time option.");
      return;
    }

    startTransition(async () => {
      const res = await proposeInterview({
        applicationId,
        interviewKind: kind,
        durationMinutes: duration,
        locationText: locationText.trim() || null,
        messageToCandidate: message.trim() || null,
        proposedStarts: isoStarts,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't send the proposal.");
        return;
      }
      setSent(true);
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-black/40"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="bg-white border border-[var(--rule)] w-full max-w-2xl shadow-2xl mt-12">
        <header className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
          <h2 className="text-[14px] font-bold tracking-[-0.2px] text-ink">
            Propose interview times{candidateName ? ` · ${candidateName}` : ""}
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
              Proposal sent
            </h3>
            <p className="text-[13px] text-slate-body leading-relaxed max-w-[400px] mx-auto mb-5">
              {candidateName ?? "The candidate"} will get an email with the
              time options. You&apos;ll see this section update when they
              pick a slot.
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
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
                  Interview type
                </label>
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(
                      e.target.value as
                        | "phone"
                        | "video"
                        | "in_person"
                        | "other"
                    )
                  }
                  className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
                >
                  <option value="video">Video call</option>
                  <option value="phone">Phone call</option>
                  <option value="in_person">In-person</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
                  Duration (min)
                </label>
                <input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={duration}
                  onChange={(e) =>
                    setDuration(Number(e.target.value) || 30)
                  }
                  className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
                Location, Zoom link, or phone number
                <span className="ml-2 text-slate-meta normal-case tracking-normal font-normal">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder="e.g. https://zoom.us/j/123456789  ·  Or: 123 Main St, City, State"
                maxLength={300}
                className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta mb-1.5">
                Message to candidate
                <span className="ml-2 text-slate-meta normal-case tracking-normal font-normal">
                  (optional)
                </span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="A short note about what to expect or who they'll be meeting with."
                maxLength={1000}
                className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage leading-relaxed resize-y"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-bold tracking-[1.5px] uppercase text-slate-meta">
                  Proposed times ({slots.length} of 6)
                </label>
                <button
                  type="button"
                  onClick={addSlot}
                  disabled={slots.length >= 6}
                  className="inline-flex items-center gap-1 text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" /> Add slot
                </button>
              </div>
              <ul className="space-y-2">
                {slots.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tabular-nums text-slate-meta w-6">
                      #{i + 1}
                    </span>
                    <input
                      type="date"
                      value={s.date}
                      onChange={(e) =>
                        handleSlotChange(s.id, "date", e.target.value)
                      }
                      className="px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
                    />
                    <input
                      type="time"
                      value={s.time}
                      step={300}
                      onChange={(e) =>
                        handleSlotChange(s.id, "time", e.target.value)
                      }
                      className="px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
                    />
                    <button
                      type="button"
                      onClick={() => removeSlot(s.id)}
                      disabled={slots.length <= 1}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700 disabled:opacity-30"
                      aria-label="Remove slot"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="px-4 py-2 text-[12px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex items-center gap-2 px-5 py-2 bg-ink text-ivory text-[12px] font-bold tracking-[1.5px] uppercase hover:bg-ink-soft disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send proposal
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
