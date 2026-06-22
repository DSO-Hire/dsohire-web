"use client";

/**
 * Admin sidebar nav — client component so the active highlight derives from the
 * URL (usePathname) without the page passing an `active` prop. Mirrors the
 * employer/candidate rail-nav pattern. Founder-only items (Tier-2, e.g. Vantage)
 * are filtered out for `support`-role staff via the `founder` flag computed in
 * the layout (the email allowlist).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, BarChart3, MessageSquare } from "lucide-react";
import { ANALYTICS_PRODUCT_NAME } from "@/lib/analytics/product";

interface NavItem {
  label: string;
  href: string;
  /** Path prefix used for the active highlight. */
  match: string;
  /** Command/home matches exactly (else it lights up on every /admin/* page). */
  exact?: boolean;
  founderOnly?: boolean;
  Icon: React.ComponentType<{ className?: string }>;
}

const NAV: NavItem[] = [
  { label: "Command", href: "/admin", match: "/admin", exact: true, Icon: LayoutDashboard },
  { label: "DSOs", href: "/admin/dsos", match: "/admin/dsos", Icon: Building2 },
  {
    label: ANALYTICS_PRODUCT_NAME,
    href: "/admin/analytics",
    match: "/admin/analytics",
    founderOnly: true,
    Icon: BarChart3,
  },
  {
    label: "Support",
    href: "/admin/support/conversations",
    match: "/admin/support",
    Icon: MessageSquare,
  },
];

export function AdminNav({ founder }: { founder: boolean }) {
  const pathname = usePathname();
  const items = NAV.filter((item) => !item.founderOnly || founder);

  return (
    <ul className="list-none">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.match
          : pathname === item.match || pathname.startsWith(`${item.match}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 px-6 py-2.5 text-[14px] font-semibold transition-colors ${
                active
                  ? "bg-hero-foreground/10 text-hero-foreground border-l-2 border-heritage"
                  : "text-hero-foreground/70 hover:text-hero-foreground hover:bg-hero-foreground/5"
              }`}
            >
              <item.Icon className="h-4 w-4" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
