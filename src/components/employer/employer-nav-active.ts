/**
 * Shared active-nav matcher for the employer shell. Both the desktop rail
 * (employer-rail-nav.tsx) and the mobile drawer (employer-mobile-nav.tsx)
 * derive the highlighted item from the URL via this one rule — replacing the
 * old per-page `active` prop now that the shell lives in a persistent layout
 * (src/app/employer/(app)/layout.tsx) and can't know which child is rendering.
 *
 * Two slots light on MORE than their own href, preserving exactly what the
 * old per-page `active="…"` props did:
 *   • talent-pool — the candidate-detail page (/employer/candidates/[id])
 *     passed active="talent-pool", so the slot stays lit there.
 *   • billing — the Stripe checkout screens (/employer/checkout) passed
 *     active="billing", so the slot stays lit through checkout.
 *
 * The `reports` slot's href is already /employer/analytics, so the base rule
 * covers it without a special case.
 */

// Extra path prefixes that light a given nav id beyond its own href.
const EXTRA_PREFIXES: Record<string, ReadonlyArray<string>> = {
  "talent-pool": ["/employer/candidates"],
  billing: ["/employer/checkout"],
};

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isEmployerNavItemActive(
  pathname: string,
  item: { id: string; href: string }
): boolean {
  if (matchesPrefix(pathname, item.href)) return true;
  const extras = EXTRA_PREFIXES[item.id];
  return extras ? extras.some((p) => matchesPrefix(pathname, p)) : false;
}
