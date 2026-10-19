/* Saved-view helpers shared by the SavedViews server component and the
   "use server" actions (which may export async functions only, so the
   constants and pure helpers live here). Browser-safe, no I/O. */

export const VIEW_SURFACES = ["accounts", "pipeline", "inbox", "tasks"] as const;
export type ViewSurface = (typeof VIEW_SURFACES)[number];

export const MAX_VIEWS_PER_SURFACE = 20;
export const VIEW_NAME_MAX = 60;
export const VIEW_QUERY_MAX = 1000;

/* Params that describe a moment, not a view: pagination, an open lead or
   panel, a one-off banner. They never go into a saved view. */
const VOLATILE = new Set([
  "page",
  "lead",
  "new",
  "compose",
  "error",
  "archived_one",
  "ok",
  "saved",
  "tl",
  "tl_limit",
]);

export function isViewSurface(v: unknown): v is ViewSurface {
  return typeof v === "string" && (VIEW_SURFACES as readonly string[]).includes(v);
}

export function surfacePath(surface: ViewSurface): string {
  return `/crm/${surface}`;
}

/* A stable querystring (no leading "?"): volatile and empty params dropped,
   keys sorted, so the same filters always compare equal. */
export function normalizeViewQuery(
  input: string | Record<string, string | string[] | undefined> | null | undefined,
): string {
  const pairs: [string, string][] = [];
  if (typeof input === "string") {
    for (const [k, v] of new URLSearchParams(input.replace(/^\?/, ""))) pairs.push([k, v]);
  } else if (input) {
    for (const [k, v] of Object.entries(input)) {
      const one = Array.isArray(v) ? v[0] : v;
      if (typeof one === "string") pairs.push([k, one]);
    }
  }
  const seen = new Set<string>();
  const kept = pairs
    .map(([k, v]) => [k.trim(), v.trim()] as [string, string])
    .filter(([k, v]) => {
      if (!k || !v || VOLATILE.has(k) || seen.has(k)) return false;
      if (k.length > 40 || v.length > 200) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new URLSearchParams(kept).toString();
}
