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
  Users as UsersIcon,
  UsersRound,
  BarChart3,
  LifeBuoy,
  UserPlus,
  Workflow,
  ClipboardCheck,
  SquareKanban,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  effectivePermissions,
  type Capability,
} from "@/lib/permissions/capabilities";
import { BrandLockup } from "@/components/marketing/site-shell";
import { RailCollapse } from "./rail-collapse";
import { ToastProvider } from "@/components/app/toast";
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

type Role = "owner" | "admin" | "recruiter" | "hiring_manager";
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
   * Replaces the old hard hideFromRoles lists.
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

// Lane S (Model H) — named group eyebrows replace the bare dividers.
const GROUP_LABELS: Record<NavGroup, string> = {
  work: "Hire",
  insight: "Insight",
  setup: "Operate",
};

export async function EmployerShell({ children, active }: EmployerShellProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/employer/sign-in");

  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name, permission_overrides")
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

  // #83 Phase 2 — nav visibility is capability-driven (role preset +
  // per-teammate overrides) instead of hard role lists.
  const navPerms = effectivePermissions(
    role,
    (dsoUser as Record<string, unknown>).permission_overrides
  );

  // Inbox unread badge — counts messages from candidates that this user
  // (or any DSO teammate) hasn't marked read.
  // Applications new-count badge — Cam's sharpened ask 2026-05-15.
  // Counts applications currently sitting in an `open`-kind pipeline
  // stage. Both queries lean on RLS to scope to this DSO.
  const [inboxUnread, newApplications] = await Promise.all([
    getUnreadCount(supabase, "employer"),
    getNewApplicationCount(supabase),
  ]);

  // N12 — pending-offer-approvals badge for approvers.
  // RLS scopes application_offer_sends to this DSO via the join.
  let pendingApprovals = 0;
  if (navPerms["offers.approve"]) {
    const { count } = await supabase
      .from("application_offer_sends")
      .select("id", { count: "exact", head: true })
      .eq("approval_status", "pending");
    pendingApprovals = count ?? 0;
  }

  const visibleNav = NAV.filter(
    (item) => !item.requiresCap || navPerms[item.requiresCap]
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
      {/* ── Desktop sidebar — Lane S, Model H (Day 32 verdict) ──
           Navy throughout (cream brand band retired), drawn-on logo,
           named groups, settle-edge active state, compact footer row,
           collapse-to-72px icon rail. Chrome only — loaders, badges,
           capability gating, and the location switcher are untouched. */}
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

        {/* Grouped nav — named eyebrows replace bare dividers. */}
        <nav className="rail-nav flex-1 overflow-y-auto px-3 py-1">
          {groupedNav.map((group) => (
            <ul key={group.group} className="list-none space-y-0.5">
              <li
                aria-hidden="true"
                className="rail-glabel pt-3.5 pb-1.5 px-2.5 text-[8.5px] font-extrabold tracking-[2.8px] uppercase text-ivory/40"
              >
                {GROUP_LABELS[group.group]}
              </li>
              {group.items.map((item) => (
                <NavRow key={item.id} item={item} active={active} />
              ))}
            </ul>
          ))}
        </nav>

        {/* Footer row — Settings · Help · Sign out → (Model H: three
            stacked rows become one quiet line; sign out anchors the
            corner, still the same POST form). */}
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

        {/* Toast system (Lane 1 kit) mounted at the shell — first
            consumers land Day 32 night (stage changes). */}
        <main className="flex-1 px-6 sm:px-10 py-10">
          <ToastProvider>{children}</ToastProvider>
        </main>
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
        data-tip={item.label}
        className={
          "rail-item group relative flex items-center gap-3 px-3 py-2 text-[13px] font-semibold tracking-[0.2px] border border-transparent transition-colors " +
          (isActive
            ? "rail-item-on bg-white/[0.08] text-ivory border-white/10"
            : "text-ivory/60 hover:bg-white/5 hover:text-ivory")
        }
      >
        {/* rail-ic-<id> lets globals.css give each icon its own
            hover animation (inbox mail-drop, analytics bar-pump…). */}
        <Icon className={`rail-ic rail-ic-${item.id} h-4 w-4 flex-shrink-0`} />
        <span className="rail-label flex-1">{item.label}</span>
        {item.badge && item.badge > 0 ? (
          <span
            aria-label={`${item.badge} unread`}
            className="rail-badge ml-2 inline-flex items-center justify-center rounded-full bg-heritage-deep px-1.5 py-0.5 text-[10px] font-bold text-ivory min-w-[18px]"
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
