/**
 * ActivityFeed — vertical list of recent events with timestamps.
 *
 * Used as a dashboard widget showing the last N significant events
 * (applications received, candidates moved, invoices paid, etc.).
 * Visually richer than just numbers — gives the dashboard a sense
 * of motion and "this is a live system" vs. "this is a status board."
 *
 * Each event has an icon (semantically-coded by event type), an actor
 * + verb + object string, an optional href to deep-link to the related
 * record, and a relative timestamp.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface ActivityEvent {
  id: string;
  /** Lucide icon for this event type. */
  icon: React.ComponentType<{ className?: string }>;
  /** Sentence describing what happened. May contain inline emphasis via <strong>. */
  body: React.ReactNode;
  /** Relative timestamp string (e.g. "2h ago", "yesterday"). */
  timestamp: string;
  /** Optional click-through to the relevant record. */
  href?: string;
  /** Tone — defaults to neutral. */
  tone?: "neutral" | "positive" | "warn";
}

interface ActivityFeedProps {
  events: ActivityEvent[];
  /** Title for the section header (eyebrow style). */
  title?: string;
  /** Empty-state message when events list is empty. */
  emptyMessage?: string;
}

export function ActivityFeed({
  events,
  title = "Recent Activity",
  emptyMessage = "No activity yet — events will show up here as they happen.",
}: ActivityFeedProps) {
  return (
    <section>
      <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
        {title}
      </div>
      {events.length === 0 ? (
        <div className="border border-[var(--rule)] bg-cream/40 p-6">
          <p className="text-[13px] text-slate-meta leading-relaxed">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <ul className="list-none border border-[var(--rule)]">
          {events.map((event, i) => (
            <li
              key={event.id}
              className={i > 0 ? "border-t border-[var(--rule)]" : ""}
            >
              {event.href ? (
                <Link
                  href={event.href}
                  className="group flex items-start gap-4 p-4 hover:bg-cream/40 transition-colors"
                >
                  <ActivityRowContent event={event} clickable />
                </Link>
              ) : (
                <div className="flex items-start gap-4 p-4">
                  <ActivityRowContent event={event} clickable={false} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRowContent({
  event,
  clickable,
}: {
  event: ActivityEvent;
  clickable: boolean;
}) {
  const iconBg =
    event.tone === "positive"
      ? "bg-heritage/15 text-heritage-deep"
      : event.tone === "warn"
        ? "bg-amber-50 text-amber-700"
        : "bg-cream text-slate-body";
  return (
    <>
      <div
        className={`h-8 w-8 flex items-center justify-center flex-shrink-0 ${iconBg}`}
      >
        <event.icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-ink leading-snug">{event.body}</div>
        <div className="text-[11px] text-slate-meta tracking-[0.2px] mt-0.5">
          {event.timestamp}
        </div>
      </div>
      {clickable && (
        <ArrowRight className="h-4 w-4 text-slate-meta group-hover:text-heritage transition-colors flex-shrink-0 mt-1" />
      )}
    </>
  );
}
