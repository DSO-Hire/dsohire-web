"use client";

/**
 * Employer ⌘K palette (Phase 4.6.e) — a thin wrapper around the shared
 * palette machinery in components/shared/command-palette.tsx.
 *
 * Design-excellence 4a (2026-07-09): now an ACTION palette. Static
 * commands appear the moment it opens (post a job, invite, navigate,
 * theme/text toggles) and are capability-gated with the SAME effective
 * permissions the rail nav uses (shell passes navPerms down) — a
 * recruiter without team.manage never sees "Invite a teammate". Search
 * behavior (jobs / candidates / locations / actions) is unchanged.
 */

import {
  BarChart3,
  Briefcase,
  CreditCard,
  Kanban,
  LayoutDashboard,
  MapPin,
  Moon,
  Sparkles,
  Type,
  UserPlus,
  User as UserIcon,
} from "lucide-react";
import {
  SharedCommandPaletteTrigger,
  type PaletteCommand,
  type PaletteConfig,
} from "@/components/shared/command-palette";
import { employerSearch } from "@/lib/employer/search-action";
import { toggleTheme, cycleTextSize } from "@/components/theme/quick-actions";
import type { Capability } from "@/lib/permissions/capabilities";

interface GatedCommand extends PaletteCommand {
  /** Required capability — omitted = available to every teammate. */
  cap?: Capability;
}

const EMPLOYER_COMMANDS: GatedCommand[] = [
  {
    id: "post-job",
    title: "Post a job",
    subtitle: "Open the job-posting wizard",
    icon: Briefcase,
    keywords: ["new", "create", "opening", "role"],
    href: "/employer/jobs/new",
    cap: "jobs.create",
  },
  {
    id: "invite-teammate",
    title: "Invite a teammate",
    subtitle: "Add someone to your DSO",
    icon: UserPlus,
    keywords: ["team", "member", "add", "user"],
    href: "/employer/team",
    cap: "team.manage",
  },
  {
    id: "go-pipeline",
    title: "Go to Pipeline HQ",
    subtitle: "The cross-job applications board",
    icon: Kanban,
    keywords: ["kanban", "applications", "candidates", "board"],
    href: "/employer/applications",
    cap: "apps.view",
  },
  {
    id: "go-dashboard",
    title: "Go to dashboard",
    icon: LayoutDashboard,
    keywords: ["home", "overview"],
    href: "/employer/dashboard",
  },
  {
    id: "go-analytics",
    title: "View analytics",
    subtitle: "Hiring funnel, sources, time-to-hire",
    icon: BarChart3,
    keywords: ["reports", "metrics", "funnel"],
    href: "/employer/analytics",
    cap: "analytics.view",
  },
  {
    id: "go-locations",
    title: "Manage locations",
    icon: MapPin,
    keywords: ["practices", "offices"],
    href: "/employer/locations",
  },
  {
    id: "go-billing",
    title: "Manage billing",
    subtitle: "Subscription + invoices",
    icon: CreditCard,
    keywords: ["plan", "payment", "invoice", "upgrade"],
    href: "/employer/billing",
    cap: "billing.manage",
  },
  {
    id: "toggle-theme",
    title: "Toggle dark mode",
    icon: Moon,
    keywords: ["theme", "light", "appearance", "night"],
    run: () => void toggleTheme(),
    keepOpen: true,
  },
  {
    id: "cycle-text-size",
    title: "Cycle text size",
    subtitle: "Default → Large → Larger",
    icon: Type,
    keywords: ["font", "zoom", "accessibility", "bigger"],
    run: () => void cycleTextSize(),
    keepOpen: true,
  },
];

export function CommandPaletteTrigger({
  navPerms,
}: {
  /** Effective permissions from the shell — same map the rail nav uses. */
  navPerms?: Partial<Record<Capability, boolean>>;
}) {
  const commands = EMPLOYER_COMMANDS.filter(
    (c) => !c.cap || navPerms?.[c.cap] === true
  );

  const config: PaletteConfig = {
    search: employerSearch,
    groups: [
      { key: "actions", label: "Actions", icon: Sparkles },
      { key: "jobs", label: "Jobs", icon: Briefcase },
      { key: "candidates", label: "Candidates", icon: UserIcon },
      { key: "locations", label: "Locations", icon: MapPin },
    ],
    placeholder: "Search or run a command…",
    hintItems: [
      "A job title (e.g. “hygienist”)",
      "A candidate’s name or email",
      "A practice location",
      "An action (e.g. “invite” or “billing”)",
    ],
    commands,
  };

  return <SharedCommandPaletteTrigger config={config} />;
}
