"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  IcBuyers,
  IcInbox,
  IcPipeline,
  IcReports,
  IcRequests,
  IcSettings,
  IcToday,
} from "./icons";

const NAV: [string, ReactNode, string][] = [
  ["/crm", <IcToday key="i" />, "Today"],
  ["/crm/pipeline", <IcPipeline key="i" />, "Pipeline"],
  ["/crm/inbox", <IcInbox key="i" />, "Inbox"],
  ["/crm/reports", <IcReports key="i" />, "Reports"],
];
const NAV2: [string, ReactNode, string][] = [
  ["/crm/accounts", <IcBuyers key="i" />, "Accounts"],
  ["/crm/tasks", <IcRequests key="i" />, "Tasks"],
];

export type NavBadge = { count: number; label: string; crit?: boolean };

function Item({
  href,
  ico,
  label,
  badge,
}: {
  href: string;
  ico: ReactNode;
  label: string;
  badge?: NavBadge;
}) {
  const pathname = usePathname();
  const active = href === "/crm" ? pathname === "/crm" : pathname.startsWith(href);
  return (
    <Link className={`snav${active ? " on" : ""}`} href={href} aria-current={active ? "page" : undefined}>
      <span className="ico">{ico}</span>
      {label}
      {badge && badge.count > 0 ? (
        <span className={`badge${badge.crit ? " crit" : ""}`}>
          <span aria-hidden="true">{badge.count > 99 ? "99+" : badge.count}</span>
          <span className="ws-sr">, {badge.label}</span>
        </span>
      ) : null}
    </Link>
  );
}

/* Badges are keyed by href; a zero count renders nothing. */
export default function CrmNav({ badges }: { badges?: Partial<Record<string, NavBadge>> }) {
  return (
    <nav className="side-nav" aria-label="Primary">
      <div className="lbl">WORKSPACE</div>
      {NAV.map(([href, ico, label]) => (
        <Item key={href} href={href} ico={ico} label={label} badge={badges?.[href]} />
      ))}
      <div className="lbl">ACCOUNTS</div>
      {NAV2.map(([href, ico, label]) => (
        <Item key={href} href={href} ico={ico} label={label} badge={badges?.[href]} />
      ))}
      <div className="side-nav-spacer" />
      <Item href="/crm/settings" ico={<IcSettings />} label="Settings" />
    </nav>
  );
}
