/**
 * CandidateShell — auth-gated layout for /candidate/* (Phase 4.6 rewrite).
 *
 * 5-entry left rail: Dashboard / Jobs / Applications / Profile / Settings.
 * Jobs now points to `/candidate/jobs` (a candidate-shelled wrapper around
 * the public /jobs surface) so candidates don't bounce out of their authed
 * nav context — the kick-out bug Cam flagged 2026-05-06 evening.
 *
 * Sticky footer cluster: avatar + name + Help & Support + Sign out
 * (parallels EmployerShell's footer pattern).
 *
 * Mobile: dedicated hamburger drop-down opens the same items as the
 * desktop rail. The previous mobile bar was missing this entirely.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  LayoutDashboard,
  UserCircle,
  FileText,
  Settings,
  LogOut,
  Briefcase,
  LifeBuoy,
  Inbox as InboxIcon,
} from "lucide-react";
import { PracticeFitMark } from "@/components/practice-fit/brand/practice-fit-mark";
import { DsoFitMark } from "@/components/practice-fit/brand/dsofit-mark";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";
import { Avatar } from "@/components/ui/avatar";
import { CandidateMobileNav } from "./candidate-mobile-nav";
import { CandidateCommandPaletteTrigger } from "./command-palette";
import { getUnreadCount } from "@/lib/inbox/queries";
import { NavBadgeRealtime } from "@/components/inbox/nav-badge-realtime";
import { SupportLauncher } from "@/components/support/support-launcher";

interface CandidateShellProps {
  children: React.ReactNode;
  active?: NavId;
}

export type NavId =
  | "dashboard"
  | "practice-fit"
  | "jobs"
  | "applications"
  | "inbox"
  | "profile"
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
];

// Settings lives in the footer cluster (with Help + Sign out), mirroring the
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

export async function CandidateShell({ children, active }: CandidateShellProps) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/candidate/sign-in");

  const { data: candidate } = await supabase
    .from("candidates")
    .select(
      "id, full_name, headline, current_title, is_searchable, avatar_url, deleted_at, primary_fit_product"
    )
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!candidate) redirect("/candidate/sign-up");

  // Soft-deleted accounts can't reach any candidate-area page — they
  // hit the restore landing page until they restore or the 30-day
  // grace period expires (after which the cron hard-deletes the row).
  if ((candidate as Record<string, unknown>).deleted_at) {
    redirect("/candidate/restore");
  }

  const candidateName =
    (candidate.full_name as string | null) ?? user.email ?? "Candidate";
  const candidateAvatar = (candidate.avatar_url as string | null) ?? null;
  const candidateSubtitle =
    (candidate.current_title as string | null) ??
    (candidate.headline as string | null) ??
    "Profile incomplete";

  // Inbox unread badge — counts messages from the OTHER side that
  // haven't been marked read. RLS scopes the query automatically.
  const inboxUnread = await getUnreadCount(supabase, "candidate");
  // #54 — the fit nav slot swaps PracticeFit↔DSOFit by the candidate's chosen
  // track (null → PracticeFit default). Same slot id ("practice-fit") so the
  // `active` highlighting keeps working for both products.
  const fitProduct =
    ((candidate as Record<string, unknown>).primary_fit_product as string | null) ??
    "practicefit";
  const isDso = fitProduct === "dsofit";
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

  return (
    <div className="min-h-screen flex bg-ivory">
      {/* Realtime listener — bumps the Inbox nav badge when an employer
          message arrives without requiring navigation. */}
      <NavBadgeRealtime audience="candidate" />
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
            href="/candidate/dashboard"
            className="block"
            aria-label="DSO Hire — candidate dashboard"
          >
            <BrandLockup height={36} />
          </Link>
        </div>

        {/* Identity strip — avatar + name */}
        <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2.5">
          <Avatar
            name={candidateName}
            imageUrl={candidateAvatar}
            size="sm"
            className="ring-1 ring-white/10"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold text-ivory truncate leading-tight">
              {candidateName}
            </div>
            <div className="text-[9px] tracking-[1.5px] uppercase text-ivory/50 truncate">
              Candidate
            </div>
          </div>
        </div>

        {/* ⌘K universal search trigger (Lane 7 — palette unified with
            the employer side via components/shared/command-palette). */}
        <div className="px-3 pt-2">
          <CandidateCommandPaletteTrigger />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="list-none space-y-0.5">
            {navWithBadges.map((item) => (
              <NavRow key={item.id} item={item} active={active} />
            ))}
            {/* #54 — crossover candidates can reach the other fit product. */}
            <li className="mt-1 px-3">
              <Link
                href={isDso ? "/candidate/practice-fit" : "/candidate/dsofit"}
                className="block py-1.5 text-[11px] text-ivory/45 hover:text-ivory/80 transition-colors"
              >
                Also explore {isDso ? "PracticeFit" : "DSOFit"} →
              </Link>
            </li>
          </ul>
        </nav>

        {/* Footer cluster: Settings + Help + Sign out — same <ul> rhythm as
            the main nav above so the three rows are spaced identically (the
            bare-<li>-in-<div> version rendered Settings with an uneven gap). */}
        <div className="border-t border-white/10 p-3">
          <ul className="list-none space-y-0.5">
            <NavRow item={SETTINGS_ITEM} active={active} />
            <NavRow item={HELP_ITEM} active={active} />
            <li>
              <form action="/candidate/sign-out" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-[13px] font-semibold tracking-[0.5px] text-ivory/55 hover:text-ivory hover:bg-white/5 rounded transition-colors"
                >
                  <LogOut className="h-4 w-4 flex-shrink-0" />
                  <span>Sign out</span>
                </button>
              </form>
            </li>
          </ul>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 h-[64px] px-5 flex items-center justify-between border-b border-[var(--rule)] bg-ivory/95 backdrop-blur-md">
          <Link href="/candidate/dashboard">
            <BrandLockup height={28} />
          </Link>
          <CandidateMobileNav
            active={active}
            items={[...navWithBadges, SETTINGS_ITEM].map((item) => ({
              id: item.id,
              label: item.label,
              href: item.href,
            }))}
            help={{ id: HELP_ITEM.id, label: HELP_ITEM.label, href: HELP_ITEM.href }}
            user={{
              fullName: candidateName,
              avatarUrl: candidateAvatar,
              subtitle: candidateSubtitle,
            }}
          />
        </header>

        <main className="flex-1 px-6 sm:px-10 py-10">{children}</main>
      </div>

      {/* Floating "?" support launcher (Tier 2 chat surface, Day 21 Phase C). */}
      <SupportLauncher audience="candidate" authUserId={user.id} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Single nav row
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
        <span className="flex-1">
          {item.id === "practice-fit" ? (
            <>
              {item.label.replace(/Fit$/, "")}
              <span className="text-heritage-light">Fit</span>
            </>
          ) : (
            item.label
          )}
        </span>
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
