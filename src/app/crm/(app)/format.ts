/* DSO Hire CRM formatting + domain helpers (2026-10-19), ported from the
   EDC CRM's format.ts. The M&A stage template becomes a SaaS sales
   pipeline; deal economics (EV, success fee) become subscription economics
   (monthly value from prices.ts, weighted by stage). Time helpers are
   unchanged: the workspace runs on Central time. */

import { PRICING_TIERS, type PricingTier } from "@/lib/stripe/prices";

/* ---------------- opportunity stages ----------------
   Every stage is a board column; "won" closes the deal on the board's last
   column and "lost" is terminal and lives off the board. An opportunity can
   override this list with crm_opportunities.custom_stages. */
export const TEMPLATE_STAGES = [
  "target",
  "contacted",
  "engaged",
  "discovery",
  "demo",
  "proposal",
  "negotiation",
  "won",
] as const;

export const STAGE_LABELS: Record<string, string> = {
  target: "Target",
  contacted: "Contacted",
  engaged: "Engaged",
  discovery: "Discovery call",
  demo: "Demo",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

export const STAGE_HINTS: Record<string, string> = {
  target: "Researched, not contacted yet",
  contacted: "First touch sent",
  engaged: "Replied or opened the demo",
  discovery: "Call booked or held",
  demo: "Walked through the product",
  proposal: "Plan and price sent",
  negotiation: "Working out terms",
  won: "Subscribed",
};

export function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

export function effectiveStages(custom: string[] | null | undefined): string[] {
  return custom && custom.length > 0 ? custom : [...TEMPLATE_STAGES];
}

export const LOST_REASONS: Record<string, string> = {
  no_response: "No response",
  no_budget: "No budget",
  timing: "Bad timing",
  chose_competitor: "Chose a competitor",
  staying_with_agency: "Staying with an agency",
  staying_with_current_tool: "Staying with current tool",
  not_a_fit: "Not a fit",
  went_dark: "Went dark",
  other: "Other",
};

export const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  target: "Target",
  contacted: "Contacted",
  engaged: "Engaged",
  customer: "Customer",
  churned: "Churned",
  disqualified: "Disqualified",
};

export const SOURCE_LABELS: Record<string, string> = {
  research: "Research",
  website: "Website",
  demo: "Live demo",
  referral: "Referral",
  warm_intro: "Warm intro",
  outbound: "Outbound",
  inbound: "Inbound",
  conference: "Conference",
  other: "Other",
};

export const CONTACT_ROLE_LABELS: Record<string, string> = {
  decision_maker: "Decision maker",
  champion: "Champion",
  connector: "Connector",
  recruiter: "Recruiter",
  user: "User",
  other: "Contact",
};

export const EVENT_LABELS: Record<string, string> = {
  note: "Note",
  email: "Email",
  call: "Call",
  meeting: "Meeting",
  linkedin: "LinkedIn",
  stage_change: "Stage",
  field_change: "Update",
  demo_open: "Demo open",
  lead: "Lead",
  won: "Won",
  lost: "Lost",
  task_done: "Task",
  import: "Added",
};

/* Do not contact (CAN-SPAM opt-outs are honored permanently). */
export const DNC_REASONS: Record<string, string> = {
  replied_no: "Replied no thanks",
  unsubscribe_request: "Asked to be removed",
  bounced: "Email bounced",
  asked_elsewhere: "Pointed elsewhere, stop contacting",
  other: "Other",
};

export const BALL_LABELS: Record<string, string> = {
  us: "US",
  prospect: "PROSPECT",
  partner: "PARTNER",
};

/* ---------------- money ---------------- */

/* Missing values read "n/a": the copy rules forbid em dashes, and that
   includes placeholders in empty cells. */
export function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "n/a";
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 10_000) return `$${Math.round(v / 1000)}K`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}

export const PLAN_LABELS: Record<string, string> = {
  solo: "Solo",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
};

/* List price per month for a plan + billing choice, from prices.ts (the
   single source of truth; never retyped here). */
export function planMonthly(tier: string | null | undefined, billing: string | null | undefined): number | null {
  if (!tier || !(tier in PRICING_TIERS)) return null;
  const t = PRICING_TIERS[tier as PricingTier];
  return billing === "annual" ? t.annualMonthlyEquivalent : t.monthlyPrice;
}

/* An opportunity's monthly value: the explicit MRR when set, else its
   plan's list price. */
export function oppMrr(o: { mrr?: number | string | null; plan_tier?: string | null; billing?: string | null }): number {
  const explicit = o.mrr === null || o.mrr === undefined || o.mrr === "" ? NaN : Number(o.mrr);
  if (Number.isFinite(explicit)) return explicit;
  return planMonthly(o.plan_tier, o.billing) ?? 0;
}

/* Suggested plan from a group's location count (mirrors the pricing pages:
   Solo 2–5 locations, Enterprise from 35). */
export function suggestPlan(locations: number | null | undefined): PricingTier | null {
  if (!locations || locations < 1) return null;
  if (locations <= 5) return "solo";
  if (locations <= 20) return "growth";
  if (locations <= 34) return "scale";
  return "enterprise";
}

/* ---------------- indicative stage weights ----------------
   Assumptions, not a forecast: roughly how likely an opportunity at each
   stage is to close. Overridable in Settings; every surface labels the
   result "indicative weights". */
