"use client";

/**
 * <SettingsTabs> — horizontal tab nav for /candidate/settings.
 *
 * Reads the active path so the highlighted tab matches whichever child
 * route is currently rendered. Mobile: horizontally scrolls — never
 * collapses to a hamburger because tabs are core IA, not optional.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tab {
  href: string;
  label: string;
}

const TABS: ReadonlyArray<Tab> = [
  { href: "/candidate/settings/account", label: "Account" },
  { href: "/candidate/settings/notifications", label: "Notifications" },
  { href: "/candidate/settings/job-preferences", label: "Job preferences" },
  { href: "/candidate/settings/privacy", label: "Privacy & visibility" },
  { href: "/candidate/settings/credentials", label: "Credentials" },
  { href: "/candidate/settings/data", label: "Data & account" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Settings sections"
      className="-mx-4 overflow-x-auto border-b border-[var(--rule)] sm:mx-0"
    >
      <ul className="flex min-w-max gap-1 px-4 sm:px-0">
        {TABS.map((tab) => {
          const isActive =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition ${
                  isActive
                    ? "border-[#4D7A60] text-[#14233F]"
                    : "border-transparent text-slate-600 hover:border-slate-300 hover:text-[#14233F]"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
