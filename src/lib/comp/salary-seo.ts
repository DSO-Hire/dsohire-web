/**
 * Indexing rules for the programmatic /salary pages (Cam approved all four,
 * 2026-10-20). Search Console flagged most salary pages "Discovered" or
 * "Crawled, currently not indexed"; these keep Google's attention on pages
 * with data of their own.
 *
 *   1. Duplicate roles: office managers and practice administrators share
 *      BLS SOC 11-9111, so their pages show identical numbers. Practice
 *      administrator pages canonicalize to the office-manager page and stay
 *      out of the sitemap.
 *   2. State pages with no state-level BLS data fall back to national
 *      figures and read near-identical: noindex,follow and out of the sitemap.
 *   3. Metro pages resting on fewer than MIN_METRO_EMPLOYMENT workers (or no
 *      published count): noindex,follow.
 *   4. Metros that cross state lines canonicalize to the state listed first in
 *      the BLS area name (the principal city's state).
 */

import type { Metadata } from "next";
import { US_STATES } from "@/lib/us-states";
import { metroDetail, stateDetail } from "./salary-detail";
import { stateSlug, type SalaryRole } from "./salary";

export const MIN_METRO_EMPLOYMENT = 100;

/** Role slugs whose pages duplicate another role's data, mapped to the canonical slug. */
const DUPLICATE_ROLE_CANONICAL: Record<string, string> = {
  "practice-administrators": "office-managers",
};

export function canonicalRoleSlug(slug: string): string {
  return DUPLICATE_ROLE_CANONICAL[slug] ?? slug;
}

export function isDuplicateRole(slug: string): boolean {
  return slug in DUPLICATE_ROLE_CANONICAL;
}

/** True when BLS publishes state-level data for this role in this state. */
export function hasStateData(role: Pick<SalaryRole, "soc">, stateCode: string): boolean {
  return stateDetail(role.soc, stateCode) !== null;
}

/** Whether a role/state page belongs in the sitemap. */
export function stateSalaryInSitemap(role: Pick<SalaryRole, "soc" | "slug">, stateCode: string): boolean {
  return !isDuplicateRole(role.slug) && hasStateData(role, stateCode);
}

const NOINDEX: Metadata["robots"] = { index: false, follow: true };

export function stateSalaryRobots(role: Pick<SalaryRole, "soc">, stateCode: string): Metadata["robots"] {
  return hasStateData(role, stateCode) ? undefined : NOINDEX;
}

export function metroSalaryRobots(role: Pick<SalaryRole, "soc">, metroCode: string): Metadata["robots"] {
  const emp = metroDetail(role.soc, metroCode)?.emp ?? null;
  return emp !== null && emp >= MIN_METRO_EMPLOYMENT ? undefined : NOINDEX;
}

/**
 * Principal state slug for a metro name like "New York-Newark-Jersey City,
 * NY-NJ" (the first listed state), or null when the name carries no state
 * suffix or an unknown code.
 */
export function metroPrincipalStateSlug(metroName: string): string | null {
  const i = metroName.lastIndexOf(",");
  if (i < 0) return null;
  const first = metroName.slice(i + 1).trim().split(/[-\s]+/)[0];
  const st = US_STATES.find((s) => s.code === first);
  return st ? stateSlug(st.name) : null;
}
