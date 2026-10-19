"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { markNotificationRead, markNotificationsSeen } from "./_workspace/actions";
import { relTime, todayIso } from "./format";

export type BellKind = "lead" | "demo" | "task" | "reply";
export type BellEvent = {
  id: string;
  ts: string;
  text: string;
  href: string;
  /* stable read-state key; defaults to id */
  key?: string;
  kind?: BellKind;
};

const KIND_LABEL: Record<BellKind, string> = {
  lead: "LEAD",
  demo: "DEMO",
  task: "TASK",
  reply: "REPLY",
};

/*
 * Notification bell. In the CRM, read state lives in Postgres per person
 * (seenAt + readKeys from the layout): opening the bell no longer clears
 * everything, rows mark themselves read when clicked, and "Mark all read"
 * moves the seen line. The Deal Room reuses this component without seenAt,
 * which keeps the older per-browser localStorage behavior.
 */
export default function NotificationsBell({
  events,
  storageKey = "dsohire-crm-bell-seen",
  subtitle = "whose court, in real time",
  seenAt,
  readKeys,
}: {
  events: BellEvent[];
  storageKey?: string;
  subtitle?: string;
  seenAt?: string | null;
  readKeys?: string[];
}) {
  const serverMode = seenAt !== undefined;
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [localSeen, setLocalSeen] = useState<number | null>(null);
  const [seenOverride, setSeenOverride] = useState<number | null>(null);
  const [readLocal, setReadLocal] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  /* legacy per-browser seen marker (Deal Room, or CRM before the migration) */
  useEffect(() => {
    if (serverMode) return;
    const t = requestAnimationFrame(() => {
      try {
        setLocalSeen(Number(localStorage.getItem(storageKey)) || 0);
      } catch {
        setLocalSeen(0);
      }
    });
    return () => cancelAnimationFrame(t);
  }, [storageKey, serverMode]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const serverSeen = seenOverride ?? (seenAt ? new Date(seenAt).getTime() : 0);
  const readSet = useMemo(() => new Set([...(readKeys ?? []), ...readLocal]), [readKeys, readLocal]);

  const isUnread = (e: BellEvent) => {
    const t = new Date(e.ts).getTime();
    if (!serverMode) return localSeen !== null && t > localSeen;
    return t > serverSeen && !readSet.has(e.key ?? e.id);
  };
  const unread = events.filter(isUnread).length;

  function markLocalSeen() {
    const now = Date.now();
    try {
      localStorage.setItem(storageKey, String(now));
    } catch {
      /* per-browser convenience only */
    }
    setLocalSeen(now);
  }

  function markAll() {
    setSeenOverride(Date.now());
    startTransition(async () => {
      await markNotificationsSeen();
    });
  }

  function onRow(e: BellEvent) {
    setOpen(false);
    if (!serverMode) return;
    const key = e.key ?? e.id;
    if (readSet.has(key)) return;
    setReadLocal((s) => new Set(s).add(key));
    startTransition(async () => {
      await markNotificationRead(key);
    });
  }

  const shown = filter === "unread" ? events.filter(isUnread) : events;
  const today = todayIso();
  const isToday = (iso: string) => todayIso(new Date(iso)) === today;
  const groups = [
    { label: "TODAY", rows: shown.filter((e) => isToday(e.ts)) },
    { label: "EARLIER", rows: shown.filter((e) => !isToday(e.ts)) },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="bellwrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className={`bellbtn${unread > 0 ? " has" : ""}`}
        aria-label={`Notifications, ${unread} unread`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open && !serverMode) markLocalSeen();
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9" />
          <path d="M10 20a2.2 2.2 0 0 0 4 0" />
        </svg>
        {unread > 0 ? <span className="bellcount num">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {/* CRM only: .ws-sr lives in workspace.css, which the Deal Room
          (it reuses this bell without seenAt) does not load. */}
      {serverMode ? (
        <span className="ws-sr" aria-live="polite">
          {unread > 0 ? `${unread} unread notifications` : ""}
        </span>
      ) : null}
      {open ? (
        <div className="belldrop ws-belldrop" role="dialog" aria-label="Notifications">
          <div className="bhd">
            NOTIFICATIONS
            {serverMode ? <em className="ws-bell-count num">{unread} UNREAD</em> : null}
            <span>{subtitle}</span>
          </div>
          {serverMode ? (
            <div className="ws-bell-bar">
              <button
                type="button"
                className={`fchip2${filter === "all" ? " on" : ""}`}
                aria-pressed={filter === "all"}
                onClick={() => setFilter("all")}
              >
                ALL
              </button>
              <button
                type="button"
                className={`fchip2${filter === "unread" ? " on" : ""}`}
                aria-pressed={filter === "unread"}
                onClick={() => setFilter("unread")}
              >
                UNREAD
              </button>
              <button type="button" className="ws-bell-markall" onClick={markAll} disabled={unread === 0}>
                Mark all read
              </button>
            </div>
          ) : null}
          <div className="ws-bell-list">
            {groups.length === 0 ? (
              <div className="bempty">
                {filter === "unread"
                  ? "You are caught up. Nothing unread."
                  : "New leads, demo opens, and tasks coming due show up here."}
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.label}>
                  {serverMode ? <div className="ws-bell-gh">{g.label}</div> : null}
                  {g.rows.map((e) => {
                    const un = isUnread(e);
                    return (
                      <Link
                        key={e.id}
                        href={e.href}
                        className={`brow2${un ? " ws-unread" : " ws-read"}`}
                        onClick={() => onRow(e)}
                      >
                        <span className="bdot" aria-hidden="true" />
                        <span className="btext">
                          {un && serverMode ? <span className="ws-sr">Unread. </span> : null}
                          {e.kind ? <span className="ws-bell-kind">{KIND_LABEL[e.kind]}</span> : null}
                          {e.text}
                        </span>
                        <span className="bts">{relTime(e.ts)}</span>
                      </Link>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
