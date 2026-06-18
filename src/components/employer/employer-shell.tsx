/**
 * EmployerShell — the presentational chrome for /employer/* (left rail,
 * mobile header, command palette, location switcher, support launcher, chat).
 *
 * The auth gate + data fetch now live ONE level up in the route group's
 * layout (`src/app/employer/(app)/layout.tsx`), which renders this shell
 * around its children. Because a layout persists across navigation, the nav
 * no longer unmounts/remounts when moving between employer pages (the old
 * "blink"), and the content-area BrandLoader (`(app)/loading.tsx`) shows with
 * the nav still in place while a page's server data loads. The active
 * highlight is derived from the URL via usePathname (EmployerRailNav /
 * EmployerMobileNav) rather than a per-page `active` prop.
 *
 * Sidebar nav: 3 groups (Hire / Insight / Operate) + a footer cluster
 * (Settings · Help · Sign out). HM / recruiter visibility is capability-driven
 * (effectivePermissions, resolved in the layout and passed in as `navPerms`).
 *
 * This component is still a Server Component — it owns the NAV config and
 * renders each icon to a NODE (icons can't cross to the client navs as
 * component refs, but a rendered node carrying its `rail-ic-*` class is fine).
 */

import Link from "next/link";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Inbox as InboxIcon,
  MapPin,
  CreditCard,
  Settings,
  Users as UsersIcon,
  UsersRound,
  BarChart3,
  LifeBuoy,
  UserPlus,
  Workflow,
  ClipboardCheck,
  SquareKanban,
} from "lucide-react";
import type { Capability } from "@/lib/permissions/capabilities";
import { BrandLockup } from "@/components/marketing/site-shell";
import { RailCollapse } from "./rail-collapse";
import { ToastProvider } from "@/components/app/toast";
import { NavBadgeRealtime } from "@/components/inbox/nav-badge-realtime";
import { Avatar } from "@/components/ui/avatar";
import { EmployerMobileNav } from "./employer-mobile-nav";
import { EmployerRailNav, type RailNavGroup } from "./employer-rail-nav";
import { LocationSwitcher } from "./location-switcher";
import { CommandPaletteTrigger } from "./command-palette";
import { SupportLauncher } from "@/components/support/support-launcher";
import { ChatWidget } from "@/components/chat/chat-widget";

export type NavId =
  | "dashboard"
  | "jobs"
  | "pipeline"
  | "applications"
  | "talent-pool"
  | "referrals"
  | "inbox"
  | "reports"
  | "locations"
  | "team"
  | "billing"
  | "automations"
  | "offer-approvals"
  | "settings"
  | "help";

export type Role = "owner" | "admin" | "recruiter" | "hiring_manager";
type NavGroup = "work" | "insight" | "setup";

interface NavItem {
  id: NavId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  group: NavGroup;
  /**
   * #83 Phase 2 — if set, show only when the viewer's EFFECTIVE permissions
   * (role preset + per-teammate overrides) include this capability.
   */
  requiresCap?: Capability;
  /** Optional unread/notification badge — heritage pill when > 0. */
  badge?: number;
}

const NAV: ReadonlyArray<NavItem> = [
  // ─── Work ───
  { id: "dashboard", label: "Dashboard", href: "/employer/dashboard", Icon: LayoutDashboard, group: "work" },
  { id: "jobs", label: "Jobs", href: "/employer/jobs", Icon: Briefcase, group: "work" },
  // FOH-10 (Day 32) — the cross-job board. Same capability gate as the
  // applications list; RLS handles confidential/HM scoping inside.
  { id: "pipeline", label: "Pipeline HQ", href: "/employer/pipeline", Icon: SquareKanban, group: "work", requiresCap: "apps.view" },
  { id: "applications", label: "Applications", href: "/employer/applications", Icon: FileText, group: "work", requiresCap: "apps.view" },
  { id: "talent-pool", label: "Talent Pool", href: "/employer/talent-pool", Icon: UsersRound, group: "work" },
  { id: "referrals", label: "Referrals", href: "/employer/referrals", Icon: UserPlus, group: "work" },
  { id: "inbox", label: "Inbox", href: "/employer/inbox", Icon: InboxIcon, group: "work" },
  // ─── Insight ───
  { id: "reports", label: "Analytics", href: "/employer/analytics", Icon: BarChart3, group: "insight", requiresCap: "analytics.view" },
  // ─── Setup ───
  { id: "locations", label: "Locations", href: "/employer/locations", Icon: MapPin, group: "setup", requiresCap: "settings.manage" },
  { id: "team", label: "Team", href: "/employer/team", Icon: UsersIcon, group: "setup", requiresCap: "team.manage" },
  { id: "billing", label: "Billing", href: "/employer/billing", Icon: CreditCard, group: "setup", requiresCap: "billing.manage" },
  { id: "automations", label: "Automations", href: "/employer/automations", Icon: Workflow, group: "setup", requiresCap: "integrations.manage" },
  { id: "offer-approvals", label: "Offer approvals", href: "/employer/offer-approvals", Icon: ClipboardCheck, group: "setup", requiresCap: "offers.approve" },
];

