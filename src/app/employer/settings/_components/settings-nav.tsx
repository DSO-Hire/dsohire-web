"use client";

/**
 * SettingsNav — left-rail nested IA for /employer/settings/* (Phase 4.5.a).
 *
 * Sits inside the settings layout (which itself is wrapped by
 * EmployerShell). Renders the 10-category IA per parity-sprint scope:
 *
 *   Group 1 — You & DSO:        Account · Public Profile
 *   Group 2 — Team & Access:    Team · Locations
 *   Group 3 — Communication:    Notifications · Email Templates
 *   Group 4 — Money & Trust:    Billing · Compliance
 *   Group 5 — System:           Activity & Audit · Integrations
 *
 * Per locked rule R13: visual gaps separate groups — NO "WORK / INSIGHT
 * / SETUP" header copy. The breaks read on their own.
 *
 * Three of the entries (Team / Locations / Billing) currently link out
 * to existing top-level routes (`/employer/team`, etc.) — those will
 * fold under `/employer/settings/*` when Phase 4.6 nav restructure
 * runs. For now the rail looks unified; clicking those three navigates
 * away from the settings layout into the existing top-level surface.
 *
 * Active-row detection uses `usePathname()` startsWith match against
 * each entry's `href`. The three external entries get `external: true`
 * so they're never highlighted while inside settings.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Globe,
  EyeOff,
  Users,
  MapPin,
  Workflow,
  FileSignature,
  Bell,
  Mail,
  CreditCard,
  ShieldCheck,
  History,
  Plug,
  Database,
  ExternalLink,
} from "lucide-react";

interface NavEntry {
  id: string;
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Lives outside `/employer/settings/*` — render with a small external indicator. */
  external?: boolean;
  /** Append a "Coming soon" tag — placeholder pages get this until their phase ships. */
  comingSoon?: boolean;
}

interface NavGroup {
  id: string;
  entries: NavEntry[];
}

const GROUPS: NavGroup[] = [
  {
    id: "you-and-dso",
    entries: [
      { id: "account", label: "Account", href: "/employer/settings/account", Icon: User },
      { id: "profile", label: "Public profile", href: "/employer/settings/profile", Icon: Globe },
      { id: "affiliation", label: "Affiliation", href: "/employer/settings/affiliation", Icon: EyeOff },
    ],
  },
  {
    id: "team-access",
    entries: [
      { id: "pipeline", label: "Pipeline", href: "/employer/settings/pipeline", Icon: Workflow },
      { id: "offer-letters", label: "Offer letters", href: "/employer/settings/offer-letters", Icon: FileSignature },
      { id: "offer-approvals", label: "Offer approvals", href: "/employer/settings/offer-approvals", Icon: ShieldCheck },
      { id: "team", label: "Team", href: "/employer/team", Icon: Users, external: true },
      { id: "locations", label: "Locations", href: "/employer/locations", Icon: MapPin, external: true },
    ],
  },
  {
    id: "communication",
    entries: [
      { id: "notifications", label: "Notifications", href: "/employer/settings/notifications", Icon: Bell },
      { id: "templates", label: "Email templates", href: "/employer/settings/templates", Icon: Mail },
      { id: "outreach-templates", label: "Outreach templates", href: "/employer/settings/outreach-templates", Icon: Mail },
    ],
  },
  {
    id: "money-trust",
    entries: [
      { id: "billing", label: "Billing", href: "/employer/billing", Icon: CreditCard, external: true },
      { id: "compliance", label: "Compliance", href: "/employer/settings/compliance", Icon: ShieldCheck, comingSoon: true },
    ],
  },
  {
    id: "system",
    entries: [
      { id: "audit", label: "Activity & audit", href: "/employer/settings/audit", Icon: History },
      { id: "integrations", label: "Integrations", href: "/employer/settings/integrations", Icon: Plug },
      { id: "data", label: "Data & deletion", href: "/employer/settings/data", Icon: Database },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav aria-label="Settings sections" className="space-y-6">
      {GROUPS.map((group) => (
        <div key={group.id} className="space-y-1">
          {group.entries.map((entry) => {
            const Icon = entry.Icon;
            // Only highlight internal entries; external links shouldn't
            // pretend to be the active section while we're on a different
            // top-level surface.
            const isActive =
              !entry.external && pathname.startsWith(entry.href);
            return (
              <Link
                key={entry.id}
                href={entry.href}
                className={
                  "group flex items-center gap-3 px-3 py-2 -mx-3 rounded text-[13px] transition-colors " +
                  (isActive
                    ? "bg-cream text-ink font-bold"
                    : "text-slate-body hover:bg-cream/60 hover:text-ink")
                }
              >
                <Icon
                  className={
                    "h-4 w-4 flex-shrink-0 " +
                    (isActive
                      ? "text-heritage-deep"
                      : "text-slate-meta group-hover:text-heritage-deep")
                  }
                />
                <span className="flex-1 leading-snug">{entry.label}</span>
                {entry.external && (
                  <ExternalLink
                    className="h-3 w-3 text-slate-meta flex-shrink-0"
                    aria-label="(opens current section)"
                  />
                )}
                {entry.comingSoon && !isActive && (
                  <span className="text-[9px] font-bold tracking-[0.5px] uppercase text-slate-meta">
                    soon
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
