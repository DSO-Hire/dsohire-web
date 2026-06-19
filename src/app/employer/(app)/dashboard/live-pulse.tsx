"use client";

/**
 * <LivePulse> — BOH Remodel Lane 2d (Day 32, Model 01).
 *
 * The realtime activity rail beside the Next Best Actions queue. Seeded
 * server-side from the same recent-applications data the old Recent
 * Activity section rendered, then kept live by ONE channel with three
 * postgres_changes listeners (applications / application_messages /
 * application_scorecards INSERTs — all three tables verified present in
 * the supabase_realtime publication; RLS/WALRUS scopes every payload to
 * what this viewer may see, so no client-side filtering is trusted for
 * security, only for copy).
 *
 * Anonymity: candidate display names arrive PRE-MASKED from the server
 * (candidateDisplayName). Unknown ids render as "A candidate" — we never
 * fetch names client-side. Message events never include body content.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  REALTIME_LISTEN_TYPES,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT,
} from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface PulseSeedEvent {
  id: string;
  kind: "app" | "msg" | "score";
  text: string;
  /** Pre-formatted relative time ("2h ago") — server-rendered. */
  ago: string;
  href: string;
}

interface PulseItem extends PulseSeedEvent {
  isNew?: boolean;
}

const KIND_DOT: Record<PulseSeedEvent["kind"], string> = {
  app: "bg-ink",
  msg: "bg-[#b07d2e]",
  score: "bg-heritage",
};

const MAX_ITEMS = 8;

export function LivePulse({
  initialEvents,
  jobTitles,
  candidateNames,
}: {
  initialEvents: PulseSeedEvent[];
  /** job_id → title (recent jobs only; unknown ids get generic copy). */
  jobTitles: Record<string, string>;
  /** candidate_id → DISPLAY name (pre-masked server-side). */
  candidateNames: Record<string, string>;
}) {
  const [items, setItems] = useState<PulseItem[]>(initialEvents);
  const [isLive, setIsLive] = useState(false);
  const seen = useRef<Set<string>>(new Set(initialEvents.map((e) => e.id)));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    function push(item: PulseItem) {
      if (seen.current.has(item.id)) return;
      seen.current.add(item.id);
      setItems((cur) => [{ ...item, isNew: true }, ...cur].slice(0, MAX_ITEMS));
    }

    const channel = supabase
      .channel("dashboard:pulse")
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "applications",
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            job_id?: string;
            candidate_id?: string;
          };
          if (!row?.id) return;
          const name = candidateNames[row.candidate_id ?? ""] ?? "A candidate";
          const job = jobTitles[row.job_id ?? ""];
          push({
            id: `app-${row.id}`,
            kind: "app",
            text: `New application — ${name}${job ? ` → ${job}` : ""}`,
            ago: "now",
            href: `/employer/applications/${row.id}`,
          });
        }
      )
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "application_messages",
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            application_id?: string;
            sender_role?: string;
            kind?: string;
          };
          // Candidate replies only — employer sends are the viewer's own
          // team, and event rows (kind != null) aren't conversation.
          if (!row?.id || row.sender_role !== "candidate") return;
          push({
            id: `msg-${row.id}`,
            kind: "msg",
            text: "Reply received — a candidate answered a message",
            ago: "now",
            href: row.application_id
              ? `/employer/applications/${row.application_id}`
              : "/employer/inbox",
          });
        }
      )
      .on(
        REALTIME_LISTEN_TYPES.POSTGRES_CHANGES,
        {
          event: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT.INSERT,
          schema: "public",
          table: "application_scorecards",
        },
        (payload) => {
          const row = payload.new as {
            id?: string;
            application_id?: string;
            status?: string;
          };
          if (!row?.id) return;
          if (row.status && row.status !== "submitted") return;
          push({
            id: `score-${row.id}`,
            kind: "score",
            text: "Scorecard submitted by a teammate",
            ago: "now",
            href: row.application_id
              ? `/employer/applications/${row.application_id}`
              : "/employer/applications",
          });
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
    // Maps are server-rendered constants for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="border border-[var(--rule)] bg-card flex flex-col min-h-0">
      <header className="px-5 py-4 border-b border-[var(--rule)] flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep">
          <span className="relative flex h-2 w-2">
            {isLive && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-heritage opacity-60 animate-ping motion-reduce:animate-none" />
            )}
            <span className="relative inline-flex rounded-full h-2 w-2 bg-heritage" />
          </span>
          Live across your practices
        </span>
        <span className="text-[9px] font-bold tracking-[1.2px] uppercase text-slate-meta">
          {isLive ? "realtime" : "recent"}
        </span>
      </header>
      <div className="p-2 overflow-hidden">
        {items.length === 0 && (
          <div className="px-3 py-6 text-[12px] text-slate-body leading-relaxed">
            Quiet for now — applications, replies, and scorecards stream in
            here the moment they happen.
          </div>
        )}
        {items.map((e) => (
          <Link
            key={e.id}
            href={e.href}
            className={`flex items-start gap-2.5 px-3 py-2.5 border-b border-dashed border-[var(--rule)] last:border-b-0 hover:bg-cream/70 transition-all duration-300 motion-reduce:transition-none ${
              e.isNew ? "row-commit" : ""
            }`}
          >
            <span
              aria-hidden
              className={`mt-1.5 h-2 w-2 flex-none ${KIND_DOT[e.kind]}`}
            />
            <span className="text-[12px] leading-[1.5] text-ink min-w-0">
              {e.text}
            </span>
            <span className="ml-auto text-[10px] text-slate-meta whitespace-nowrap pt-0.5">
              {e.ago}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