export const DEFAULT_STAGE_WEIGHTS: Record<string, number> = {
  target: 0.02,
  contacted: 0.05,
  engaged: 0.12,
  discovery: 0.25,
  demo: 0.4,
  proposal: 0.6,
  negotiation: 0.8,
  won: 1,
  lost: 0,
};

export function stageWeight(
  stage: string,
  customStages?: string[] | null,
  overrides?: Record<string, number> | null,
): number {
  const o = overrides?.[stage];
  if (typeof o === "number" && Number.isFinite(o) && o >= 0 && o <= 1) return o;
  if (stage in DEFAULT_STAGE_WEIGHTS) return DEFAULT_STAGE_WEIGHTS[stage];
  const list = effectiveStages(customStages);
  const idx = list.indexOf(stage);
  if (idx < 0) return 0;
  return (idx + 1) / (list.length + 1);
}

/* Probability: the explicit close_probability when set, else the stage weight. */
export function oppProbability(
  o: { stage?: string | null; custom_stages?: string[] | null; close_probability?: number | null },
  overrides?: Record<string, number> | null,
): number {
  if (typeof o.close_probability === "number") return Math.max(0, Math.min(100, o.close_probability)) / 100;
  return stageWeight(String(o.stage ?? ""), o.custom_stages, overrides);
}

/* Annual contract value and its weighted share. */
export function oppAcv(o: Parameters<typeof oppMrr>[0]): number {
  return oppMrr(o) * 12;
}
export function weightedAcv(
  o: Parameters<typeof oppMrr>[0] & Parameters<typeof oppProbability>[0],
  overrides?: Record<string, number> | null,
): number {
  return oppAcv(o) * oppProbability(o, overrides);
}

export function parseStageWeights(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n <= 1) out[k] = n;
  }
  return out;
}

/* ---------------- dates: the workspace runs on Central time ---------------- */

export const CRM_TZ = "America/Chicago";

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "n/a";
  const bare = BARE_DATE.test(iso);
  const d = new Date(bare ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: bare ? "UTC" : CRM_TZ,
  });
}

export function nowMs(): number {
  return new Date().getTime();
}

export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CRM_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function isoPlusDays(iso: string, n: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function fmtToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: CRM_TZ,
  });
}

export function greeting(
  now: Date = new Date(),
): "Good morning" | "Good afternoon" | "Good evening" {
  const h = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: CRM_TZ, hour: "numeric", hourCycle: "h23" }).format(now),
  );
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function daysBetween(aIso: string, bIso: string): number {
  const norm = (s: string) => (BARE_DATE.test(s) ? `${s}T12:00:00Z` : s);
  const a = new Date(norm(aIso)).getTime();
  const b = new Date(norm(bIso)).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function relTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "n/a";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "n/a";
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)}d`;
  return fmtDate(iso);
}

/* ---------------- lead source ---------------- */

/* marketing_leads kinds the Inbox works. Newsletter and job-alert signups
   are audience lists, not sales leads, so they stay in /admin/leads. */
export const SALES_LEAD_KINDS = ["demo_request", "calculator", "contact"];

export const LEAD_KIND_LABELS: Record<string, string> = {
  demo_request: "Demo request",
  calculator: "Calculator",
  contact: "Contact form",
};

function hostOf(url: string): string | null {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/* Where an inquiry came from, as one readable bucket: the UTM source (plus
   campaign), else the referring site, else direct. */
export function channelOf(utm: unknown, referrer?: string | null): string {
  const u = utm && typeof utm === "object" ? (utm as Record<string, unknown>) : {};
  const src = typeof u.utm_source === "string" ? u.utm_source.trim() : "";
  if (src) {
    const camp = typeof u.utm_campaign === "string" ? u.utm_campaign.trim() : "";
    const label = src.length > 40 ? `${src.slice(0, 40)}…` : src;
    return camp ? `${label} · ${camp.slice(0, 40)}` : label;
  }
  const refRaw = referrer ?? (typeof u.referrer === "string" ? u.referrer : null);
  const ref = refRaw ? hostOf(refRaw) : null;
  if (ref) {
    if (/linkedin\.|lnkd\.in/.test(ref)) return "LinkedIn";
    if (/(^|\.)google\.|(^|\.)bing\.com$|duckduckgo\.com$|(^|\.)yahoo\.|ecosia\.org$|search\.brave\.com$/.test(ref))
      return `Search: ${ref}`;
    if (/(^|\.)(facebook|instagram|twitter|x|t)\.(com|co)$/.test(ref)) return `Social: ${ref}`;
    return `Referral: ${ref}`;
  }
  return "Direct or unknown";
}

/* ---------------- people ---------------- */

export function initialsOf(p: { email?: string | null; full_name?: string | null } | null | undefined): string | null {
  if (!p) return null;
  const n = (p.full_name ?? "").trim();
  if (n) return n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (p.email ?? "??").slice(0, 2).toUpperCase();
}

export function firstNameOf(p: { email?: string | null; full_name?: string | null } | null | undefined): string {
  if (!p) return "Someone";
  const n = (p.full_name ?? "").trim().split(/\s+/)[0];
  if (n) return n;
  const local = (p.email ?? "").split("@")[0].split(/[._-]/)[0];
  return local ? local[0].toUpperCase() + local.slice(1) : "Someone";
}

/* Demo ?for= key for an account name (must match src/lib/marketing/demo.ts
   forKey so demo opens land on the right account). */
export { forKey as demoKeyOf } from "@/lib/marketing/demo";
