"use client";

/**
 * CandidateRailNav — the desktop rail's nav list + the "Also explore …"
 * crossover link. Split out of candidate-shell.tsx so the active-item
 * highlight can be derived from the URL (usePathname) now that the shell
 * lives in a persistent layout and no longer receives an `active` prop.
 *
 * Icons arrive as PRE-RENDERED nodes from the (server) shell — Server
 * Components can't hand a component reference across the client boundary,
 * but a ReactNode is fine (same trick candidate-mobile-nav.tsx uses). The
 * icon node already carries its `rail-ic-*` classes from the shell; this
 * component only owns the per-row active state + chrome.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isNavItemActive } from "./nav-active";

export interface RailNavItem {
  id: string;
  label: string;
  href: string;
  /** Pre-rendered icon node (the real PracticeFit / DSOFit marks survive). */
  icon: ReactNode;
  /** Optional unread/notification badge — rendered as a heritage pill when > 0. */
  badge?: number;
  /** The flagship fit slot gets the spark wrapper + dual-tone "Fit" label. */
  isFit?: boolean;
}

export function CandidateRailNav({
  items,
  isDso,
}: {
  items: RailNavItem[];
  isDso: boolean;
}) {
  const pathname = usePathname() ?? "";
  return (
    <ul className="list-none space-y-0.5 pt-2">
      {items.map((item) => {
        const isActive = isNavItemActive(pathname, item);
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              data-tip={item.label}
              className={
                "rail-item group relative flex items-center gap-3 px-3 py-2 text-[13px] font-semibold tracking-[0.2px] border border-transparent transition-colors " +
                (isActive
                  ? "rail-item-on bg-white/[0.08] text-sidebar-foreground border-sidebar-border"
                  : "text-sidebar-foreground/60 hover:bg-white/5 hover:text-sidebar-foreground")
              }
            >
              {item.isFit ? (
                <span className="rail-spark inline-flex flex-shrink-0">
                  {item.icon}
                </span>
              ) : (
                item.icon
              )}
              <span className="rail-label flex-1">
                {item.isFit ? (
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
                  className="rail-badge ml-2 inline-flex items-center justify-center rounded-full bg-heritage-deep px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground min-w-[18px]"
                >
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}

      {/* #54 — crossover candidates can reach the other fit product. */}
      <li className="mt-1 px-3">
        <Link
          href={isDso ? "/candidate/practice-fit" : "/candidate/dsofit"}
          className="rail-aside block py-1.5 text-[11px] text-sidebar-foreground/45 hover:text-sidebar-foreground/80 transition-colors"
        >
          Also explore {isDso ? "PracticeFit" : "DSOFit"} →
        </Link>
      </li>
    </ul>
  );
}
