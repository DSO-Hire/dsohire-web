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
import {
  proposeInterview,
  cancelInterviewBooking,
} from "@/lib/interviews/actions";
import {
  US_TIMEZONES,
  getBrowserTimezone,
  parseWallClock,
  zonedTimeToUtc,
} from "@/lib/timezones";

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

/**
 * Cancel-interview button — confirms intent, prompts for an optional
 * reason, and fires cancelInterviewBooking. The action already deletes
 * any pushed calendar events and flips the proposal back to pending.
 */
export interface CancelInterviewButtonProps {
  bookingId: string;
}

export function CancelInterviewButton({ bookingId }: CancelInterviewButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (
            !window.confirm(
              "Cancel this booked interview? The candidate will be notified."
            )
          ) {
            return;
          }
          const reason =
            window.prompt("Optional reason (visible in the audit log)") ||
            null;
          setError(null);
          setBusy(true);
          const res = await cancelInterviewBooking(bookingId, reason);
          setBusy(false);
          if (!res.ok) {
            setError(res.error ?? "Couldn't cancel the interview.");
            return;
          }
          router.refresh();
        }}
        disabled={busy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-red-200 bg-white text-[11px] font-bold tracking-[1.5px] uppercase text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <X className="h-3 w-3" aria-hidden />
        )}
        Cancel interview
      </button>
      {error && (
        <p className="mt-1 text-[11px] text-red-700">{error}</p>
      )}
    </>
  );
}

/**
 * Reschedule launcher — opens the propose modal with the previous
 * proposal's context pre-filled (kind, duration, location, message)
 * AND a `replacingBookingId` that the modal uses to cancel the live
 * booking before sending the new proposal. The button itself only
 * shows on an already-booked interview (BookedView).
 */
export interface RescheduleInterviewLauncherProps {
  applicationId: string;
  candidateName: string | null;
  replacingBookingId: string;
  initialValues: ProposeInitialValues;
}

export function RescheduleInterviewLauncher({
  applicationId,
  candidateName,
  replacingBookingId,
  initialValues,
}: RescheduleInterviewLauncherProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-green-300 bg-white text-[11px] font-bold tracking-[1.5px] uppercase text-green-900 hover:bg-green-50"
      >
        <Calendar className="h-3 w-3" aria-hidden />
        Reschedule
      </button>
      <ProposeInterviewModal
        applicationId={applicationId}
        candidateName={candidateName}
        isOpen={open}
        onClose={() => setOpen(false)}
        replacingBookingId={replacingBookingId}
        initialValues={initialValues}
      />
    </>
  );
}

export interface ProposeInitialValues {
  kind: "phone" | "video" | "in_person" | "other";
  duration: number;
  locationText: string;
  message: string;
}

