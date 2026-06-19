"use client";

/**
 * EmployerRailNav — the desktop rail's grouped nav list. Split out of
 * employer-shell.tsx so the active-item highlight can be derived from the URL
 * (usePathname) now that the shell lives in a persistent layout and no longer
 * receives an `active` prop.
 *
 * Icons arrive as PRE-RENDERED nodes from the (server) shell — Server
 * Components can't hand a component reference across the client boundary, but
 * a ReactNode is fine. Each icon node already carries its `rail-ic-*` classes
 * from the shell (so globals.css keeps each icon's hover animation); this
 * component only owns the per-row active state + chrome.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isEmployerNavItemActive } from "./employer-nav-active";

export interface RailNavItem {
  id: string;
  label: string;
  href: string;
  /** Pre-rendered icon node (carries its rail-ic-* classes from the shell). */
  icon: ReactNode;
  /** Optional unread/notification badge — heritage pill when > 0. */
  badge?: number;
}

export interface RailNavGroup {
  group: string;
  /** Named eyebrow (GROUP_LABELS) shown above the group's rows. */
  label: string;
  items: RailNavItem[];
}

export function EmployerRailNav({ groups }: { groups: RailNavGroup[] }) {
  const pathname = usePathname() ?? "";
  return (
    <>
      {groups.map((group) => (
        <ul key={group.group} className="list-none space-y-0.5">
          <li
            aria-hidden="true"
            className="rail-glabel pt-3.5 pb-1.5 px-2.5 text-[8.5px] font-extrabold tracking-[2.8px] uppercase text-sidebar-foreground/40"
          >
            {group.label}
          </li>
          {group.items.map((item) => {
            const isActive = isEmployerNavItemActive(pathname, item);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  data-tip={item.label}
                  className={
                    "rail-item group relative flex items-center gap-3 px-3 py-2 text-[13px] font-semibold tracking-[0.2px] border border-transparent transition-colors " +
                    (isActive
                      ? "rail-item-on bg-sidebar-foreground/[0.08] text-sidebar-foreground border-sidebar-border"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground")
                  }
                >
                  {item.icon}
                  <span className="rail-label flex-1">{item.label}</span>
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
        </ul>
      ))}
    </>
  );
}
