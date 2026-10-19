import { redirect } from "next/navigation";

/**
 * Short, typeable link for social graphics and talks: dsohire.com/calculator
 * lands on the hiring-cost calculator on /for-dental-groups. Page-level
 * redirect, same reason as /for-dsos (config redirects() broke a Vercel
 * build). Temporary (307) so the target can move without stale caches.
 */
export default function CalculatorRedirect() {
  redirect("/for-dental-groups#calculator");
}
