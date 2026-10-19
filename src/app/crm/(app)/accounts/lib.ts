/* Accounts area helpers (2026-10-19), ported from the EDC CRM's
   sellers/lib.ts. A plain module (not "use server"): row shapes, label and
   tone maps, list filtering and sorting, the preset views, the demo link and
   CSV cells. Shared by the list, the profile, the export route and the
   server actions. */

import { DEMO_URL, forKey, sanitizeForLabel } from "@/lib/marketing/demo";
import { ACCOUNT_STATUS_LABELS, isoPlusDays, oppMrr, todayIso } from "../format";

/* ---------------- label and tone maps ---------------- */

export const STATUS_TONE: Record<string, string> = {
  target: "navy",
  contacted: "warn",
  engaged: "good",
  customer: "good",
  churned: "",
  disqualified: "crit",
};

export const FIT_LABELS: Record<string, string> = {
  A: "A tier",
  B: "B tier",
  C: "C tier",
};
export const FIT_TONE: Record<string, string> = { A: "good", B: "navy", C: "" };

export const WARMTH_LABELS: Record<string, string> = {
  "1": "1, cold",
  "2": "2, aware of us",
  "3": "3, talking",
  "4": "4, warm",
  "5": "5, hot",
};

export const OUTREACH_KINDS: Record<string, string> = {
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  linkedin: "LinkedIn",
  note: "Note",
};

export const BALL_OPTS: Record<string, string> = {
  us: "Us",
  prospect: "Prospect",
  partner: "Partner",
};
export const PRIORITY_OPTS: Record<string, string> = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

/* Opportunity stages that are still open (not won, not lost). */
export const CLOSED_STAGES = new Set(["won", "lost"]);

/* ---------------- row shapes (the Supabase client is untyped) ---------------- */

