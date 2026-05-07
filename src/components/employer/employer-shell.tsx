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
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Inbox as InboxIcon,
  MapPin,
  CreditCard,
  Settings,
  LogOut,
  Users as UsersIcon,
  UsersRound,
  BarChart3,
  LifeBuoy,
  MessageSquare,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";
import { getMfaState } from "@/lib/auth/mfa";
import { Avatar } from "@/components/ui/avatar";
import { EmployerMobileNav } from "./employer-mobile-nav";
import { LocationSwitcher } from "./location-switcher";
import { getActiveLocationId } from "@/lib/employer/active-location";
import { CommandPaletteTrigger } from "./command-palette";

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
  | "inbox"
  | "reports"
  | "locations"
  | "team"
  | "billing"
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
}

const NAV: ReadonlyArray<NavItem> = [
  // ─── Work ───
  { id: "dashboard", label: "Dashboard", href: "/employer/dashboard", Icon: LayoutDashboard, group: "work" },
  { id: "jobs", label: "Jobs", href: "/employer/jobs", Icon: Briefcase, group: "work" },
  { id: "applications", label: "Applications", href: "/employer/applications", Icon: InboxIcon, group: "work" },
  { id: "talent-pool", label: "Talent Pool", href: "/employer/talent-pool", Icon: UsersRound, group: "work" },
  { id: "inbox", label: "Inbox", href: "/employer/inbox", Icon: MessageSquare, group: "work" },
  // ─── Insight ───
  { id: "reports", label: "Reports", href: "/employer/reports", Icon: BarChart3, group: "insight", hideFromRoles: ["hiring_manager"] },
  // ─── Setup ───
  { id: "locations", label: "Locations", href: "/employer/locations", Icon: MapPin, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
  { id: "team", label: "Team", href: "/employer/team", Icon: UsersIcon, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
  { id: "billing", label: "Billing", href: "/employer/billing", Icon: CreditCard, group: "setup", hideFromRoles: ["recruiter", "hiring_manager"] },
  { id: "settings", label: "Settings", href: "/employer/settings", Icon: Settings, group: "setup" },
];

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
    .select("id, name, slug, status, logo_url, require_mfa")
    .eq("id", dsoUser.dso_id)
    .maybeSingle();

  // ── MFA enforcement (Phase 4.5.d) ──
  const mfaState = await getMfaState(supabase);
  const dsoRequiresMfa = (dso?.require_mfa as boolean | null) === true;
  if (mfaState.isEnrolled && mfaState.currentLevel !== "aal2") {
    redirect("/auth/mfa/challenge?next=/employer/dashboard");
  }
  if (dsoRequiresMfa && !mfaState.isEnrolled) {
    redirect("/auth/mfa/setup");
  }

  const role = dsoUser.role as Role;
  const visibleNav = NAV.filter(
    (item) => !item.hideFromRoles?.includes(role)
  );
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
      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-ink text-ivory border-r border-white/10">
        {/* Brand */}
        <div className="p-6 border-b border-white/10">
          <Link
            href="/employer/dashboard"
            className="block"
            aria-label="DSO Hire — dashboard"
          >
            <BrandLockup dark height={36} />
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
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groupedNav.map((group, idx) => (
            <ul
              key={group.group}
              className={
                "list-none space-y-0.5 " + (idx > 0 ? "mt-5" : "")
              }
            >
              {group.items.map((item) => (
                <NavRow key={item.id} item={item} active={active} />
              ))}
            </ul>
          ))}
        </nav>

        {/* Footer cluster: Help + Sign out */}
        <div className="border-t border-white/10 p-3 space-y-1">
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
          "flex items-center gap-3 px-3 py-2.5 text-[13px] font-semibold tracking-[0.5px] rounded transition-colors " +
          (isActive
            ? "bg-white/10 text-ivory"
            : "text-ivory/65 hover:bg-white/5 hover:text-ivory")
        }
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}
