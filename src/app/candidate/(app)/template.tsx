/**
 * Candidate app-shell route template (design program 5a).
 *
 * Same contract as the employer template: every route change settles in
 * (fade + 6px rise, --ease-settle, 240ms, entrance-only); the shell
 * persists in layout.tsx. Inert under reduced motion.
 */

export default function CandidateRouteTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="route-enter">{children}</div>;
}
