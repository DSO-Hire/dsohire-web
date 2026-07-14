"use client";

/**
 * Candidate ⌘K palette — Lane 7 (Career HQ, Model 06). The palette
 * comes to the candidate side: thin wrapper around the shared
 * machinery (components/shared/command-palette.tsx) with a
 * candidate-flavored config. Search = lib/candidate/search-action.ts
 * (open jobs with masked DSO names, own applications, shortcuts).
 */

import {
  Bell,
  Briefcase,
  FileText,
  Gauge,
  LayoutDashboard,
  Moon,
  Search,
  Sparkles,
  Type,
} from "lucide-react";
import {
  SharedCommandPaletteTrigger,
  type PaletteCommand,
  type PaletteConfig,
} from "@/components/shared/command-palette";
import { candidateSearch } from "@/lib/candidate/search-action";
import { toggleTheme, cycleTextSize } from "@/components/theme/quick-actions";

/** Design-excellence 4a — static commands, visible the moment ⌘K opens. */
const CANDIDATE_COMMANDS: PaletteCommand[] = [
  {
    id: "browse-jobs",
    title: "Browse jobs",
    subtitle: "The public jobs board",
    icon: Search,
    keywords: ["find", "openings", "search"],
    href: "/jobs",
  },
  {
    id: "fit-board",
    title: "Open your PracticeFit board",
    subtitle: "Every open role, ranked to your profile",
    icon: Gauge,
    keywords: ["matches", "ranked", "fit", "score"],
    href: "/candidate/jobs",
  },
  {
    id: "my-applications",
    title: "My applications",
    icon: FileText,
    keywords: ["status", "applied"],
    href: "/candidate/applications",
  },
  {
    id: "job-alerts",
    title: "Manage job alerts",
    subtitle: "Saved searches + email cadence",
    icon: Bell,
    keywords: ["saved search", "notifications", "email"],
    href: "/candidate/settings/credentials",
  },
  {
    id: "go-dashboard",
    title: "Go to dashboard",
    icon: LayoutDashboard,
    keywords: ["home", "overview"],
    href: "/candidate/dashboard",
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

const CANDIDATE_PALETTE: PaletteConfig = {
  search: candidateSearch,
  groups: [
    { key: "actions", label: "Shortcuts", icon: Sparkles },
    { key: "jobs", label: "Open jobs", icon: Briefcase },
    { key: "applications", label: "Your applications", icon: FileText },
  ],
  placeholder: "Search or run a command…",
  hintItems: [
    "A job title (e.g. “hygienist”)",
    "One of your applications",
    "A shortcut (e.g. “resume” or “privacy”)",
  ],
  commands: CANDIDATE_COMMANDS,
};

export function CandidateCommandPaletteTrigger() {
  return <SharedCommandPaletteTrigger config={CANDIDATE_PALETTE} />;
}
