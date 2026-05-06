/**
 * /candidate/settings/job-preferences — Phase 4.3.c.
 *
 * Per the locked scope, job-preferences live on the candidate's profile
 * editor (already shipped in Phase 4.2.b). Rather than duplicate the UI
 * here in Settings, the tab redirects to the profile section card with
 * a scroll anchor. The redirect target carries the `#section-job-preferences`
 * fragment which scrolls the corresponding card into view on land.
 *
 * The route stays in place so any existing deep-links remain valid.
 * If we ever decide to expand the Settings-side tab beyond what the
 * profile editor offers (e.g. license-state preferences, DSO size
 * preference, day+evening per weekday), we replace this redirect with
 * a real page.
 */

import { redirect } from "next/navigation";

export default function CandidateJobPreferencesRedirect() {
  redirect("/candidate/profile#section-job-preferences");
}
