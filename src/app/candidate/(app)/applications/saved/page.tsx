/**
 * /candidate/applications/saved — redirects to the unified Saved tab.
 *
 * The standalone saved-jobs route shipped first in the Phase 4.4
 * saved-jobs slice. The Phase 4.4 tab restructure folded the saved-jobs
 * surface into /candidate/applications?tab=saved as one of the seven
 * locked tabs. Keeping this route alive (as a redirect) preserves any
 * deep links that already point at /saved.
 */

import { redirect } from "next/navigation";

export default function CandidateSavedJobsRedirect() {
  redirect("/candidate/applications?tab=saved");
}