export type AccountLite = {
  id: string;
  name: string;
  website: string | null;
  hq_state: string | null;
  states: string[] | null;
  locations: number | null;
  locations_note: string | null;
  open_roles: number | null;
  hiring_signal: string | null;
  growth_signal: string | null;
  current_tool: string | null;
  hiring_owner_title: string | null;
  fit_tier: string | null;
  status: string;
  source: string;
  owner_id: string | null;
  warmth: number | null;
  last_touch_at: string | null;
  next_step: string | null;
  next_step_due: string | null;
  notes: string | null;
  sources: string[] | null;
  researched_on: string | null;
  demo_for_key: string | null;
  dso_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OppLite = {
  id: string;
  account_id: string;
  name: string;
  stage: string;
  plan_tier: string | null;
  billing: string | null;
  mrr: number | string | null;
  updated_at?: string | null;
};

export type DemoVisit = {
  for_key: string;
  for_label: string | null;
  visits: number;
  created_at?: string | null;
  last_seen_at: string;
};

export type AccountRow = AccountLite & {
  openOpps: OppLite[];
  topOpp: OppLite | null;
  won: boolean;
  demo: DemoVisit | null;
};

/* ---------------- demo link + key ---------------- */

/* The personalized demo link for an account, in the exact format the
   /admin/leads link builder produces. */
export function demoLinkFor(name: string): string | null {
  const label = sanitizeForLabel(name);
  if (!label) return null;
  return `${DEMO_URL}?for=${encodeURIComponent(label).replace(/%20/g, "+")}`;
}

/* The demo_visits keys that belong to an account: its stored key plus the
   key its current name produces (a link copied from this page). */
export function demoKeysFor(a: { name: string; demo_for_key: string | null }): string[] {
  const keys = new Set<string>();
  if (a.demo_for_key) keys.add(a.demo_for_key);
  const label = sanitizeForLabel(a.name);
  if (label) {
    const k = forKey(label);
    if (k) keys.add(k);
  }
  return [...keys];
}

/* ---------------- enrich, filter, sort ---------------- */

const STAGE_ORDER = ["target", "contacted", "engaged", "discovery", "demo", "proposal", "negotiation"];
const stageRank = (s: string) => {
  const i = STAGE_ORDER.indexOf(s);
  return i < 0 ? 0 : i;
};

export function enrichAccounts(accounts: AccountLite[], opps: OppLite[], visits: DemoVisit[]): AccountRow[] {
  const byAccount = new Map<string, OppLite[]>();
  const wonSet = new Set<string>();
  for (const o of opps) {
    if (o.stage === "won") wonSet.add(o.account_id);
    if (CLOSED_STAGES.has(o.stage)) continue;
    const list = byAccount.get(o.account_id) ?? [];
    list.push(o);
    byAccount.set(o.account_id, list);
  }
  const visitByKey = new Map(visits.map((v) => [v.for_key, v]));
  return accounts.map((a) => {
    const openOpps = (byAccount.get(a.id) ?? []).sort((x, y) => stageRank(y.stage) - stageRank(x.stage));
    /* several keys can match (renamed account): keep the most recent open */
    let demo: DemoVisit | null = null;
    for (const k of demoKeysFor(a)) {
      const v = visitByKey.get(k);
      if (v && (!demo || v.last_seen_at > demo.last_seen_at)) demo = v;
    }
    return { ...a, openOpps, topOpp: openOpps[0] ?? null, won: wonSet.has(a.id), demo };
  });
}

export type AccountFilters = {
  q?: string;
  status?: string;
  fit?: string;
  warmth?: string;
  state?: string;
  source?: string;
  owner?: string;
  opp?: string;
  due?: string;
  quiet?: string;
  demo?: string;
};

export function filterAccounts(
  rows: AccountRow[],
  f: AccountFilters,
  ctx: { me?: string | null; today?: string },
): AccountRow[] {
  const today = ctx.today ?? todayIso();
  const weekEnd = isoPlusDays(today, 7);
  const q = (f.q ?? "").trim().toLowerCase().slice(0, 100);
  const quietDays = Number(f.quiet);
  return rows.filter((r) => {
    if (q) {
      const hay = [r.name, r.website, r.hq_state, r.current_tool, r.hiring_owner_title, r.next_step, ...(r.states ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.status) {
      const set = f.status.split(",");
      if (!set.includes(r.status)) return false;
    }
    if (f.fit) {
      if (f.fit === "none" ? r.fit_tier : r.fit_tier !== f.fit) return false;
    }
    if (f.warmth) {
      const min = Number(f.warmth);
      if (Number.isFinite(min) && (r.warmth ?? 0) < min) return false;
    }
    if (f.state) {
      const st = f.state.trim().toUpperCase();
      const hq = String(r.hq_state ?? "").trim().toUpperCase();
      if (hq !== st && !(r.states ?? []).some((s) => s.trim().toUpperCase() === st)) return false;
    }
    if (f.source && r.source !== f.source) return false;
    if (f.owner) {
      if (f.owner === "unassigned") {
        if (r.owner_id) return false;
      } else if (f.owner === "me") {
        if (!ctx.me || r.owner_id !== ctx.me) return false;
      } else if (r.owner_id !== f.owner) return false;
    }
    if (f.opp) {
      if (f.opp === "open") {
        if (!r.openOpps.length) return false;
      } else if (f.opp === "none") {
        if (r.openOpps.length) return false;
      } else if (!r.openOpps.some((o) => o.stage === f.opp)) return false;
    }
    if (f.due) {
      const d = r.next_step_due ? String(r.next_step_due).slice(0, 10) : null;
      if (f.due === "overdue" && !(d && d < today)) return false;
      if (f.due === "week" && !(d && d >= today && d <= weekEnd)) return false;
      if (f.due === "soon" && !(d && d <= weekEnd)) return false;
      if (f.due === "none" && d) return false;
    }
    if (Number.isFinite(quietDays) && quietDays > 0) {
      const last = r.last_touch_at ? new Date(r.last_touch_at).getTime() : 0;
      if (last && Date.now() - last < quietDays * 86_400_000) return false;
    }
    if (f.demo === "opened" && !r.demo) return false;
    if (f.demo === "never" && r.demo) return false;
    return true;
  });
}

export const SORTS: Record<string, string> = {
  next_step: "Next step due",
  name: "Name",
  added: "Added",
  last_touch: "Last touch",
  locations: "Locations",
  open_roles: "Open roles",
  warmth: "Warmth",
  fit: "Fit tier",
  demo: "Demo opens",
};

export function sortAccounts(rows: AccountRow[], sort = "next_step", dir?: string): AccountRow[] {
  const key = SORTS[sort] ? sort : "next_step";
  /* a sensible default direction per column; ?dir= flips it */
  const defaultDesc = ["added", "last_touch", "locations", "open_roles", "warmth", "demo"].includes(key);
  const desc = dir === "asc" ? false : dir === "desc" ? true : defaultDesc;
  const val = (r: AccountRow): string | number | null => {
    switch (key) {
      case "name":
        return r.name.toLowerCase();
      case "added":
        return r.created_at;
      case "last_touch":
        return r.last_touch_at ?? null;
      case "locations":
        return r.locations ?? null;
      case "open_roles":
        return r.open_roles ?? null;
      case "warmth":
        return r.warmth ?? null;
      case "fit":
        return r.fit_tier ?? null;
      case "demo":
        return r.demo?.visits ?? null;
      default:
        return r.next_step_due ?? null;
    }
  };
  return [...rows].sort((a, b) => {
    const va = val(a);
    const vb = val(b);
    /* blanks always last, whichever direction */
    if (va === null && vb === null) return a.name.localeCompare(b.name);
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = va < vb ? -1 : va > vb ? 1 : 0;
    return (desc ? -c : c) || a.name.localeCompare(b.name);
  });
}

/* ---------------- preset views ----------------
   One-click saved views over the same filters. Each is a fixed set of
   query params; picking one replaces the current filters. */
export const VIEWS: { key: string; label: string; hint: string; params: Record<string, string> }[] = [
  {
    key: "callsheet",
    label: "Call sheet",
    hint: "Next step overdue or due within a week",
    params: { due: "soon", sort: "next_step" },
  },
  {
    key: "a_untouched",
    label: "A tier, not contacted",
    hint: "Best-fit targets nobody has reached yet",
    params: { fit: "A", status: "target", sort: "locations" },
  },
  {
    key: "quiet",
    label: "Gone quiet",
    hint: "Contacted or engaged, no touch in 14 days",
    params: { status: "contacted,engaged", quiet: "14", sort: "last_touch", dir: "asc" },
  },
  {
    key: "demo",
    label: "Opened the demo",
    hint: "Opened their personalized demo link",
    params: { demo: "opened", sort: "demo" },
  },
  {
    key: "no_opp",
    label: "Engaged, no opportunity",
    hint: "Talking to us but nothing on the pipeline",
    params: { status: "engaged", opp: "none" },
  },
  {
    key: "customers",
    label: "Customers",
    hint: "Subscribed groups",
    params: { status: "customer", sort: "name" },
  },
];

/* ---------------- display ---------------- */

export function statusLabel(s: string | null | undefined): string {
  return ACCOUNT_STATUS_LABELS[s ?? "target"] ?? String(s ?? "");
}

export function openMrr(rows: AccountRow[]): number {
  let total = 0;
  for (const r of rows) for (const o of r.openOpps) total += oppMrr(o);
  return total;
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function hrefOf(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/* ---------------- CSV ---------------- */

/* RFC 4180 quoting plus formula-injection neutralization: a cell a
   spreadsheet would evaluate (=, +, -, @, tab, CR) gets a leading quote. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ---------------- query string for list links ---------------- */

export const FILTER_KEYS = [
  "q",
  "status",
  "fit",
  "warmth",
  "state",
  "source",
  "owner",
  "opp",
  "due",
  "quiet",
  "demo",
  "sort",
  "dir",
  "view",
  "archived",
] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export function listQs(
  sp: Record<string, string | undefined>,
  over: Partial<Record<FilterKey, string | null>> = {},
): string {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = k in over ? over[k] : sp[k];
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function filtersFrom(get: (k: string) => string | undefined): AccountFilters {
  return {
    q: get("q"),
    status: get("status"),
    fit: get("fit"),
    warmth: get("warmth"),
    state: get("state"),
    source: get("source"),
    owner: get("owner"),
    opp: get("opp"),
    due: get("due"),
    quiet: get("quiet"),
    demo: get("demo"),
  };
}
