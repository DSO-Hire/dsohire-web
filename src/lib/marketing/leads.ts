/**
 * Marketing lead primitives (pure, shared by client + server).
 *
 * The capture pattern is borrowed from the EDC site's ToolHandoff: ask for
 * ONE field ("email or cell") at the moment a visitor has just seen a
 * result, and ship what they were looking at along with it, so the first
 * reply can open with their numbers instead of "how can we help?".
 *
 * Storage + notification live in `lead-actions.ts` ("use server"); this
 * module stays import-safe from client components and unit tests.
 */

export const LEAD_KINDS = [
  "demo_request",
  "calculator",
  "newsletter",
  "contact",
  "job_alert",
] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

export type ContactType = "email" | "phone";

export interface LeadAttribution {
  /** First page this visitor landed on this session. */
  landing?: string;
  /** External referrer at first touch (same-origin referrers dropped). */
  referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface LeadInput {
  kind: LeadKind;
  contact: string;
  name?: string;
  company?: string;
  audience?: "dso" | "candidate";
  /** Small JSON blob of what the visitor was looking at. */
  context?: Record<string, string | number | boolean | null>;
  /** Page the capture happened on. */
  sourcePath?: string;
  attribution?: LeadAttribution;
  /** Honeypot: real visitors never fill this. */
  website?: string;
  /** Caller sends its own richer notification (e.g. /contact). */
  skipNotify?: boolean;
}

export type LeadResult =
  | { ok: true; contactType: ContactType }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Decide whether a one-field entry is an email or a phone number.
 * Returns the normalized value, or null when it is neither.
 *
 * Phones: US-centric (our buyers are US dental groups). Accepts any common
 * formatting, requires 10 digits (or 11 with a leading 1), normalizes to
 * E.164-ish "+1XXXXXXXXXX" so the admin view can tap-to-call.
 */
export function classifyContact(
  raw: string
): { type: ContactType; value: string } | null {
  const v = raw.trim();
  if (!v || v.length > 320) return null;
  if (v.includes("@")) {
    return EMAIL_RE.test(v) ? { type: "email", value: v.toLowerCase() } : null;
  }
  // Only digits + phone punctuation allowed; anything else is not a phone.
  if (!/^[\d\s().+\-]+$/.test(v)) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length === 10) return { type: "phone", value: `+1${digits}` };
  if (digits.length === 11 && digits.startsWith("1")) {
    return { type: "phone", value: `+${digits}` };
  }
  return null;
}

/** Keep context/attribution blobs small and flat before they hit the DB. */
export function sanitizeRecord(
  rec: Record<string, unknown> | undefined,
  maxKeys = 24,
  maxLen = 500
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  if (!rec) return out;
  for (const [k, val] of Object.entries(rec).slice(0, maxKeys)) {
    const key = k.slice(0, 64);
    if (val === null || typeof val === "boolean") out[key] = val;
    else if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
    else if (typeof val === "string") out[key] = val.slice(0, maxLen);
  }
  return out;
}

/** Human label for admin + notification copy. */
export const LEAD_KIND_LABELS: Record<LeadKind, string> = {
  demo_request: "Demo request",
  calculator: "Agency-cost calculator",
  newsletter: "Dental Hiring Report signup",
  contact: "Contact form",
  job_alert: "Job alert signup",
};
