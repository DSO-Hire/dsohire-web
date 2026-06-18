/**
 * CandidateShell — auth-gated layout for /candidate/* .
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
import { redirect } from "next/navigation";
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
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BrandLockup } from "@/components/marketing/site-shell";
import { Avatar } from "@/components/ui/avatar";
import { RailCollapse } from "@/components/employer/rail-collapse";
import { CandidateMobileNav } from "./candidate-mobile-nav";
import { CandidateCommandPaletteTrigger } from "./command-palette";
import { getUnreadCount } from "@/lib/inbox/queries";
import { NavBadgeRealtime } from "@/components/inbox/nav-badge-realtime";
import { SupportLauncher } from "@/components/support/support-launcher";
import { ToastProvider } from "@/components/app/toast";

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

      {/* ── Desktop sidebar — Model H parity (Day 35) ──
           Navy throughout, drawn-on logo, animated icons, settle-edge
           active state, compact footer line, collapse-to-72px rail.
           Chrome only — loaders, badges, ⌘K, the fit-product swap, and
           the soft-delete guard above are untouched. */}
      <aside
        id="candidate-rail"
        className="hidden lg:flex w-[240px] flex-shrink-0 flex-col bg-ink text-ivory border-r border-white/10 sticky top-0 h-screen relative transition-[width] duration-[450ms]"
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
            <span className="text-[23px] font-extrabold tracking-[-0.5px] text-ivory">
              DSO
            </span>
            <span className="block w-full text-[8.5px] font-bold text-[#8db8a3] mt-[3px] text-justify [text-align-last:justify]">
              H I R E
            </span>
          </span>
        </Link>

        {/* Identity card — avatar + name (mirrors the employer org card). */}
        <div className="px-3.5 pb-1 pt-1">
          <div className="rail-org flex items-center gap-2.5 border border-white/[0.14] px-2.5 py-2">
            <Avatar
              name={candidateName}
              imageUrl={candidateAvatar}
              size="sm"
              className="ring-1 ring-white/10"
            />
            <div className="rail-org-meta min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-ivory truncate leading-tight">
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
          <ul className="list-none space-y-0.5 pt-2">
            {navWithBadges.map((item) => (
              <NavRow key={item.id} item={item} active={active} isDso={isDso} />
            ))}
            {/* #54 — crossover candidates can reach the other fit product. */}
            <li className="mt-1 px-3">
              <Link
                href={isDso ? "/candidate/practice-fit" : "/candidate/dsofit"}
                className="rail-aside block py-1.5 text-[11px] text-ivory/45 hover:text-ivory/80 transition-colors"
              >
                Also explore {isDso ? "PracticeFit" : "DSOFit"} →
              </Link>
            </li>
          </ul>
        </nav>

        {/* Footer line — Settings · Help · Sign out → (Model H parity). */}
        <div className="rail-foot border-t border-white/10 px-5 py-3.5 flex items-center gap-4">
          <Link
            href="/candidate/settings"
            className="rail-flink text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-ivory/50 hover:text-ivory transition-colors"
          >
            Settings
          </Link>
          <Link
            href="/candidate/help"
            className="rail-flink text-[9.5px] font-extrabold tracking-[1.5px] uppercase text-ivory/50 hover:text-ivory transition-colors"
          >
            Help
          </Link>
          <form action="/candidate/sign-out" method="post" className="ml-auto">
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
          <Link href="/candidate/dashboard">
            <BrandLockup height={28} />
          </Link>
          <CandidateMobileNav
            active={active}
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
                      <span className="text-ivory">
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

        <main className="flex-1 px-6 sm:px-10 py-10">
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>

      {/* Floating "?" support launcher (Tier 2 chat surface). */}
      <SupportLauncher audience="candidate" authUserId={user.id} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Single nav row — Model H rail-item (animated icon + settle edge).
 * ────────────────────────────────────────────────────────── */

function NavRow({
  item,
  active,
  isDso,
}: {
  item: NavItem;
  active?: NavId;
  isDso?: boolean;
}) {
  const isActive = active === item.id;
  const Icon = item.Icon;
  const isFit = item.id === "practice-fit";
  // The fit slot gets the premium glyph animation; everything else reuses
  // the employer per-icon verbs (rail-ic-<id>).
  const iconClass = isFit
    ? `rail-ic rail-ic-fit ${isDso ? "rail-ic-dsofit" : "rail-ic-practicefit"} h-4 w-4 flex-shrink-0`
    : `rail-ic rail-ic-${item.id} h-4 w-4 flex-shrink-0`;
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
        {isFit ? (
          <span className="rail-spark inline-flex flex-shrink-0">
            <Icon className={iconClass} />
          </span>
        ) : (
          <Icon className={iconClass} />
        )}
        <span className="rail-label flex-1">
          {isFit ? (
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
            className="rail-badge ml-2 inline-flex items-center justify-center rounded-full bg-heritage-deep px-1.5 py-0.5 text-[10px] font-bold text-ivory min-w-[18px]"
          >
            {item.badge > 99 ? "99+" : item.badge}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
