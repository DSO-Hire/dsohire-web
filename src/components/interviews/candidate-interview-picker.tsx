"use client";

/**
 * Candidate-side "pick a slot" UX (Phase 5A Day 1).
 *
 * Renders on /candidate/applications/[id] above the regular content
 * when there's a pending proposal. Clicking a time books it through
 * the bookInterviewSlot action; on success the same component re-
 * renders in "confirmed" mode after a server refresh.
 *
 * Booked-state UI lives in a separate read-only component so the
 * server page can show it without the client interactivity.
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
} from "lucide-react";
import { bookInterviewSlot } from "@/lib/interviews/actions";
import {
  US_TIMEZONES,
  getBrowserTimezone,
  formatInTimezone,
} from "@/lib/timezones";

const KIND_LABELS: Record<string, string> = {
  phone: "Phone call",
  video: "Video call",
  in_person: "In-person",
  other: "Interview",
};

export interface CandidateInterviewProposal {
  proposal_id: string;
  status: "pending" | "booked" | "cancelled" | "expired";
  interview_kind: "phone" | "video" | "in_person" | "other";
  duration_minutes: number;
  location_text: string | null;
  message_to_candidate: string | null;
  dso_name: string;
  options: Array<{
    id: string;
    start_at: string;
  }>;
  booked_option_id: string | null;
  booked_at: string | null;
}

interface CandidateInterviewPickerProps {
  proposal: CandidateInterviewProposal;
}

/**
 * Legacy formatter — keeps the booked-view rendering identical to what
 * the candidate saw when picking (uses browser-local TZ). The picker
 * itself routes through `formatInTimezone` so the candidate can switch
 * display TZs before confirming.
 */
function formatSlot(iso: string): { line1: string; line2: string } {
  const d = new Date(iso);
  return {
    line1: d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }),
    line2: d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    }),
  };
}

/**
 * Capitalize the first letter of a string. Defensive against DSO display
 * names stored in lowercase ("dso hire") so customer-facing copy still
 * reads cleanly. Mid-sentence DSO names stay verbatim; this only fires
 * at sentence start where the lowercase is most jarring.
 */
