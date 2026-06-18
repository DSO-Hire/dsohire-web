/**
 * Shared active-nav matcher for the candidate shell. Both the desktop rail
 * (candidate-rail-nav.tsx) and the mobile drawer (candidate-mobile-nav.tsx)
 * derive the highlighted item from the URL via this one rule — replacing the
 * old per-page `active` prop now that the shell lives in a persistent layout
 * and can't know which child is rendering.
 *
 * The fit slot is special: it stays lit across all four fit-related routes so
 * the PracticeFit↔DSOFit swap (and the assessment wizards, which previously
 * passed active="practice-fit") keep their highlight. A naive 2-prefix rule
 * would drop the wizards.
 */

const FIT_PREFIXES = [
  "/candidate/practice-fit",
  "/candidate/dsofit",
  "/candidate/assessment",
  "/candidate/dsofit-assessment",
];

const matchesPrefix = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isNavItemActive(
  pathname: string,
  item: { id: string; href: string }
): boolean {
  if (item.id === "practice-fit") {
    return FIT_PREFIXES.some((p) => matchesPrefix(pathname, p));
  }
  // No two non-fit nav hrefs are prefixes of one another, so an exact-or-nested
  // match is unambiguous (same pattern as settings-tabs.tsx).
  return matchesPrefix(pathname, item.href);
}