interface ProposeInterviewModalProps {
  applicationId: string;
  candidateName: string | null;
  isOpen: boolean;
  onClose: () => void;
  /**
   * When set, the modal title + submit button switch into reschedule
   * mode; on submit, the active booking is cancelled first via
   * cancelInterviewBooking before the new proposal is sent.
   */
  replacingBookingId?: string;
  /** Pre-fill values — used by the reschedule launcher. */
  initialValues?: ProposeInitialValues;
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
  replacingBookingId,
  initialValues,
}: ProposeInterviewModalProps) {
  const router = useRouter();
  const isReschedule = Boolean(replacingBookingId);
  const [kind, setKind] = useState<"phone" | "video" | "in_person" | "other">(
    initialValues?.kind ?? "video"
  );
  const [duration, setDuration] = useState(initialValues?.duration ?? 30);
  const [locationText, setLocationText] = useState(
    initialValues?.locationText ?? ""
  );
  const [message, setMessage] = useState(initialValues?.message ?? "");
  const [slots, setSlots] = useState<SlotDraft[]>([emptySlot()]);
  // Timezone the proposer is typing in. Default = browser-detected.
  // Times below are interpreted in this TZ at submit; if the proposer
  // is in California scheduling a Texas practice's interview, they can
  // switch to Central before entering the times.
  const [timezone, setTimezone] = useState<string>(() => getBrowserTimezone());
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
      const wallClock = parseWallClock(s.date, s.time);
      if (!wallClock) {
        setError("One of the proposed times isn't a valid date/time.");
        return;
      }
      // Interpret the wall-clock in the selected timezone, not the
      // proposer's browser TZ. A recruiter in California typing
      // "1:15 PM" with timezone set to Central Time will send
      // 18:15 UTC (CDT) — what the Texas practice expects.
      const utc = zonedTimeToUtc(wallClock, timezone);
      if (!Number.isFinite(utc.getTime())) {
        setError("One of the proposed times isn't valid.");
        return;
      }
      isoStarts.push(utc.toISOString());
    }
    if (isoStarts.length === 0) {
      setError("Add at least one time option.");
      return;
    }

    startTransition(async () => {
      // Reschedule path: cancel the live booking first. The lib's
      // cancelInterviewBooking nukes any pushed calendar events and
      // flips the prior proposal back to pending (then cleaned up
      // implicitly because we send a new proposal right after, which
      // becomes the new active row). If the cancel fails we still
      // bail — the candidate would otherwise see two active proposals.
      if (replacingBookingId) {
        const cancelRes = await cancelInterviewBooking(
          replacingBookingId,
          "Rescheduled by employer"
        );
        if (!cancelRes.ok) {
          setError(
            cancelRes.error ??
              "Couldn't cancel the existing booking — try again."
          );
          return;
        }
      }
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
      // 2026-05-18 — `overflow-y-auto` + smaller mobile top padding
      // added after Erica's testing pass: on mobile the modal content
      // overflowed the viewport with no way to reach the Send button
      // (had to click screen edges). The outer wrapper now scrolls the
      // entire dialog including the card, and mt-4 on mobile shrinks
      // the top breathing room so more content sits above the fold.
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-black/40 overflow-y-auto overscroll-contain"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="bg-white border border-[var(--rule)] w-full max-w-2xl shadow-2xl mt-4 mb-4 sm:mt-12 sm:mb-12">
        <header className="px-6 py-4 border-b border-[var(--rule)] flex items-center justify-between">
          <h2 className="text-[14px] font-bold tracking-[-0.2px] text-ink">
            {isReschedule
              ? `Reschedule interview${candidateName ? ` · ${candidateName}` : ""}`
              : `Propose interview times${candidateName ? ` · ${candidateName}` : ""}`}
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
                {kind === "phone"
                  ? "Phone number"
                  : kind === "in_person"
                    ? "Address"
                    : "Location"}
                <span className="ml-2 text-slate-meta normal-case tracking-normal font-normal">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
                placeholder={
                  kind === "phone"
                    ? "e.g. +1 555 555 1234"
                    : kind === "in_person"
                      ? "e.g. 123 Main St, City, State"
                      : kind === "video"
                        ? "Optional — we auto-add a Google Meet / Microsoft Teams link"
                        : "Where to meet"
                }
                maxLength={300}
                className="w-full px-3 py-2 bg-cream border border-[var(--rule-strong)] text-ink text-[14px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
              />
              {kind === "video" && (
                <p className="mt-1.5 text-[11px] text-slate-meta leading-relaxed">
                  Leave blank for a fresh video link on each interview. Both calendars will get a join URL automatically.
                </p>
              )}
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
              <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-cream border border-[var(--rule)]">
                <span className="text-[11px] text-slate-body shrink-0">
                  Times below are in
                </span>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1 bg-white border border-[var(--rule-strong)] text-ink text-[12px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
                  aria-label="Timezone for proposed times"
                >
                  {/* If the browser TZ isn't in our US list, surface it as
                      a labeled first option so the proposer doesn't have
                      to scroll past their own zone. */}
                  {!US_TIMEZONES.find((t) => t.id === timezone) && (
                    <option value={timezone}>
                      {timezone} (your browser default)
                    </option>
                  )}
                  {US_TIMEZONES.map((tz) => (
                    <option key={tz.id} value={tz.id} title={tz.description}>
                      {tz.label}
                    </option>
                  ))}
                </select>
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
                {isReschedule ? "Send new times" : "Send proposal"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
