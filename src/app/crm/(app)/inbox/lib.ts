/* Inbox helpers (2026-10-19), ported from the EDC CRM's sellers/lib.ts
   triage section. Not a "use server" module: constants and pure helpers
   shared by the inbox page and its actions. */

export type Lead = {
  id: string;
  created_at: string;
  kind: string;
  contact: string;
  contact_type: string;
  name: string | null;
  company: string | null;
  audience: string | null;
  context: Record<string, unknown> | null;
  source_path: string | null;
  referrer: string | null;
  utm: Record<string, unknown> | null;
  status: string;
};

export type Triage = {
  lead_id: string;
  status: string;
  owner_id: string | null;
  disqualify_reason: string | null;
  account_id: string | null;
  first_contacted_at: string | null;
  status_changed_at: string | null;
};

export const LEAD_SELECT =
  "id, created_at, kind, contact, contact_type, name, company, audience, context, source_path, referrer, utm, status";

export const TRIAGE_SELECT =
  "lead_id, status, owner_id, disqualify_reason, account_id, first_contacted_at, status_changed_at";

export const TRIAGE: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  disqualified: "Disqualified",
  converted: "Converted",
};

export const TRIAGE_TONE: Record<string, string> = {
  new: "navy",
  contacted: "warn",
  qualified: "good",
  disqualified: "",
  converted: "good",
};

/* Matches the crm_lead_triage.disqualify_reason check constraint. */
export const DQ_REASON: Record<string, string> = {
  spam: "Spam",
  candidate: "Job seeker",
  vendor: "Vendor or agency",
  duplicate: "Duplicate",
  not_a_fit: "Not a fit",
  test: "Test",
  other: "Other",
};

export const OPEN_TRIAGE = new Set(["new", "contacted", "qualified"]);
export const SETTABLE_TRIAGE = ["new", "contacted", "qualified", "disqualified"];

export const AUDIENCE_LABELS: Record<string, string> = {
  dso: "DSO",
  candidate: "Candidate",
};

/* ---------------- SLA ---------------- */

export const SLA_FIRST_TOUCH_H = 24;
export const STALE_DAYS = 7;

export function ageLabel(iso: string, now: number): string {
  const ms = Math.max(0, now - new Date(iso).getTime());
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m`;
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const rem = h % 24;
  return rem ? `${d}d ${rem}h` : `${d}d`;
}

export function slaBadge(
  created_at: string,
  status: string,
  status_changed_at: string | null | undefined,
  now: number,
): { label: string; tone: string } | null {
  if (status === "new") {
    const h = (now - new Date(created_at).getTime()) / 3_600_000;
    if (h < SLA_FIRST_TOUCH_H) return { label: `DUE IN ${Math.max(1, Math.ceil(SLA_FIRST_TOUCH_H - h))}H`, tone: "navy" };
    if (h <= 72) return { label: `SLA MISSED · ${Math.floor(h)}H`, tone: "warn" };
    return { label: `SLA MISSED · ${Math.floor(h / 24)}D`, tone: "crit" };
  }
  if ((status === "contacted" || status === "qualified") && status_changed_at) {
    const d = Math.floor((now - new Date(status_changed_at).getTime()) / 86_400_000);
    if (d > STALE_DAYS) return { label: `STALE ${d}D`, tone: "warn" };
  }
  return null;
}

export function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/* ---------------- context ---------------- */

function num(v: unknown): number | null {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? n : null;
}

function usd(v: unknown): string | null {
  const n = num(v);
  return n === null ? null : `$${Math.round(n).toLocaleString("en-US")}`;
}

function str(v: unknown, max = 120): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/* One plain sentence for what the visitor was looking at when they raised
   their hand. Values are visitor-entered and labeled as such. */
export function contextSentence(kind: string, ctx: Record<string, unknown> | null): string | null {
  if (!ctx) return null;
  if (kind === "calculator") {
    const parts = [
      num(ctx.locations) !== null ? `${num(ctx.locations)} locations` : null,
      num(ctx.hires_per_year) !== null ? `${num(ctx.hires_per_year)} hires a year` : null,
      num(ctx.agency_pct) !== null ? `${num(ctx.agency_pct)}% through agencies` : null,
      usd(ctx.avg_placement_fee) ? `${usd(ctx.avg_placement_fee)} average agency fee` : null,
      usd(ctx.spend_today) ? `${usd(ctx.spend_today)} a year today` : null,
      str(ctx.recommended_tier) ? `suggested plan ${str(ctx.recommended_tier)}` : null,
      usd(ctx.est_annual_difference) ? `${usd(ctx.est_annual_difference)} estimated annual difference` : null,
    ].filter(Boolean);
    return parts.length ? `Calculator inputs (visitor-entered): ${parts.join(", ")}.` : null;
  }
  if (kind === "demo_request") {
    const trig =
      ctx.trigger === "blocked_action"
        ? "tried a real action in the demo"
        : ctx.trigger === "demo_2min"
          ? "asked after a couple of minutes in the demo"
          : str(ctx.trigger);
    const parts = [
      str(ctx.for) ? `demo link for ${str(ctx.for)}` : null,
      trig,
      str(ctx.screen) ? `last screen ${str(ctx.screen)}` : str(ctx.page) ? `on ${str(ctx.page)}` : null,
      num(ctx.blocked_actions) ? `${num(ctx.blocked_actions)} blocked actions` : null,
    ].filter(Boolean);
    return parts.length ? `Demo context: ${parts.join(", ")}.` : null;
  }
  if (kind === "contact") {
    const parts = [
      str(ctx.topic) ? `topic ${str(ctx.topic)}` : null,
      str(ctx.practices) ? `${str(ctx.practices)} practices` : null,
      str(ctx.subject) ? `subject "${str(ctx.subject, 200)}"` : null,
    ].filter(Boolean);
    return parts.length ? `Contact form: ${parts.join(", ")}.` : null;
  }
  return null;
}

export function leadMessage(ctx: Record<string, unknown> | null): string | null {
  return ctx ? str(ctx.message, 5000) : null;
}

/* The demo ?for= label a demo request came from, if any. */
export function leadDemoFor(ctx: Record<string, unknown> | null): string | null {
  return ctx ? str(ctx.for, 60) : null;
}

/* Calculator location count, inside the crm_accounts.locations range. */
export function leadLocations(ctx: Record<string, unknown> | null): number | null {
  const n = ctx ? num(ctx.locations) : null;
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 5000 ? n : null;
}

export function leadEmail(l: Pick<Lead, "contact" | "contact_type">): string | null {
  return l.contact_type === "email" ? l.contact.trim().toLowerCase() : null;
}

export function leadPhone(l: Pick<Lead, "contact" | "contact_type">): string | null {
  return l.contact_type === "phone" ? l.contact.trim() : null;
}

export function leadWho(l: Pick<Lead, "company" | "name" | "contact">): string {
  return l.company || l.name || l.contact;
}

/* An ilike pattern that matches the literal text only. */
export function ilikeExact(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* Keep the inbox filters the user was looking at across a form post. */
export function safeReturnQs(raw: unknown): string {
  const qs = String(raw ?? "");
  return /^[a-zA-Z0-9_=&%.+-]{0,300}$/.test(qs) ? qs : "";
}
