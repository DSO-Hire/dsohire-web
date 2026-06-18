/**
 * /candidate/settings layout — 6-tab IA scaffold (Phase 4.3).
 *
 * Each tab is a child route so URLs are bookmarkable + shareable + the
 * tab a candidate landed on persists across navigations. The candidate
 * shell/nav comes from the parent (app) group layout; this nested layout
 * adds the settings header + a horizontally-scrolling tab nav; child
 * routes own their own content.
 *
 * Tabs (locked from parity sprint scope §4.3):
 *   /candidate/settings/account            — password, email, phone, language
 *   /candidate/settings/notifications      — per-event × channel matrix
 *   /candidate/settings/job-preferences    — discoverability fields
 *   /candidate/settings/privacy            — visibility, blocklist, consent
 *   /candidate/settings/credentials        — licenses, CE tracking, saved searches
 *   /candidate/settings/data               — export ZIP, delete account
 *
 * The bare `/candidate/settings` route redirects to `/account` (the
 * default tab) — see `./page.tsx`.
 */

import type { ReactNode } from "react";
import { SettingsTabs } from "./settings-tabs";

export default function CandidateSettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <header className="mb-8 max-w-[760px]">
        <div className="text-[10px] font-bold tracking-[3px] uppercase text-heritage-deep mb-2">
          Account Settings
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.05] text-ink mb-4">
          Settings
        </h1>
        <p className="text-[14px] text-slate-body leading-relaxed">
          Account, notifications, privacy, credentials, and data — all
          in one place.
        </p>
      </header>

      <SettingsTabs />

      <div className="mt-6 max-w-[820px]">{children}</div>
    </>
  );
}