// Settings lives in the footer cluster with Help + Sign out (Cam, Day 26) —
// it's an account-level destination, not a daily-work nav item.
const SETTINGS_ITEM = {
  id: "settings" as const,
  label: "Settings",
  href: "/employer/settings",
};

const HELP_ITEM = {
  id: "help" as const,
  label: "Help & Support",
  href: "/employer/help",
};

const GROUP_ORDER: ReadonlyArray<NavGroup> = ["work", "insight", "setup"];

// Lane S (Model H) — named group eyebrows replace the bare dividers.
const GROUP_LABELS: Record<NavGroup, string> = {
  work: "Hire",
  insight: "Insight",
  setup: "Operate",
};

export interface EmployerShellProps {
  children: React.ReactNode;
  /** Effective permissions (role preset + overrides) — resolved in the layout. */
  navPerms: Partial<Record<Capability, boolean>>;
  /** Nav badge counts — resolved server-side in the layout. */
  inboxUnread: number;
  newApplications: number;
  pendingApprovals: number;
  /** Identity / org for the rail org-card + mobile drawer header. */
  role: Role;
  dsoName: string;
  dsoLogo: string | null;
  dsoStatus: string;
  userFullName: string;
  /** Multi-location switcher data (Phase 4.6.d). */
  locations: Array<{ id: string; name: string; subtitle: string | null }>;
  activeLocationId: string | null;
  activeLocation: { id: string; name: string; subtitle: string | null } | null;
  /** Auth user id for the support launcher (Tier 2 chat). */
  authUserId: string;
  /** DSO id for the team + candidate chat widget. */
  dsoId: string;
}

