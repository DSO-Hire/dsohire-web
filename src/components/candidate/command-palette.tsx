"use client";

/**
 * Candidate ⌘K palette — Lane 7 (Career HQ, Model 06). The palette
 * comes to the candidate side: thin wrapper around the shared
 * machinery (components/shared/command-palette.tsx) with a
 * candidate-flavored config. Search = lib/candidate/search-action.ts
 * (open jobs with masked DSO names, own applications, shortcuts).
 */

import { Briefcase, FileText, Sparkles } from "lucide-react";
import {
  SharedCommandPaletteTrigger,
  type PaletteConfig,
} from "@/components/shared/command-palette";
import { candidateSearch } from "@/lib/candidate/search-action";

const CANDIDATE_PALETTE: PaletteConfig = {
  search: candidateSearch,
  groups: [
    { key: "actions", label: "Shortcuts", icon: Sparkles },
    { key: "jobs", label: "Open jobs", icon: Briefcase },
    { key: "applications", label: "Your applications", icon: FileText },
  ],
  placeholder: "Search jobs, your applications, and shortcuts…",
  hintItems: [
    "A job title (e.g. “hygienist”)",
    "One of your applications",
    "A shortcut (e.g. “résumé” or “privacy”)",
  ],
};

export function CandidateCommandPaletteTrigger() {
  return <SharedCommandPaletteTrigger config={CANDIDATE_PALETTE} />;
}
