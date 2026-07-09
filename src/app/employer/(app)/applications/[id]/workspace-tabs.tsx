"use client";

/**
 * <WorkspaceTabs> — BOH Remodel Lane 3 commit 2 (Model 03).
 *
 * The evidence column of the candidate workspace: Profile / Screening /
 * Messages / Offer / Internal / Timeline. All panes arrive as
 * server-rendered ReactNode slot props and stay MOUNTED (hidden via
 * CSS) so client state inside them — message drafts, scorecard edits,
 * offer previews — survives tab switches.
 *
 * Deep links keep working: on mount + hashchange the hash maps to its
 * owning tab (#message-* → Messages, #credential-* → Internal, section
 * ids per the map below), the tab activates, then we scroll to the
 * target element.
 */

import { useCallback, useEffect, useState } from "react";
import { TabStrip } from "@/components/ui/tab-strip";
import {
  Briefcase,
  ClipboardList,
  FileSignature,
  History,
  Lock,
  MessageSquare,
} from "lucide-react";

type TabId =
  | "profile"
  | "screening"
  | "messages"
  | "offer"
  | "internal"
  | "timeline";

const HASH_TO_TAB: Record<string, TabId> = {
  fit: "profile",
  resume: "profile",
  snapshot: "profile",
  screening: "screening",
  verifications: "screening",
  messages: "messages",
  offer: "offer",
  credentials: "internal",
  references: "internal",
  scorecards: "internal",
  comments: "internal",
  notes: "internal",
  activity: "timeline",
};

function tabForHash(hash: string): TabId | null {
  const id = hash.replace(/^#/, "");
  if (!id) return null;
  if (id.startsWith("message-")) return "messages";
  if (id.startsWith("credential-")) return "internal";
  return HASH_TO_TAB[id] ?? null;
}

const TAB_ICON: Record<TabId, React.ComponentType<{ className?: string }>> = {
  profile: Briefcase,
  screening: ClipboardList,
  messages: MessageSquare,
  offer: FileSignature,
  internal: Lock,
  timeline: History,
};

export function WorkspaceTabs({
  profile,
  screening,
  messages,
  offer,
  internal,
  timeline,
  unreadMessages = 0,
}: {
  profile: React.ReactNode;
  screening: React.ReactNode;
  messages: React.ReactNode;
  /** null hides the Offer tab entirely (stage isn't offer, no sends). */
  offer: React.ReactNode | null;
  internal: React.ReactNode;
  timeline: React.ReactNode;
  unreadMessages?: number;
}) {
  const [active, setActive] = useState<TabId>("profile");

  const followHash = useCallback(() => {
    const tab = tabForHash(window.location.hash);
    if (!tab) return;
    setActive(tab);
    // Scroll after the pane unhides.
    requestAnimationFrame(() => {
      const el = document.getElementById(
        window.location.hash.replace(/^#/, "")
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  useEffect(() => {
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, [followHash]);

  const tabs: Array<{ id: TabId; label: string; badge?: number }> = [
    { id: "profile", label: "Profile" },
    { id: "screening", label: "Screening" },
    {
      id: "messages",
      label: "Messages",
      badge: unreadMessages > 0 ? unreadMessages : undefined,
    },
    ...(offer !== null
      ? [{ id: "offer" as TabId, label: "Offer" }]
      : []),
    { id: "internal", label: "Internal" },
    { id: "timeline", label: "Timeline" },
  ];

  const panes: Array<{ id: TabId; node: React.ReactNode }> = [
    { id: "profile", node: profile },
    { id: "screening", node: screening },
    { id: "messages", node: messages },
    ...(offer !== null ? [{ id: "offer" as TabId, node: offer }] : []),
    { id: "internal", node: internal },
    { id: "timeline", node: timeline },
  ];

  return (
    <div className="min-w-0">
      {/* Tab bar — the shared TabStrip primitive (design program 2b):
          same 2px heritage rule + icons, PLUS arrow-key navigation and
          aria-controls wiring the hand-rolled strip lacked. Sticky below
          the mobile shell header; document-level scroll only (no overflow
          ancestors — keeps sticky working; wrap avoids x-scroll here). */}
      <TabStrip
        ariaLabel="Candidate workspace"
        tabs={tabs.map((t) => ({ ...t, icon: TAB_ICON[t.id] }))}
        activeId={active}
        onSelect={(id) => setActive(id as TabId)}
        panelIdFor={(id) => `workspace-pane-${id}`}
        wrap
        className="sticky top-[64px] lg:top-0 z-10 bg-ivory border-b border-[var(--rule-strong)] -mt-2 pt-2"
      />

      {panes.map((p) => (
        <div
          key={p.id}
          id={`workspace-pane-${p.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${p.id}`}
          hidden={active !== p.id}
          className="pt-8"
        >
          {p.node}
        </div>
      ))}
    </div>
  );
}
