/**
 * CandidateShell — the presentational chrome for /candidate/* (left rail,
 * mobile header, command palette, support launcher).
 *
 * The auth gate + data fetch now live ONE level up in the route group's
 * layout (`src/app/candidate/(app)/layout.tsx`), which renders this shell
 * around its children. Because a layout persists across navigation, the nav
 * no longer unmounts/remounts when moving between candidate pages (the old
 * "blink"), and the active highlight is derived from the URL via usePathname
 * (CandidateRailNav / CandidateMobileNav) rather than a per-page `active` prop.
 *
 * Day 35 — left rail brought to EMPLOYER PARITY (Model H): navy
 * throughout, centered drawn-on D-form logo, animated hover icons,
 * collapse-to-72px rail, and a single Settings · Help · Sign out
 * footer line. PracticeFit / DSOFit nav marks are the real brand
 * glyphs with a premium animation (idle twinkle + hover burst) so the
 * flagship products feel flagship. Other icons reuse the employer verbs.
 *
 * Jobs points to `/candidate/jobs` (a candidate-shelled wrapper around
 * the public /jobs surface) so candidates don't bounce out of their
 * authed nav context.
 *
 * Mobile: dedicated hamburger drop-down opens the same items as the
 * desktop rail (unchanged).
 */

import Link from "next/link";
import {
  LayoutDashboard,
  UserCircle,
  FileText,
  ScrollText,
  Settings,
  Briefcase,
  LifeBuoy,
  Inbox as InboxIcon,
} from "lucide-react";
import { PracticeFitMark } from "@/components/practice-fit/brand/practice-fit-mark";
import { DsoFitMark } from "@/components/practice-fit/brand/dsofit-mark";
import { BrandLockup } from "@/components/marketing/site-shell";
import { Avatar } from "@/components/ui/avatar";
import { RailCollapse } from "@/components/employer/rail-collapse";
import { CandidateMobileNav } from "./candidate-mobile-nav";
import { CandidateRailNav, type RailNavItem } from "./candidate-rail-nav";
import { CandidateCommandPaletteTrigger } from "./command-palette";
import { NavBadgeRealtime } from "@/components/inbox/nav-badge-realtime";
import { SupportLauncher } from "@/components/support/support-launcher";
import { ToastProvider } from "@/components/app/toast";

interface CandidateShellProps {
  children: React.ReactNode;
  /** Display name for the identity card (falls back handled by the layout). */
  candidateName: string;
  candidateAvatar: string | null;
  candidateSubtitle: string;
  /** Inbox unread count for the nav badge (resolved server-side in the layout). */
  inboxUnread: number;
  /** Fit track — swaps the flagship nav slot PracticeFit↔DSOFit. */
  isDso: boolean;
  /** Auth user id for the support launcher (Tier 2 chat). */
  authUserId: string;
}

type NavId =
  | "dashboard"
  | "practice-fit"
  | "jobs"
  | "applications"
  | "inbox"
  | "profile"
  | "resume"
  | "settings"
  | "help";

interface NavItem {
  id: NavId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Optional unread/notification badge — rendered as a heritage pill when > 0. */
  badge?: number;
}

const NAV: ReadonlyArray<NavItem> = [
  { id: "dashboard", label: "Dashboard", href: "/candidate/dashboard", Icon: LayoutDashboard },
  { id: "practice-fit", label: "PracticeFit", href: "/candidate/practice-fit", Icon: PracticeFitMark },
  { id: "jobs", label: "Jobs", href: "/candidate/jobs", Icon: Briefcase },
  { id: "applications", label: "Applications", href: "/candidate/applications", Icon: FileText },
  { id: "inbox", label: "Inbox", href: "/candidate/inbox", Icon: InboxIcon },
  { id: "profile", label: "Profile", href: "/candidate/profile", Icon: UserCircle },
  { id: "resume", label: "Résumé", href: "/candidate/resume", Icon: ScrollText },
];

