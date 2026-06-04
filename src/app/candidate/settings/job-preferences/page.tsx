/**
 * /candidate/settings/job-preferences — REDIRECT (IA reorg 2026-06-04).
 *
 * "What you're looking for" now lives on the dedicated PracticeFit surface
 * (/candidate/practice-fit), so matching preferences have one canonical home
 * instead of being split across Profile + Settings. This stub keeps any old
 * links / bookmarks working. The editor itself (./job-preferences-form) is
 * reused by the PracticeFit page.
 */

import { redirect } from "next/navigation";

export default function CandidateJobPreferencesRedirect() {
  redirect("/candidate/practice-fit#preferences");
}
