/**
 * EmployerShell — auth-gated layout for /employer/dashboard, jobs,
 * applications, billing, settings, etc. (Phase 4.6 rewrite).
 *
 * Sidebar nav restructured into 3 groups + footer cluster:
 *
 *   ┌─ Work ────────────┐
 *   │  Dashboard         │
 *   │  Jobs              │
 *   │  Applications      │
 *   │  Talent Pool       │
 *   │  Inbox             │
 *   ├─ Insight ──────────┤
 *   │  Reports           │
 *   ├─ Setup ────────────┤
 *   │  Locations         │
 *   │  Team              │
 *   │  Billing           │
 *   │  Settings          │
 *   └─ (footer cluster) ─┘
 *      avatar + DSO name
 *      Help & Support
 *      Sign out
 *
 * Per locked rule R13: visual gaps separate groups — no section
 * header copy. The breaks read on their own.
 *
 * HM persona hides: Reports / Locations / Team / Billing (locked spec).
 * Recruiter persona hides: Locations / Team / Billing.
 *
 * Mobile: hamburger drop-down opens the same items as desktop rail.
 */

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Inbox as InboxIcon,
  MapPin,
  CreditCard,
  Settings,
  LogOut,
  Users as UsersIcon,
  UsersRound,
  BarChart3,
  LifeBuoy,
  UserPlus,
  Workflow,
  ClipboardCheck,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";
import { getUnreadCount, getNewApplicationCount } from "@/lib/inbox/queries";
import { NavBadgeRealtime } from "@/components/inbox/nav-badge-realtime";
import { getMfaState } from "@/lib/auth/mfa";
import { readMfaTrustCookie } from "@/lib/auth/mfa-trust";
import { Avatar } from "@/components/ui/avatar";
import { EmployerMobileNav } from "./employer-mobile-nav";
import { LocationSwitcher } from "./location-switcher";
import { getActiveLocationId } from "@/lib/employer/active-location";
import { CommandPaletteTrigger } from "./command-palette";
import { SupportLauncher } from "@/components/support/support-launcher";
import { ChatWidget } from "@/components/chat/chat-widget";

interface EmployerShellProps {
  children: React.ReactNode;
  /** Override which sidebar item shows as active. */
  active?: NavId;
}

export type NavId =
  | "dashboard"
  | "jobs"
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

type Role = "owner" | "admin" | "recruiter" | "hiring_manager";
type NavGroup = "work" | "insight" | "setup";

interface NavItem {
  id: NavId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  group: NavGroup;
  /** If set, hide the entry from these roles. */
  hideFromRoles?: ReadonlyArray<Role>;
  /** Optional unread/notification badge — heritage pill when > 0. */
  badge?: number;
}

