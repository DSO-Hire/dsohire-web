"use client";

/**
 * Employer ⌘K palette (Phase 4.6.e) — since Lane 7 a thin wrapper
 * around the shared palette machinery in
 * components/shared/command-palette.tsx. The config below is the
 * original employer config verbatim (same groups, order, icons,
 * placeholder, hint copy), so employer behavior is unchanged.
 */

import {
  Briefcase,
  MapPin,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import {
  SharedCommandPaletteTrigger,
  type PaletteConfig,
} from "@/components/shared/command-palette";
import { employerSearch } from "@/lib/employer/search-action";

const EMPLOYER_PALETTE: PaletteConfig = {
  search: employerSearch,
  groups: [
    { key: "actions", label: "Actions", icon: Sparkles },
    { key: "jobs", label: "Jobs", icon: Briefcase },
    { key: "candidates", label: "Candidates", icon: UserIcon },
    { key: "locations", label: "Locations", icon: MapPin },
  ],
  placeholder: "Search jobs, candidates, locations, and actions…",
  hintItems: [
    "A job title (e.g. “hygienist”)",
    "A candidate’s name or email",
    "A practice location",
    "An action (e.g. “invite” or “billing”)",
  ],
};

export function CommandPaletteTrigger() {
  return <SharedCommandPaletteTrigger config={EMPLOYER_PALETTE} />;
}
