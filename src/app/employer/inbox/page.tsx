/**
 * /employer/inbox — unified messaging surface (Phase 4.8 — stub at 4.6).
 *
 * Per the parity sprint scope, Inbox v0 ships LAST. Today messages exist
 * per-application; this surface unifies them across every application
 * into a single threaded inbox view. Stub until 4.8.
 */

import type { Metadata } from "next";
import { EmployerShell } from "@/components/employer/employer-shell";
import { ComingSoon } from "../settings/_components/coming-soon";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage() {
  return (
    <EmployerShell active="inbox">
      <div className="space-y-6 max-w-[820px]">
        <header>
          <div className="text-[10px] font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
            Inbox
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.8px] text-ink leading-tight">
            Every candidate conversation in one place.
          </h1>
        </header>
        <ComingSoon
          phaseTag="Phase 4.8"
          title="Unified threaded inbox across all applications"
          description="Today each application has its own message thread. Inbox v0 stitches them all together so you can triage candidate conversations the same way you triage email — without losing the per-application context."
          bullets={[
            "Threaded list view sorted by last message",
            "Unread count badges in the rail",
            "Quick reply with template insertion (4.5.f)",
            "Filter by job, location, stage, unread",
            "Keyboard-first navigation (j/k to move, e to archive)",
          ]}
        />
      </div>
    </EmployerShell>
  );
}