function capitalizeFirst(s: string | null | undefined): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function CandidateInterviewPicker({
  proposal,
}: CandidateInterviewPickerProps) {
  const router = useRouter();
  // When the employer only proposed one time, default-select it so the
  // Confirm button is immediately actionable. With multiple options the
  // candidate has to actively pick — the choice is the meaningful step.
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    proposal.options.length === 1 ? proposal.options[0].id : null
  );
  const [notes, setNotes] = useState("");
  // Display timezone for the slot list. Initialized to a deterministic
  // default ("America/Chicago" — geographic middle of US-only customer
  // base) so server and client render the same HTML and avoid a React
  // hydration warning. useEffect updates to the candidate's actual
  // browser TZ after mount.
  const [displayTz, setDisplayTz] = useState<string>("America/Chicago");
  useEffect(() => {
    setDisplayTz(getBrowserTimezone());
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (proposal.status === "booked" && proposal.booked_option_id) {
    return <BookedView proposal={proposal} />;
  }
  if (proposal.status !== "pending") return null;

  function handleBook() {
    if (!selectedOptionId) {
      setError("Pick a time before confirming.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await bookInterviewSlot({
        proposalId: proposal.proposal_id,
        optionId: selectedOptionId,
        candidateNotes: notes.trim() || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't book the slot.");
        return;
      }
      router.refresh();
    });
  }

  const kindLabel = KIND_LABELS[proposal.interview_kind] ?? "Interview";

  return (
    <section className="mb-8 border-l-4 border-heritage bg-cream p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-3">
        <Calendar
          className="h-5 w-5 text-heritage-deep mt-0.5 shrink-0"
          aria-hidden
        />
        <div>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Interview proposed · {kindLabel}
          </div>
          <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink leading-tight mb-1">
            Schedule your {kindLabel.toLowerCase()}.
          </h2>
          <p className="text-[13px] text-slate-body leading-relaxed mb-1">
            {capitalizeFirst(proposal.dso_name)} has proposed
            {proposal.options.length === 1 ? " a time" : " a few times"} below.
            Pick the one that works.
          </p>
          <div className="flex items-center gap-3 text-[12px] text-slate-body">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {proposal.duration_minutes} minutes
            </span>
            {proposal.location_text && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {proposal.location_text}
              </span>
            )}
          </div>
        </div>
      </div>

      {proposal.message_to_candidate && (
        <div className="mb-4 px-3 py-2 bg-card border-l-2 border-[var(--rule)] text-[13px] text-ink italic leading-relaxed">
          “{proposal.message_to_candidate}”
        </div>
      )}

      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-[10px] font-bold tracking-[2px] uppercase text-slate-meta">
          Pick a time
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-meta">Show in</span>
          <select
            value={displayTz}
            onChange={(e) => setDisplayTz(e.target.value)}
            className="px-2 py-1 bg-card border border-[var(--rule-strong)] text-ink text-[12px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage"
            aria-label="Display timezone"
          >
            {/* If the candidate's browser TZ isn't a standard US zone,
                surface it as the first option so they don't have to
                hunt for "their" zone in the list. */}
            {!US_TIMEZONES.find((t) => t.id === displayTz) && (
              <option value={displayTz}>{displayTz} (your time)</option>
            )}
            {US_TIMEZONES.map((tz) => (
              <option key={tz.id} value={tz.id} title={tz.description}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ul className="space-y-2 mb-4">
        {proposal.options.map((opt) => {
          const { line1, line2 } = formatInTimezone(opt.start_at, displayTz);
          const selected = selectedOptionId === opt.id;
          return (
            <li key={opt.id}>
              <button
                type="button"
                onClick={() => setSelectedOptionId(opt.id)}
                className={
                  "w-full text-left px-4 py-3 border-2 transition-all " +
                  (selected
                    ? "border-heritage bg-cream ring-2 ring-heritage/30 shadow-sm"
                    : "border-[var(--rule)] bg-card hover:bg-cream/60 hover:border-heritage/40 cursor-pointer")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-bold text-ink">
                      {line1}
                    </div>
                    <div className="text-[12px] text-slate-body">{line2}</div>
                  </div>
                  {selected && (
                    <CheckCircle2
                      className="h-4 w-4 text-heritage-deep"
                      aria-hidden
                    />
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <details className="mb-4">
        <summary className="cursor-pointer text-[11px] font-bold tracking-[1.5px] uppercase text-heritage-deep hover:text-ink">
          Add a note (optional)
        </summary>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Anything you'd like the team to know ahead of the call?"
          className="mt-2 w-full px-3 py-2 bg-card border border-[var(--rule-strong)] text-ink text-[13px] focus:outline-none focus:border-heritage focus:ring-1 focus:ring-heritage leading-relaxed resize-y"
        />
      </details>

      {error && (
        <div className="mb-3 rounded-md border border-danger bg-danger-bg px-3 py-2 text-[13px] text-danger flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleBook}
          disabled={pending || !selectedOptionId}
          title={
            !selectedOptionId
              ? "Pick a time above to enable this button"
              : undefined
          }
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground text-[12px] font-bold tracking-[2px] uppercase hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-primary"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Confirm interview
        </button>
        {!selectedOptionId && (
          <span className="text-[12px] text-slate-meta italic">
            Pick a time above to enable
          </span>
        )}
      </div>
    </section>
  );
}

function BookedView({
  proposal,
}: {
  proposal: CandidateInterviewProposal;
}) {
  const opt = proposal.options.find((o) => o.id === proposal.booked_option_id);
  if (!opt) return null;
  const { line1, line2 } = formatSlot(opt.start_at);
  const kindLabel = KIND_LABELS[proposal.interview_kind] ?? "Interview";
  return (
    <section className="mb-8 border-l-4 border-heritage bg-cream p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CheckCircle2
          className="h-5 w-5 text-heritage-deep mt-0.5 shrink-0"
          aria-hidden
        />
        <div className="flex-1">
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-1">
            Interview confirmed
          </div>
          <h2 className="text-xl font-extrabold tracking-[-0.4px] text-ink leading-tight mb-1">
            {line1}
          </h2>
          <p className="text-[14px] text-ink">
            {line2} · {proposal.duration_minutes} minutes · {kindLabel}
          </p>
          {proposal.location_text && (
            <p className="mt-1 text-[13px] text-slate-body inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {proposal.location_text}
            </p>
          )}
          <p className="mt-3 text-[12px] text-slate-meta leading-relaxed">
            Reply to your confirmation email if you need to reschedule.
          </p>
        </div>
      </div>
    </section>
  );
}

void X;
