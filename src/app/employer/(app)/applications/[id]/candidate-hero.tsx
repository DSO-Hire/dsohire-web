/**
 * Candidate hero — BOH Remodel Lane 3 commit 1 (pure extraction from
 * page.tsx, markup unchanged): avatar + name + meta + status pill,
 * contact strip, and job context bar. Server-component-safe; all data
 * arrives pre-computed (displayName is already anonymity-masked by the
 * page via candidateDisplayName — this component never resolves names).
 */

import Link from "next/link";
import {
  Briefcase,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  colorTripleFor,
  isTerminalKind,
  type StageKind,
} from "@/lib/applications/stages";

/**
 * Render the kanban-matched stage badge for the header. For non-terminal
 * kinds we resolve the kind's default color triple via colorTripleFor();
 * for terminal kinds (rejected/withdrawn) we use a muted slate treatment.
 */
export function statusBadgeClasses(kind: StageKind): string {
  if (isTerminalKind(kind)) {
    return "bg-muted ring-border text-muted-foreground";
  }
  const c = colorTripleFor(null, kind);
  return `${c.bg} ${c.ring} ${c.text}`;
}

export function CandidateHero({
  displayName,
  avatarName,
  avatarUrl,
  titleLine,
  candidateLocation,
  headerMetaParts,
  currentKind,
  currentStageLabel,
  candidateEmail,
  candidatePhone,
  candidateLinkedinUrl,
  jobId,
  jobTitle,
  roleLabel,
  employmentTypeLabel,
  submitted,
}: {
  displayName: string;
  avatarName: string;
  avatarUrl: string | null;
  titleLine: string | null;
  candidateLocation: string | null;
  headerMetaParts: string[];
  currentKind: StageKind;
  currentStageLabel: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  candidateLinkedinUrl: string | null;
  jobId: string;
  jobTitle: string;
  roleLabel: string;
  employmentTypeLabel: string;
  submitted: Date;
}) {
  return (
    <header className="mb-8 border border-[var(--rule)] bg-card p-6 sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-6">
        {/* Mobile: avatar stacks above the name so the name + meta get full
            width (no thin squeezed column). Desktop: avatar left, name right. */}
        <div className="flex flex-col items-start gap-3 min-w-0 sm:flex-row sm:gap-5 sm:flex-1">
          <Avatar name={avatarName} imageUrl={avatarUrl} size="2xl" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
              Application
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-[-1.2px] leading-[1.05] text-ink mb-2">
              {displayName}
            </h1>
            {titleLine && (
              <div className="text-[15px] text-slate-body">{titleLine}</div>
            )}
            {(headerMetaParts.length > 0 || candidateLocation) && (
              <div className="text-[13px] text-slate-meta mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {candidateLocation && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {candidateLocation}
                  </span>
                )}
                {headerMetaParts.map((part, i) => (
                  <span key={i}>
                    {i === 0 && candidateLocation ? `· ${part}` : part}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <span
          className={`self-start whitespace-nowrap text-[10px] font-bold tracking-[2px] uppercase px-3 py-2 ring-1 ring-inset ${statusBadgeClasses(currentKind)}`}
        >
          {currentStageLabel}
        </span>
      </div>

      {/* Contact strip — replaces the old sidebar Contact card */}
      <div className="mt-6 pt-5 border-t border-[var(--rule)] flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        {candidateEmail ? (
          <a
            href={`mailto:${candidateEmail}?subject=${encodeURIComponent(
              `Re: your application to ${jobTitle}`
            )}`}
            className="inline-flex items-center gap-1.5 text-heritage hover:text-heritage-deep font-semibold break-all"
          >
            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
            {candidateEmail}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-slate-meta italic">
            <Mail className="h-3.5 w-3.5" />
            Email unavailable
          </span>
        )}
        {candidatePhone && (
          <span className="inline-flex items-center gap-1.5 text-ink">
            <Phone className="h-3.5 w-3.5 text-slate-meta" />
            {candidatePhone}
          </span>
        )}
        {candidateLinkedinUrl && (
          <a
            href={candidateLinkedinUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-heritage hover:text-heritage-deep font-semibold"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            LinkedIn
          </a>
        )}
        <span className="ml-auto text-slate-meta text-[12px]">
          Replies to your email also route to this application.
        </span>
      </div>

      {/* Job context bar */}
      <div className="mt-5 pt-5 border-t border-[var(--rule)] flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-body">
        <Briefcase className="h-3.5 w-3.5 text-heritage-deep" />
        <span>Applied to</span>
        <Link
          href={`/employer/jobs/${jobId}`}
          className="font-bold text-ink hover:text-heritage-deep transition-colors"
        >
          {jobTitle}
        </Link>
        <span className="text-slate-meta">·</span>
        <span>
          {roleLabel} · {employmentTypeLabel}
        </span>
        <span className="text-slate-meta">·</span>
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3 text-slate-meta" />
          Submitted {submitted.toLocaleDateString()} at{" "}
          {submitted.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
    </header>
  );
}
