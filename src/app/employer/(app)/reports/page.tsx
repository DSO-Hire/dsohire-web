/**
 * /employer/reports — permanently moved to /employer/analytics (Day 24).
 *
 * The reporting surface was absorbed into the new Analytics Hub. This stub
 * preserves any bookmarked/linked /reports URLs by redirecting. Kept as a
 * page-level redirect (not a next.config rewrite) per the Vercel
 * modifyConfig build-failure playbook.
 */

import { redirect } from "next/navigation";

export default function ReportsRedirect() {
  redirect("/employer/analytics");
}