// Settings + Help live in the footer line (with Sign out), mirroring the
// employer shell — keeps the main rail focused on day-to-day surfaces.
const SETTINGS_ITEM: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/candidate/settings",
  Icon: Settings,
};

const HELP_ITEM: NavItem = {
  id: "help",
  label: "Help & Support",
  href: "/candidate/help",
  Icon: LifeBuoy,
};

export function CandidateShell({
  children,
  candidateName,
  candidateAvatar,
  candidateSubtitle,
  inboxUnread,
  isDso,
  authUserId,
}: CandidateShellProps) {
  // #54 — the fit nav slot swaps PracticeFit↔DSOFit by the candidate's chosen
  // track. Same slot id ("practice-fit") so the active highlighting keeps
  // working for both products.
  const navWithBadges = NAV.map((item) => {
    if (item.id === "inbox") return { ...item, badge: inboxUnread };
    if (item.id === "practice-fit")
      return {
        ...item,
        label: isDso ? "DSOFit" : "PracticeFit",
        href: isDso ? "/candidate/dsofit" : "/candidate/practice-fit",
        Icon: isDso ? DsoFitMark : PracticeFitMark,
      };
    return item;
  });

  // Desktop rail rows — icons are pre-rendered here (with their rail-ic-*
  // classes) so the real PracticeFit / DSOFit marks survive the boundary into
  // the client nav, which owns the URL-derived active state.
  const railItems: RailNavItem[] = navWithBadges.map((item) => {
    const isFit = item.id === "practice-fit";
    const iconClass = isFit
      ? `rail-ic rail-ic-fit ${isDso ? "rail-ic-dsofit" : "rail-ic-practicefit"} h-4 w-4 flex-shrink-0`
      : `rail-ic rail-ic-${item.id} h-4 w-4 flex-shrink-0`;
    return {
      id: item.id,
      label: item.label,
      href: item.href,
      badge: item.badge,
      isFit,
      icon: <item.Icon className={iconClass} />,
    };
  });

  return (
    <div className="min-h-screen flex bg-ivory">
      {/* Realtime listener — bumps the Inbox nav badge when an employer
          message arrives without requiring navigation. */}
      <NavBadgeRealtime audience="candidate" />

      {/* ── Desktop sidebar — Model H parity (Day 35) ──
           Navy throughout, drawn-on logo, animated icons, settle-edge
           active state, compact footer line, collapse-to-72px rail.
           Chrome only — loaders, badges, ⌘K, the fit-product swap, and
           the soft-delete guard above are untouched. */}
      <aside
        id="candidate-rail"
        className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen relative transition-[width] duration-[450ms] print:hidden"
      >
        <RailCollapse targetId="candidate-rail" storageKey="dsoh-cand-rail-slim" />

        {/* Brand zone — the D-form mark drawn on in ivory + heritage
            stroke, wordmark beside it (matches the employer rail). */}
        <Link
          href="/candidate/dashboard"
          aria-label="DSO Hire — candidate dashboard"
          className="rail-brand flex items-center justify-center gap-3 px-4 pt-7 pb-5"
        >
          <svg width="46" height="46" viewBox="0 0 44 44" aria-hidden="true">
            <path
              className="rail-draw1"
              d="M 5 5 L 28 5 Q 40 5 40 17 L 40 27 Q 40 39 28 39 L 5 39"
              fill="none"
              stroke="#F7F4ED"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <line
              className="rail-draw2"
              x1="8"
              y1="22"
              x2="24"
              y2="22"
              stroke="#8db8a3"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span className="rail-word inline-flex flex-col leading-none" aria-hidden="true">
            <span className="text-[23px] font-extrabold tracking-[-0.5px] text-sidebar-foreground">
              DSO
            </span>
            <span className="block w-full text-[8.5px] font-bold text-[#8db8a3] mt-[3px] text-justify [text-align-last:justify]">
              H I R E
            </span>
          </span>
        </Link>

        {/* Identity card — avatar + name (mirrors the employer org card). */}
        <div className="px-3.5 pb-1 pt-1">
          <div className="rail-org flex items-center gap-2.5 border border-sidebar-border px-2.5 py-2">
            <Avatar
              name={candidateName}
              imageUrl={candidateAvatar}
              size="sm"
              className="ring-1 ring-white/10"
            />
            <div className="rail-org-meta min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-sidebar-foreground truncate leading-tight">
                {candidateName}
              </div>
              <div className="text-[8.5px] font-bold tracking-[1.2px] uppercase text-[#8db8a3] truncate mt-0.5">
                Candidate
              </div>
            </div>
          </div>
        </div>

        {/* ⌘K universal search trigger (palette unified with the employer
            side via components/shared/command-palette). */}
        <div className="rail-search px-3 pt-2">
          <CandidateCommandPaletteTrigger />
        </div>

        <nav className="rail-nav flex-1 overflow-y-auto px-3 py-1">
          <CandidateRailNav items={railItems} isDso={isDso} />
        </nav>

        {/* Footer line — Settings · Help · Sign out → (Model H parity). */}
        <div className="rail-foot border-t border-sidebar-border px-5 py-3.5 flex items-center gap-4">
          <Link
            href="/candidate/settings"
            className="rail-flink text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            Settings
          </Link>
          <Link
            href="/candidate/help"
            className="rail-flink text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
          >
            Help
          </Link>
          <form action="/candidate/sign-out" method="post" className="ml-auto">
            <button
              type="submit"
              className="rail-out text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-[#8db8a3] hover:text-sidebar-foreground transition-colors"
            >
              Sign out →
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 h-[64px] px-5 flex items-center justify-between border-b border-[var(--rule)] bg-ivory/95 backdrop-blur-md print:hidden">
          <Link href="/candidate/dashboard">
            <BrandLockup height={28} />
          </Link>
          <CandidateMobileNav
            items={[...navWithBadges, SETTINGS_ITEM].map((item) => ({
              id: item.id,
              label: item.label,
              href: item.href,
              // Icon as a RENDERED node (Server Components can't hand a component
              // reference across the client boundary, but a ReactNode is fine).
              icon: <item.Icon className="size-5 flex-shrink-0" />,
              // The flagship fit row keeps the standard icon + label COLUMNS (so
              // the mark sizes and aligns exactly like every other row) but
              // renders the mark in its brand accent + a dual-tone wordmark:
              // PracticeFit = green, DSOFit = blue. Premium pop, no misalignment.
              node:
                item.id === "practice-fit" ? (
                  <>
                    <span
                      className={
                        "flex h-5 w-5 flex-shrink-0 items-center justify-center " +
                        (isDso ? "text-blue-400" : "text-heritage-light")
                      }
                    >
                      {isDso ? (
                        <DsoFitMark className="h-5 w-5" />
                      ) : (
                        <PracticeFitMark className="h-5 w-5" />
                      )}
                    </span>
                    <span className="font-extrabold tracking-[-0.02em]">
                      <span className="text-sidebar-foreground">
                        {isDso ? "DSO" : "Practice"}
                      </span>
                      <span
                        className={isDso ? "text-blue-400" : "text-heritage-light"}
                      >
                        Fit
                      </span>
                    </span>
                  </>
                ) : undefined,
            }))}
            help={{ id: HELP_ITEM.id, label: HELP_ITEM.label, href: HELP_ITEM.href }}
            user={{
              fullName: candidateName,
              avatarUrl: candidateAvatar,
              subtitle: candidateSubtitle,
            }}
          />
        </header>

        {/* print:p-0 — when a résumé is printed the shell chrome is hidden
            (aside + mobile header above); zeroing the main padding lets the
            sheet's own @page margins control the printed layout. */}
        <main className="flex-1 px-6 sm:px-10 py-10 print:p-0">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>

      {/* Floating "?" support launcher (Tier 2 chat surface). */}
      <SupportLauncher audience="candidate" authUserId={authUserId} />
    </div>
  );
}
