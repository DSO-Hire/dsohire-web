/**
 * /employer/settings — redirects to the default settings landing page
 * (Account category) per Phase 4.5.a IA scaffold.
 *
 * The bare /settings URL is preserved for inbound links + bookmarks; it
 * just lands on /employer/settings/account by default.
 */

import { redirect } from "next/navigation";

export default function SettingsRoot() {
  redirect("/employer/settings/account");
}
