/**
 * Active-location helpers (Phase 4.6.d).
 *
 * The "Viewing: <location>" multi-location switcher persists the user's
 * choice in a cookie (NOT in the URL — that pollutes every share, breaks
 * deep links, and clashes with bookmarks). Server components read the
 * cookie via `getActiveLocationId()` and filter their queries; the
 * sidebar UI updates via the `setActiveLocation` server action.
 *
 * Cookie name is namespaced + httpOnly:false so the client context
 * provider can also read it for header badge state.
 */

import { cookies } from "next/headers";

export const ACTIVE_LOCATION_COOKIE = "dsohire_active_location";

/**
 * Returns the active location id, or null when "All locations" is
 * selected (or no cookie has been set yet).
 */
export async function getActiveLocationId(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_LOCATION_COOKIE)?.value ?? "";
  if (!value || value === "all") return null;
  return value;
}
