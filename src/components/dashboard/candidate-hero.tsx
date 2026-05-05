/**
 * CandidateHero — adaptive hero tile for the candidate dashboard.
 *
 * Three modes, picked at the page level based on what's most actionable
 * for the candidate at that moment:
 *
 *   1. "new-replies"   — candidate has unread employer messages.
 *      Highest urgency. Hero shows count + reply preview list.
 *
 *   2. "active-apps"   — candidate has active applications, no unread
 *      replies. Hero shows count + stage distribution strip.
 *
 *   3. "setup"         — candidate has no applications yet (fresh signup).
 *      Hero shows 3-step "Get Hired" checklist.
 *
 * Same visual language as the employer-side HeroKpiTile (navy fill,
 * heritage gradient left rule, radial gradient depth, heritage-bright
 * accents) — different *content* shape. Brand-coherent across both
 * sides of the marketplace.
 */

import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";

interface ReplyPreview {
  id: string;
  /** Sender's display name (employer side). */
  senderName: string;
  /** DSO name. */
  dsoName: string;
  /** One-line message preview, ideally truncated to ~70 chars. */
  preview: string;
  /** Relative timestamp ("2h ago", "yesterday"). */
  timestamp: string;
  /** Job title the message is about. */
  jobTitle: string;
}

interface StageBucket {
  key: string;
  label: string;
  count: number;
}

interface SetupStep {
  label: string;
  /** When true, renders with a heritage check + "Done" tag. */
  done: boolean;
  /** When true, renders with the heritage-bright "Up next" tag. */
  upNext?: boolean;
}

interface CandidateHeroBaseProps {
  /** Click destination for the whole tile. */
  href: string;
  /** CTA label rendered in the bottom rail. */
  ctaLabel: string;
}

interface NewRepliesProps extends CandidateHeroBaseProps {
  mode: "new-replies";
  unreadCount: number;
  replies: ReplyPreview[];
}

interface ActiveAppsProps extends CandidateHeroBaseProps {
  mode: "active-apps";
  activeCount: number;
  hint: string;
  stages: StageBucket[];
}

interface SetupProps extends CandidateHeroBaseProps {
  mode: "setup";
  totalSteps: number;
  doneSteps: number;
  hint: string;
  steps: SetupStep[];
}

type CandidateHeroProps = NewRepliesProps | ActiveAppsProps | SetupProps;

export function CandidateHero(props: CandidateHeroProps) {
  return (
    <Link
      href={props.href}
      className="group relative overflow-hidden flex flex-col text-ivory bg-ink p-7 sm:p-8 hover:bg-ink-soft transition-colors min-h-[440px]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 100% 0%, rgba(77,122,96,0.22), transparent 60%), radial-gradient(circle at 0% 100%, rgba(77,122,96,0.10), transparent 50%)",
      }}
    >
      {/* Heritage gradient left rule */}
      <span
        className="absolute top-0 left-0 bottom-0 w-1"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, var(--color-heritage, #4D7A60), #8db8a3)",
        }}
        aria-hidden
      />

      {/* Chevron (top-right) */}
      <ChevronRight className="absolute top-5 right-5 h-4 w-4 text-ivory/50 group-hover:text-[#8db8a3] group-hover:translate-x-1 transition-all" />

      {props.mode === "new-replies" && <NewRepliesBody {...props} />}
      {props.mode === "active-apps" && <ActiveAppsBody {...props} />}
      {props.mode === "setup" && <SetupBody {...props} />}

      {/* Shared CTA rail */}
      <div className="mt-auto pt-5 inline-flex items-center gap-1.5 text-[11px] font-extrabold tracking-[2px] uppercase text-[#8db8a3] border-t border-ivory/10">
        <span className="pt-5">{props.ctaLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 mt-5 group-hover:translate-x-1 transition-transform" />
      </div>
    </Link>
  );
}

/* ───── Mode bodies ───── */