const NAV: ReadonlyArray<NavItem> = [
  // ─── Work ───
  { id: "dashboard", label: "Dashboard", href: "/employer/dashboard", Icon: LayoutDashboard, group: "work" },
  { id: "jobs", label: "Jobs", href: "/employer/jobs", Icon: Briefcase, group: "work" },
  { id: "applications", label: "Applications", href: "/employer/applications", Icon: FileText, group: "work" },
  { id: "talent-pool", label: "Talent Pool", href: "/employer/talent-pool", Icon: UsersRound, group: "work" },
  { id: "referrals", label: "Referrals", href: "/employer/referrals", Icon: UserPlus, group: "work" },
  { id: "inbox", label: "Inbox", href: "/employer/inbox", Icon: InboxIcon, group: "work" },
  // ─── Insight ───
  { id: "reports", label: "Analytics", href: "/employer/analytics", Icon: BarChart3, group: "insight", hideFromRoles: ["hiring_manager"] },
  // ─── Setup ───
  { id: "locations", label: "Locations", href: "/employer/locations", Icon: MapPin, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
  { id: "team", label: "Team", href: "/employer/team", Icon: UsersIcon, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
  { id: "billing", label: "Billing", href: "/employer/billing", Icon: CreditCard, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
  { id: "automations", label: "Automations", href: "/employer/automations", Icon: Workflow, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
  { id: "offer-approvals", label: "Offer approvals", href: "/employer/offer-approvals", Icon: ClipboardCheck, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
];

// Settings lives in the footer cluster with Help + Sign out (Cam, Day 26) —
// it's an account-level destination, not a daily-work nav item.
const SETTINGS_ITEM: NavItem = {
  id: "settings",
  label: "Settings",
  href: "/employer/settings",
  Icon: Settings,
  group: "setup",
};

const HELP_ITEM: NavItem = {
  id: "help",
  label: "Help & Support",
  href: "/employer/help",
  Icon: LifeBuoy,
  group: "setup",
};

const GROUP_ORDER: ReadonlyArray<NavGroup> = ["work", "insight", "setup"];

export async function EmployerShell({ children, active }: EmployerShellProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!dsoUser) redirect("/employer/onboarding");

  const { data: dso } = await supabase
    .from("dsos")
    .select("id, name, slug, status, logo_url, require_mfa, deleted_at")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  // ── Soft-deleted DSO guard (Phase 4.5.g) ──
  // If the DSO is soft-deleted, every team member hits the restore
  // landing page until the owner restores or the cron hard-deletes.
  if ((dso as Record<string, unknown> | null)?.deleted_at) {
    redirect("/employer/restore");
  }

  // ── MFA enforcement (Phase 4.5.d, refined Day 21) ──
  // Per-DSO opt-in via dso.require_mfa. Enrolled users step up to aal2
  // on each page hit UNLESS a valid 30-day trust-this-device cookie is
  // present (mfa-trust.ts) — matches industry standard (Stripe / GitHub /
  // Salesforce all do this). Sensitive actions still re-check via
  // userNeedsMfaChallenge regardless of trust.
  const mfaState = await getMfaState(supabase);
  const dsoRequiresMfa = (dso?.require_mfa as boolean | null) === true;
  if (mfaState.isEnrolled && mfaState.currentLevel !== "aal2") {
    const cookieStore = await cookies();
    const trusted = readMfaTrustCookie(cookieStore, {
      authUserId: user.id,
      verifiedFactorId: mfaState.verifiedFactorId,
    });
    if (!trusted) {
      redirect("/auth/mfa/challenge?next=/employer/dashboard");
    }
  }
  if (dsoRequiresMfa && !mfaState.isEnrolled) {
    redirect("/auth/mfa/setup");
  }

  const role = dsoUser.role as Role;

  // Inbox unread badge — counts messages from candidates that this user
  // (or any DSO teammate) hasn't marked read.
  // Applications new-count badge — Cam's sharpened ask 2026-05-15.
  // Counts applications currently sitting in an `open`-kind pipeline
  // stage. Both queries lean on RLS to scope to this DSO.
  const [inboxUnread, newApplications] = await Promise.all([
    getUnreadCount(supabase, "employer"),
    getNewApplicationCount(supabase),
  ]);

  // N12 — pending-offer-approvals badge for approvers (owner/admin only).
  // RLS scopes application_offer_sends to this DSO via the join.
  let pendingApprovals = 0;
  if (role === "owner" || role === "admin") {
    const { count } = await supabase
      .from("application_offer_sends")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending");
    pendingApprovals = count ?? 0;
  }

  const visibleNav = NAV.filter(
    (item) => !item.hideFromRoles?.includes(role)
  ).map((item) => {
    if (item.id === "inbox") return { ...item, badge: inboxUnread };
    if (item.id === "applications") return { ...item, badge: newApplications };
    if (item.id === "offer-approvals") return { ...item, badge: pendingApprovals };
    return item;
  });
  const groupedNav = GROUP_ORDER.map((g) => ({
    group: g,
    items: visibleNav.filter((item) => item.group === g),
  })).filter((group) => group.items.length > 0);

  const dsoName = (dso?.name as string | undefined) ?? "Pending";
  const dsoLogo = (dso?.logo_url as string | null) ?? null;
  const dsoStatus = (dso?.status as string | undefined) ?? "pending";
  const userFullName =
    (dsoUser.full_name as string | null) ?? user.email ?? "You";

  // ─── Multi-location switcher data (Phase 4.6.d) ───
  const [activeLocationId, { data: locationRows }] = await Promise.all([
    getActiveLocationId(),
    supabase
      .from("dso_locations")
      .select("id, name, city, state")
      .eq("dso_id", dsoUser.dso_id)
      .order("name", { ascending: true }),
  ]);
  const locations = ((locationRows ?? []) as Array<{
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  }>).map((l) => ({
    id: l.id,
    name: l.name,
    subtitle: [l.city, l.state].filter(Boolean).join(", ") || null,
  }));
  const activeLocation = activeLocationId
    ? locations.find((l) => l.id === activeLocationId) ?? null
    : null;

  return (
    <div className="min-h-screen flex bg-ivory">
      {/* Realtime listener — bumps the Inbox nav badge when a candidate
          message arrives without requiring navigation. */}
      <NavBadgeRealtime audience="employer" />
      {/* ── Desktop sidebar ──
           sticky top-0 + h-screen pins the rail to the viewport so the
           Help / Sign-out footer cluster stays in view even when the page
           content scrolls past the viewport height. */}
      <aside className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-ink text-ivory border-r border-white/10 sticky top-0 h-screen">
        {/* Brand zone — cream backdrop so the locked Navy/Heritage lockup
            reads with maximum legibility instead of relying on the dark-bg
            variant. The cream→navy transition below is its own visual rule;
            no explicit border needed. */}
        <div className="p-6 bg-cream">
          <Link
            href="/employer/dashboard"
            className="block"
            aria-label="DSO Hire — dashboard"
          >
            <BrandLockup height={36} />
          </Link>
        </div>

        {/* DSO context block + multi-location switcher (Phase 4.6.d) */}
        <div className="border-b border-white/10 py-3 px-2 space-y-1">
          <div className="flex items-center gap-2.5 px-2">
            <Avatar
              name={dsoName}
              imageUrl={dsoLogo}
              size="sm"
              className="ring-1 ring-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-ivory truncate leading-tight">
                {dsoName}
              </div>
              <div className="text-[9px] tracking-[1.5px] uppercase text-ivory/50 truncate">
                {role.replace("_", " ")} · {dsoStatus}
              </div>
            </div>
          </div>
          <LocationSwitcher
            locations={locations}
            activeLocationId={activeLocationId}
          />
        </div>

        {/* Cmd-K universal search trigger (Phase 4.6.e) */}
        <div className="px-3 pt-3">
          <CommandPaletteTrigger />
        </div>

        {/* Grouped nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-2">
          {groupedNav.map((group, idx) => (
            <ul
              key={group.group}
              className={
                "list-none space-y-0.5 " +
                (idx > 0 ? "mt-3 pt-3 border-t border-white/10" : "")
              }
            >
              {group.items.map((item) => (
                <NavRow key={item.id} item={item} active={active} />
              ))}
            </ul>
          ))}
        </nav>

        {/* Footer cluster: Settings + Help + Sign out */}
        <div className="border-t border-white/10 p-3 space-y-1">
          <NavRow item={SETTINGS_ITEM} active={active} />
          <NavRow item={HELP_ITEM} active={active} />
          <form action="/employer/sign-out" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 px-3 py-2 text-[13px] font-semibold tracking-[0.5px] text-ivory/55 hover:text-ivory hover:bg-white/5 rounded transition-colors"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span>Sign out</span>
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
            active={active}
            groups={groupedNav.map((g) => ({
              group: g.group,
              items: g.items.map((item) => ({
                id: item.id,
                label: item.label,
                href: item.href,
              })),
            }))}
            settings={{
              id: SETTINGS_ITEM.id,
              label: SETTINGS_ITEM.label,
              href: SETTINGS_ITEM.href,
            }}
            help={{
              id: HELP_ITEM.id,
              label: HELP_ITEM.label,
              href: HELP_ITEM.href,
            }}
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

        <main className="flex-1 px-6 sm:px-10 py-10">{children}</main>
      </div>

      {/* Floating "?" support launcher (Tier 2 chat surface, Day 21 Phase C). */}
      <SupportLauncher audience="employer" authUserId={user.id} raised />

      {/* Pop-up team + candidate chat (Day 24) — stacked above the support button. */}
      <ChatWidget dsoId={dsoUser.dso_id as string} authId={user.id} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Single nav row — shared between groups + the Help footer entry.
 * ────────────────────────────────────────────────────────── */

function NavRow({
  item,
  active,
}: {
  item: NavItem;
  active?: NavId;
}) {
  const isActive = active === item.id;
  const Icon = item.Icon;
  return (
    <li>
      <Link
        href={item.href}
        className={
          "flex items-center gap-3 px-3 py-1.5 text-[13px] font-semibold tracking-[0.5px] rounded transition-colors " +
          (isActive
            ? "bg-white/10 text-ivory"
            : "text-ivory/65 hover:bg-white/5 hover:text-ivory")
        }
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">{item.label}</span>
        {item.badge && item.badge > 0 ? (
          <span
            aria-label={`${item.badge} unread`}
            className="ml-2 inline-flex items-center justify-center rounded-full bg-heritage-deep px-1.5 py-0.5 text-[10px] font-bold text-ivory min-w-[18px]"
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
