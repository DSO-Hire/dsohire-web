/**
 * /candidate/settings — redirects to the Account tab (default landing).
 *
 * The actual tab nav + 6 child routes live in `./layout.tsx` + sibling
 * sub-routes (./account, ./notifications, ./job-preferences, ./privacy,
 * ./credentials, ./data). Phase 4.3 IA shell.
 */

import { redirect } from "next/navigation";

export default function CandidateSettingsIndex() {
  redirect("/candidate/settings/account");
}
