/**
 * Pure matching helpers for linking CRM accounts to paying DSOs
 * (2026-10-19). No Supabase, no I/O: the Stripe sync and the "Link to DSO"
 * card both call these, and match.test.ts covers them.
 *
 * Matching is deliberately conservative. A wrong auto-link would mark the
 * wrong prospect as a customer, so only an exact normalized name or an
 * exact website domain counts, and an ambiguous result (two candidates of
 * the same kind) is treated as no match.
 */

import { TEMPLATE_STAGES } from "@/app/crm/(app)/format";

/* Words that vary between how a group writes its name in different places
   ("Bright Smile Dental Partners, LLC" vs "Bright Smile") and carry no
   identity of their own. */
const NOISE_WORDS = new Set([
  "dental",
  "partners",
  "partner",
  "group",
  "groups",
  "the",
  "inc",
  "llc",
  "pllc",
  "pc",
  "pa",
  "co",
  "corp",
  "ltd",
]);

/** Lowercase, `&` to "and", punctuation stripped, noise words dropped,
 *  whitespace collapsed. Returns "" when nothing identifying is left
 *  (e.g. "Dental Group"), which never matches anything. */
export function normalizeOrgName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !NOISE_WORDS.has(w))
    .join(" ");
}

/** Bare domain from a website value: protocol, www, port, path, query and
 *  trailing dot removed, lowercased. null when it does not look like a
 *  domain at all. */
export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  let s = url.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  s = s.replace(/^[^@/]*@/, ""); // user:pass@
  s = s.split(/[/?#]/)[0] ?? "";
  s = s.replace(/:\d+$/, "").replace(/\.$/, "");
  s = s.replace(/^www\d*\./, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s)) return null;
  return s;
}

export type MatchKind = "domain" | "name";

/** How strongly a CRM account matches a DSO: "domain" (same website
 *  domain), "name" (same normalized name), or null. Domain wins when both
 *  hold. */
export function matchKind(
  account: { name: string | null; website: string | null },
  dso: { name: string | null; website: string | null },
): MatchKind | null {
  const ad = domainOf(account.website);
  const dd = domainOf(dso.website);
  if (ad && dd && ad === dd) return "domain";
  const an = normalizeOrgName(account.name);
  const dn = normalizeOrgName(dso.name);
  if (an && dn && an === dn) return "name";
  return null;
}

/** The single account a DSO should auto-link to, or null. A unique domain
 *  match wins; otherwise a unique name match; two or more candidates of the
 *  winning kind means "ambiguous", which returns null. */
export function findAccountMatch<T extends { id: string; name: string | null; website: string | null }>(
  dso: { name: string | null; website: string | null },
  accounts: T[],
): T | null {
  const byDomain: T[] = [];
  const byName: T[] = [];
  for (const a of accounts) {
    const k = matchKind(a, dso);
    if (k === "domain") byDomain.push(a);
    else if (k === "name") byName.push(a);
  }
  if (byDomain.length === 1) return byDomain[0];
  if (byDomain.length > 1) return null;
  if (byName.length === 1) return byName[0];
  return null;
}

/** DSOs sorted for the manual picker: domain matches, then name matches,
 *  then everything else, each group alphabetical. */
export function rankDsosForAccount<T extends { name: string | null; website: string | null }>(
  account: { name: string | null; website: string | null },
  dsos: T[],
): { suggested: T[]; rest: T[] } {
  const score = (d: T) => {
    const k = matchKind(account, d);
    return k === "domain" ? 2 : k === "name" ? 1 : 0;
  };
  const byName = (x: T, y: T) => (x.name ?? "").localeCompare(y.name ?? "");
  const scored = dsos.map((d) => ({ d, s: score(d) }));
  return {
    suggested: scored
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s || byName(x.d, y.d))
      .map((x) => x.d),
    rest: scored
      .filter((x) => x.s === 0)
      .map((x) => x.d)
      .sort(byName),
  };
}

/** Which open opportunity a payment closes: the furthest along its own
 *  stage list, ties broken by the most recent stage change, then the most
 *  recently created. Won and lost opportunities are never picked. */
export function pickOpportunityToWin<
  T extends { stage: string; custom_stages?: string[] | null; stage_changed_at?: string | null; created_at?: string | null },
>(opps: T[]): T | null {
  const open = opps.filter((o) => o.stage !== "won" && o.stage !== "lost");
  if (open.length === 0) return null;
  const rank = (o: T) => {
    const stages = o.custom_stages && o.custom_stages.length ? o.custom_stages : [...TEMPLATE_STAGES];
    return stages.indexOf(o.stage);
  };
  const ts = (v: string | null | undefined) => (v ? Date.parse(v) || 0 : 0);
  return [...open].sort(
    (x, y) =>
      rank(y) - rank(x) ||
      ts(y.stage_changed_at) - ts(x.stage_changed_at) ||
      ts(y.created_at) - ts(x.created_at),
  )[0];
}

/** Monthly recurring revenue in dollars from a Stripe price: unit amount
 *  (cents) times quantity, divided across the billing interval. null when
 *  the amount or interval is unknown (callers fall back to list price). */
export function mrrFromPrice(p: {
  unitAmountCents: number | null | undefined;
  quantity?: number | null;
  interval: string | null | undefined;
  intervalCount?: number | null;
}): number | null {
  if (p.unitAmountCents === null || p.unitAmountCents === undefined || !Number.isFinite(p.unitAmountCents)) return null;
  const qty = p.quantity && p.quantity > 0 ? p.quantity : 1;
  const count = p.intervalCount && p.intervalCount > 0 ? p.intervalCount : 1;
  const months =
    p.interval === "month" ? count : p.interval === "year" ? 12 * count : p.interval === "week" ? (count * 12) / 52 : p.interval === "day" ? (count * 12) / 365 : null;
  if (!months) return null;
  return Math.round(((p.unitAmountCents * qty) / 100 / months) * 100) / 100;
}
