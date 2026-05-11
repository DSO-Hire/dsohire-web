/**
 * Interview section — shared employer-side display of current
 * proposal + booking state (Phase 5A Day 1).
 *
 * Server-side data load happens in the page. This component just
 * renders the state and exposes the "Propose interview times" launcher
 * via a child client component.
 */

import { Calendar, Clock, MapPin, AlertCircle, CheckCircle2 } from "lucide-react";
import { ProposeInterviewLauncher } from "./propose-interview-modal";

const KIND_LABELS: Record<string, string> = {
  phone: "Phone call",
  video: "Video call",
  in_person: "In-person",
  other: "Other",
};

export interface InterviewProposalState {
  proposal_id: string;
  status: "pending" | "booked" | "cancelled" | "expired";
  interview_kind: "phone" | "video" | "in_person" | "other";
  duration_minutes: number;
  location_text: string | null;
  message_to_candidate: string | null;
  created_at: string;
  options: Array<{
    id: string;
    start_at: string;
    sort_order: number;
  }>;
  booking: {
    id: string;
    selected_option_id: string;
    candidate_confirmed_at: string;
    candidate_notes: string | null;
  } | null;
}

interface EmployerInterviewSectionProps {
  applicationId: string;
  candidateName: string | null;
  proposals: InterviewProposalState[];
}

function formatSlot(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function EmployerInterviewSection({
  applicationId,
  candidateName,
  proposals,
}: EmployerInterviewSectionProps) {
  const active = proposals.find(
    (p) => p.status === "pending" || p.status === "booked"
  );

  return (
    <section className="border border-[var(--rule)] bg-white p-6">
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-heritage-deep" aria-hidden />
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
            Interview
          </div>
        </div>
        <ProposeInterviewLauncher
          applicationId={applicationId}
          candidateName={candidateName}
          hasActiveProposal={Boolean(active)}
        />
      </header>

      {!active ? (
        <p className="text-[13px] text-slate-meta leading-relaxed">
          No interview proposed yet. Click <strong>Propose times</strong> to
          send a list of available slots; the candidate picks one and you
          both get a confirmation email.
        </p>
      ) : active.status === "booked" && active.booking ? (
        <BookedView proposal={active} />
      ) : (
        <PendingView proposal={active} />
      )}

      {proposals.filter((p) => p.proposal_id !== active?.proposal_id).slice(0, 3)
        .length > 0 && (
        <details className="mt-4 pt-3 border-t border-[var(--rule)]">
          <summary className="cursor-pointer text-[11px] font-bold tracking-[1.5px] uppercase text-slate-meta hover:text-ink">
            History ({proposals.length - (active ? 1 : 0)})
          </summary>
          <ul className="mt-3 space-y-2">
            {proposals
              .filter((p) => p.proposal_id !== active?.proposal_id)
              .map((p) => (
                <li
                  key={p.proposal_id}
                  className="text-[12px] text-slate-body flex items-center gap-2"
                >
                  <span
                    className={
                      "uppercase text-[10px] font-bold tracking-[1.5px] px-1.5 py-0.5 " +
                      (p.status === "booked"
                        ? "bg-green-100 text-green-800"
                        : p.status === "cancelled"
                          ? "bg-red-50 text-red-700"
                          : "bg-cream text-slate-meta")
                    }
                  >
                    {p.status}
                  </span>
                  <span>
                    {new Date(p.created_at).toLocaleDateString()} ·{" "}
                    {p.options.length}{" "}
                    {p.options.length === 1 ? "slot" : "slots"}
                  </span>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PendingView({ proposal }: { proposal: InterviewProposalState }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 mb-3">
      <div className="flex items-start gap-2 mb-2">
        <AlertCircle
          className="h-4 w-4 text-amber-700 mt-0.5 shrink-0"
          aria-hidden
        />
        <div className="text-[13px] text-amber-900 leading-relaxed">
          Waiting on the candidate to pick a time. Sent{" "}
          {new Date(proposal.created_at).toLocaleDateString()}.
        </div>
      </div>
      <ul className="space-y-1 pl-6">
        {proposal.options.map((opt) => (
          <li
            key={opt.id}
            className="text-[12px] text-amber-900 tabular-nums"
          >
            {formatSlot(opt.start_at)}
          </li>
        ))}
      </ul>
      <div className="mt-3 pt-2 border-t border-amber-200 flex items-center gap-3 text-[11px] text-amber-900">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {proposal.duration_minutes} min
        </span>
        <span>·</span>
        <span>{KIND_LABELS[proposal.interview_kind] ?? "Interview"}</span>
        {proposal.location_text && (
          <>
            <span>·</span>
            <span className="truncate">{proposal.location_text}</span>
          </>
        )}
      </div>
    </div>
  );
}

function BookedView({ proposal }: { proposal: InterviewProposalState }) {
  if (!proposal.booking) return null;
  const opt = proposal.options.find(
    (o) => o.id === proposal.booking?.selected_option_id
  );
  if (!opt) return null;
  return (
    <div className="rounded-md border border-green-200 bg-green-50 p-4">
      <div className="flex items-start gap-2 mb-3">
        <CheckCircle2
          className="h-4 w-4 text-green-800 mt-0.5 shrink-0"
          aria-hidden
        />
        <div>
          <div className="text-[14px] font-bold text-green-900 mb-0.5">
            Interview confirmed
          </div>
          <div className="text-[15px] font-extrabold text-ink mt-1">
            {formatSlot(opt.start_at)}
          </div>
        </div>
      </div>
      <div className="text-[12px] text-green-900 space-y-1 pl-6">
        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          {proposal.duration_minutes} minutes ·{" "}
          {KIND_LABELS[proposal.interview_kind] ?? "Interview"}
        </div>
        {proposal.location_text && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            {proposal.location_text}
          </div>
        )}
        {proposal.booking.candidate_notes && (
          <div className="mt-2 pt-2 border-t border-green-200">
            <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-green-800 mb-1">
              Candidate&apos;s note
            </div>
            <p className="text-[12px] italic">
              {proposal.booking.candidate_notes}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
