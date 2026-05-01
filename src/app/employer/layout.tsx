/**
 * /employer/* layout.
 *
 * For /employer/sign-in and /employer/sign-up we want the marketing shell
 * (so visitors don't see an empty/broken auth-gated nav). For everything
 * else under /employer (dashboard, jobs, applications, billing, etc.) we
 * want the authenticated employer shell with sidebar nav.
 *
 * To keep things simple right now, both flow through this single layout.
 * Page-level auth checks happen in the page components themselves via
 * createSupabaseServerClient + auth.getUser. We'll split into nested
 * layouts (e.g. /employer/(auth)/sign-in/, /employer/(authed)/dashboard/)
 * when the surface grows.
 */

export default function EmployerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