function NewRepliesBody({ unreadCount, replies }: NewRepliesProps) {
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-[#8db8a3] mb-1">
        New Replies
      </div>
      <div
        className="inline-flex items-center gap-1.5 px-2 py-1 mb-5 self-start text-[9px] font-bold tracking-[1.5px] uppercase text-[#8db8a3]"
        style={{ background: "rgba(141,184,163,0.18)" }}
      >
        <span
          className="block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "#8db8a3" }}
        />
        Live
      </div>

      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div className="text-[88px] sm:text-[96px] font-black tracking-[-4.5px] leading-[0.92] text-ivory">
          {unreadCount}
        </div>
        <span
          className="px-2 py-1 text-[12px] font-bold tracking-[0.4px] text-[#8db8a3]"
          style={{ background: "rgba(141,184,163,0.16)" }}
        >
          unread
        </span>
      </div>

      <div className="text-[13px] leading-[1.55] max-w-[400px] text-ivory/70 mb-5">
        Employers replied to your applications. Open the inbox to read and
        respond before they move on to other candidates.
      </div>

      <ul className="list-none mt-2">
        {replies.slice(0, 3).map((reply, i) => (
          <li
            key={reply.id}
            className={`py-3 flex items-center gap-3.5 ${
              i === 0 ? "border-t border-ivory/10" : "border-t border-ivory/10"
            } ${i === replies.slice(0, 3).length - 1 ? "border-b border-ivory/10" : ""}`}
          >
            <div
              className="h-8 w-8 flex items-center justify-center flex-shrink-0 text-[11px] font-extrabold tracking-[-0.3px] text-[#8db8a3]"
              style={{ background: "rgba(141,184,163,0.18)" }}
              aria-hidden
            >
              {initials(reply.senderName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ivory leading-tight truncate">
                <strong className="font-bold">{reply.senderName}</strong>
                <span className="text-ivory/55"> · {reply.dsoName}</span>
              </div>
              <div className="text-[11px] text-ivory/55 mt-0.5 truncate">
                &ldquo;{reply.preview}&rdquo; · {reply.timestamp} · {reply.jobTitle}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function ActiveAppsBody({ activeCount, hint, stages }: ActiveAppsProps) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-[#8db8a3] mb-1">
        Active Applications
      </div>
      <div
        className="inline-flex items-center gap-1.5 px-2 py-1 mb-5 self-start text-[9px] font-bold tracking-[1.5px] uppercase text-[#8db8a3]"
        style={{ background: "rgba(141,184,163,0.18)" }}
      >
        <span
          className="block w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "#8db8a3" }}
        />
        In flight
      </div>

      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div className="text-[88px] sm:text-[96px] font-black tracking-[-4.5px] leading-[0.92] text-ivory">
          {activeCount}
        </div>
      </div>

      <div className="text-[13px] leading-[1.55] max-w-[400px] text-ivory/70">
        {hint}
      </div>

      {/* Stage strip */}
      <div className="flex items-stretch gap-2 mt-7 flex-wrap">
        {stages.map((stage) => {
          const pct = max > 0 ? (stage.count / max) * 100 : 0;
          return (
            <div key={stage.key} className="flex-1 min-w-[60px]">
              <div
                className="h-1.5 mb-1.5 relative"
                style={{ background: "rgba(247,244,237,0.14)" }}
              >
                <span
                  className="absolute top-0 left-0 bottom-0"
                  style={{ width: `${pct}%`, background: "#8db8a3" }}
                />
              </div>
              <div className="text-[9px] font-bold tracking-[1.5px] uppercase text-ivory/55">
                {stage.label}
              </div>
              <div className="text-[14px] font-extrabold text-ivory mt-0.5">
                {stage.count}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SetupBody({ totalSteps, doneSteps, hint, steps }: SetupProps) {
  return (
    <>
      <div className="text-[10px] font-extrabold tracking-[2.5px] uppercase text-[#8db8a3] mb-1">
        Get Hired
      </div>
      <div
        className="inline-flex items-center gap-1.5 px-2 py-1 mb-5 self-start text-[9px] font-bold tracking-[1.5px] uppercase text-[#8db8a3]"
        style={{ background: "rgba(141,184,163,0.16)" }}
      >
        <span className="block w-1.5 h-1.5 rounded-full" style={{ background: "#8db8a3" }} />
        {doneSteps} of {totalSteps} done
      </div>

      <div className="flex items-baseline gap-3 flex-wrap mb-3">
        <div className="text-[88px] sm:text-[96px] font-black tracking-[-4.5px] leading-[0.92] text-ivory">
          {totalSteps}
        </div>
        <span className="text-[32px] text-ivory/50">steps</span>
      </div>

      <div className="text-[13px] leading-[1.55] max-w-[420px] text-ivory/70">
        {hint}
      </div>

      <div className="mt-6">
        {steps.map((step, i) => (
          <div
            key={step.label}
            className={`flex gap-3.5 items-center py-3 border-t border-ivory/10 ${
              i === steps.length - 1 ? "border-b border-ivory/10" : ""
            }`}
          >
            <div
              className={`w-6 h-6 grid place-items-center text-[11px] font-extrabold ${
                step.done ? "text-ivory" : "text-ivory/50"
              }`}
              style={{
                background: step.done
                  ? "var(--color-heritage, #4D7A60)"
                  : "rgba(247,244,237,0.14)",
              }}
            >
              {step.done ? "✓" : i + 1}
            </div>
            <div
              className={`text-[13px] flex-1 ${
                step.upNext
                  ? "text-ivory font-bold"
                  : step.done
                    ? "text-ivory/85"
                    : "text-ivory/65"
              }`}
            >
              {step.label}
            </div>
            {step.done && (
              <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-ivory/40">
                Done
              </div>
            )}
            {step.upNext && (
              <div className="text-[10px] font-bold tracking-[1.5px] uppercase text-[#8db8a3]">
                Up next
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ───── Helpers ───── */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
