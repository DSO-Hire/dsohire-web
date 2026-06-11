/**
 * May 2026 ship notes. See ./index.ts for the maintenance rule.
 */
import type { ChangelogEntry } from "./index";

export const entries: ChangelogEntry[] = [
  {
    date: "2026-05-29",
    kind: "new",
    title: "Boolean candidate search",
    body: "Recruiter-grade search across your talent pool: AND, OR, quotes, exclusions.",
  },
  {
    date: "2026-05-29",
    kind: "new",
    title: "Job scheduling & auto-expiry",
    body: "Set a posting to open and close itself. Pipelines stay clean without manual sweeps.",
  },
  {
    date: "2026-05-29",
    kind: "new",
    title: "Stale-pipeline alerts",
    body: "Candidates sitting too long in a stage now flag themselves before they ghost.",
  },
  {
    date: "2026-05-29",
    kind: "new",
    title: "Bulk messaging",
    body: "Message a whole stage or a filtered set of candidates at once, with merge fields and templates.",
  },
  {
    date: "2026-05-29",
    kind: "improved",
    title: "Recruiter productivity analytics",
    body: "See moves, messages, and outcomes per teammate — useful for Monday standups, not surveillance.",
  },
];
