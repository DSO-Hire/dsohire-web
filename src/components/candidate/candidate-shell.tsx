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
  Search,
  LifeBuoy,
} from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";
import { Avatar } from "@/components/ui/avatar";
import { CandidateMobileNav } from "./candidate-mobile-nav";

interface CandidateShellProps {
  children: React.ReactNode;
  active?: NavId;
}

export type NavId =
  | "dashboard"
  | "jobs"
  | "applications"
  | "profile"
  | "settings"
  | "help";

interface NavItem {
  id: NavId;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const NAV: ReadonlyArray<NavItem> = [
  { id: "dashboard", label: "Dashboard", href: "/candidate/dashboard", Icon: LayoutDashboard },
  { id: "jobs", label: "Jobs", href: "/candidate/jobs", Icon: Search },
  { id: "applications", label: "Applications", href: "/candidate/applications", Icon: FileText },
  { id: "profile", label: "Profile", href: "/candidate/profile", Icon: UserCircle },
  { id: "settings", label: "Settings", href: "/candidate/settings", Icon: Settings },
];

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
      "id, full_name, headline, current_title, is_searchable, avatar_url, deleted_at"
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

  return (
    <div className="min-h-screen flex bg-ivory">
      {/* ── Desktop sidebar ──
           sticky top-0 + h-screen pins the rail to the viewport so the
           Help / Sign-out footer cluster stays in view even when the page
           content scrolls past the viewport height. */}
      <aside className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-ink text-ivory border-r border-white/10 sticky top-0 h-screen">
        <div className="p-6 border-b border-white/10">
          <Link
            href="/candidate/dashboard"
            className="block"
            aria-label="DSO Hire — candidate dashboard"
          >
            <BrandLockup dark height={36} />
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

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="list-none space-y-0.5">
            {NAV.map((item) => (
              <NavRow key={item.id} item={item} active={active} />
            ))}
          </ul>
        </nav>

        {/* Footer cluster: Help + Sign out */}
        <div className="border-t border-white/10 p-3 space-y-1">
          <NavRow item={HELP_ITEM} active={active} />
          <form action="/candidate/sign-out" method="post">
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
          <Link href="/candidate/dashboard">
            <BrandLockup height={28} />
          </Link>
          <CandidateMobileNav
            active={active}
            items={NAV.map((item) => ({
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
        <span>{item.label}</span>
      </Link>
    </li>
  );
}
