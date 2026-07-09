/**
 * Employer app-shell route template (design program 5a).
 *
 * Next remounts a template's children on every navigation — we use that
 * to give each route change the house entrance: fade + 6px settle on
 * --ease-settle, 240ms, entrance-only (never blocks interaction). The
 * shell (rail, top bar) lives in layout.tsx and does NOT remount.
 * Reduced motion ⇒ inert (the .route-enter rule is wrapped in a
 * prefers-reduced-motion: no-preference media query).
 */

export default function EmployerRouteTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="route-enter">{children}</div>;
}