export function EmployerShell({
  children,
  navPerms,
  inboxUnread,
  newApplications,
  pendingApprovals,
  role,
  dsoName,
  dsoLogo,
  dsoStatus,
  userFullName,
  locations,
  activeLocationId,
  activeLocation,
  authUserId,
  dsoId,
}: EmployerShellProps) {
  // #83 Phase 2 — nav visibility is capability-driven (resolved upstream).
  const visibleNav = NAV.filter(
    (item) => !item.requiresCap || navPerms[item.requiresCap]
  ).map((item) => {
    if (item.id === "inbox") return { ...item, badge: inboxUnread };
    if (item.id === "applications") return { ...item, badge: newApplications };
    if (item.id === "offer-approvals") return { ...item, badge: pendingApprovals };
    return item;
  });

  // Grouped + icon-rendered for the desktop rail. Icons become NODES here so
  // they survive the client boundary into EmployerRailNav. The rail-ic-<id>
  // class lets globals.css give each icon its own hover animation.
  const railGroups: RailNavGroup[] = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABELS[g],
    items: visibleNav
      .filter((item) => item.group === g)
      .map((item) => {
        const Icon = item.Icon;
        return {
          id: item.id,
          label: item.label,
          href: item.href,
          icon: (
            <Icon className={`rail-ic rail-ic-${item.id} h-4 w-4 flex-shrink-0`} />
          ),
          badge: item.badge,
        };
      }),
  })).filter((group) => group.items.length > 0);

  // Mobile drawer takes plain id/label/href groups (icons not shown there).
  const mobileGroups = GROUP_ORDER.map((g) => ({
    group: g,
    items: visibleNav
      .filter((item) => item.group === g)
      .map((item) => ({ id: item.id, label: item.label, href: item.href })),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen flex bg-ivory">
      {/* Realtime listener — bumps the Inbox nav badge when a candidate
          message arrives without requiring navigation. */}
      <NavBadgeRealtime audience="employer" />
      {/* ── Desktop sidebar — Lane S, Model H (Day 32 verdict) ──
           Navy throughout, drawn-on logo, named groups, settle-edge active
           state, compact footer row, collapse-to-72px icon rail. sticky top-0
           + h-screen pins the rail so the footer cluster stays in view even
           when content scrolls past the viewport height. */}
      <aside
        id="employer-rail"
        className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-ink text-ivory border-r border-white/10 sticky top-0 h-screen relative transition-[width] duration-[450ms]"
      >
        <RailCollapse />
        {/* Brand zone — the D-form mark drawn on in ivory + heritage
            stroke (the FOH verb), wordmark beside it. */}
        <Link
          href="/employer/dashboard"
          aria-label="DSO Hire — dashboard"
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
          {/* Wordmark: HIRE justifies to span DSO's full width (matches the
              true lockup). aria-hidden — the Link itself is labeled. */}
          <span className="rail-word inline-flex flex-col leading-none" aria-hidden="true">
            <span className="text-[23px] font-extrabold tracking-[-0.5px] text-ivory">
              DSO
            </span>
            <span className="block w-full text-[8.5px] font-bold text-[#8db8a3] mt-[3px] text-justify [text-align-last:justify]">
              H I R E
            </span>
          </span>
        </Link>

        {/* Org card + multi-location switcher (Phase 4.6.d — logic untouched) */}
        <div className="px-3.5 pb-1 space-y-1">
          <div className="rail-org flex items-center gap-2.5 border border-white/[0.14] px-2.5 py-2">
            <Avatar
              name={dsoName}
              imageUrl={dsoLogo}
              size="sm"
              className="ring-1 ring-white/10"
            />
            <div className="rail-org-meta min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-ivory truncate leading-tight">
                {dsoName}
              </div>
              <div className="text-[8.5px] font-bold tracking-[1.2px] uppercase text-[#8db8a3] truncate mt-0.5">
                {role.replace("_", " ")} · {dsoStatus}
              </div>
            </div>
          </div>
          <div className="rail-loc">
            <LocationSwitcher
              locations={locations}
              activeLocationId={activeLocationId}
            />
          </div>
        </div>

        {/* Cmd-K universal search trigger (Phase 4.6.e) */}
        <div className="rail-search px-3 pt-2">
          <CommandPaletteTrigger />
        </div>

        {/* Grouped nav — active highlight derived from the URL (client). */}
        <nav className="rail-nav flex-1 overflow-y-auto px-3 py-1">
          <EmployerRailNav groups={railGroups} />
        </nav>

        {/* Footer row — Settings · Help · Sign out → (Model H: one quiet
            line; sign out anchors the corner, still the same POST form). */}
        <div className="rail-foot border-t border-white/10 px-5 py-3.5 flex items-center gap-4">
          <Link
            href="/employer/settings"
            className="rail-flink text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-ivory/50 hover:text-ivory transition-colors"
          >
            Settings
          </Link>
          <Link
            href="/employer/help"
            className="rail-flink text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-ivory/50 hover:text-ivory transition-colors"
          >
            Help
          </Link>
          <form action="/employer/sign-out" method="post" className="ml-auto">
            <button
              type="submit"
              className="rail-out text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-[#8db8a3] hover:text-ivory transition-colors"
            >
              Sign out →
            </button>
          </form>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 h-[64px] px-5 flex items-center justify-between border-b border-[var(--rule)] bg-ivory/95 backdrop-blur-md">
          <Link href="/employer/dashboard">
            <BrandLockup height={28} />
          </Link>
          <EmployerMobileNav
            groups={mobileGroups}
            settings={SETTINGS_ITEM}
            help={HELP_ITEM}
            user={{
              fullName: userFullName,
              role,
              dsoName,
              dsoLogo,
              dsoStatus,
            }}
          />
        </header>

        {/* Active-location badge — persistent reminder when not on "All locations". */}
        {activeLocation && (
          <div className="border-b border-[var(--rule)] bg-cream/60 px-6 sm:px-10 py-2 text-[12px] text-slate-body inline-flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
              Viewing
            </span>
            <span className="font-semibold text-ink">{activeLocation.name}</span>
            {activeLocation.subtitle && (
              <span className="text-slate-meta">{activeLocation.subtitle}</span>
            )}
          </div>
        )}

        {/* Toast system (Lane 1 kit) mounted at the shell.
            Extra bottom padding on mobile so the fixed Messages bar never
            covers the last row of content (lg keeps the original spacing). */}
        <main className="flex-1 px-6 sm:px-10 pt-10 pb-28 lg:pb-10">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>

      {/* Floating "?" support launcher (Tier 2 chat surface, Day 21 Phase C). */}
      <SupportLauncher audience="employer" authUserId={authUserId} raised />

      {/* Pop-up team + candidate chat (Day 24) — stacked above the support button. */}
      <ChatWidget dsoId={dsoId} authId={authUserId} />
    </div>
  );
}
