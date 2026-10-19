/* Compose-from-template helpers (2026-10-19). A plain module (no server or
   client marker): the template row shape, merge fields, the cold sequence,
   and the two outreach links in the exact formats the /admin/leads link
   builder produces. Shared by the compose panel, its server mount, its
   server action and the Settings templates card. Nothing here sends mail:
   the founder sends from his own mailbox by hand. */

export type TemplateRec = {
  id: string;
  key: string;
  name: string;
  channel: "email" | "linkedin";
  subject: string | null;
  body: string;
  next_step_days: number | null;
  next_step: string | null;
  sort: number;
  archived_at: string | null;
  updated_at?: string | null;
};

export const MERGE_FIELDS: [string, string][] = [
  ["{first_name}", "Recipient's first name, or \"there\" when unknown"],
  ["{group}", "The account name"],
  ["{demo_link}", "Personalized live demo link for the group"],
  ["{calc_link}", "Cost calculator pre-filled with their locations and open roles"],
  ["{signal}", "The account's hiring signal, else its growth signal"],
  ["{referrer}", "Who referred you (left blank to fill in by hand)"],
];

/* The cold email sequence, in send order. */
export const COLD_SEQUENCE = ["cold_first", "cold_follow_1", "cold_follow_2"] as const;

export const OPT_OUT_LINE = "Not the right person? Tell me who is, or reply \"no thanks\" and I won't follow up.";
export const LINKEDIN_LIMIT = 300;
/* Some mail apps cut mailto: bodies past roughly this many characters. */
export const MAILTO_SOFT_LIMIT = 1800;
export const SIGNAL_MARK = "[Add one specific, true observation about";

export function isCold(key: string): boolean {
  return key.startsWith("cold_");
}

export function signalPlaceholder(group: string): string {
  return `${SIGNAL_MARK} ${group} before sending]`;
}

/* Same formula as the link builder: hires about 1.5x locations rounded to
   5, listings about their open roles. Unknown sizes use the builder's
   defaults (12 locations, 10 open roles). */
export function calcLinkFor(locations: number | null, openRoles: number | null): string {
  const loc = Math.min(300, Math.max(2, Math.round(locations ?? 12) || 2));
  const hires = Math.min(600, Math.max(5, Math.round((loc * 1.5) / 5) * 5 || 5));
  const lst = Math.min(150, Math.max(0, Math.round(openRoles ?? 10) || 0));
  return `https://dsohire.com/for-dental-groups?loc=${loc}&hires=${hires}&ag=30&fee=25000&lst=${lst}&cpl=350#calculator`;
}

const HONORIFIC = /^(dr|mr|mrs|ms|mx|prof)\.?$/i;

/* First name from a contact's full name, skipping a leading honorific. */
export function firstNameFrom(name: string | null | undefined): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && HONORIFIC.test(parts[0])) parts.shift();
  const first = parts[0] ?? "";
  return first && !HONORIFIC.test(first) ? first : "there";
}

export type MergeVars = {
  first_name: string;
  group: string;
  demo_link: string;
  calc_link: string;
  signal: string;
  referrer: string;
};

export function mergeText(text: string, vars: MergeVars): string {
  return text.replace(/\{(first_name|group|demo_link|calc_link|signal|referrer)\}/g, (_, k: keyof MergeVars) => vars[k]);
}

export type Footer = { signature: string; mailingAddress: string };

/* The full draft for one template: merged subject and body, plus the
   signature on email, and the opt-out line and mailing address on cold
   email. LinkedIn notes go out bare. */
export function draftFor(tpl: TemplateRec, vars: MergeVars, footer: Footer): { subject: string; body: string } {
  const subject = tpl.subject ? mergeText(tpl.subject, vars) : "";
  let body = mergeText(tpl.body, vars).trim();
  if (tpl.channel === "email") {
    const sig = footer.signature.trim();
    if (sig) body += `\n\n${sig}`;
    if (isCold(tpl.key)) {
      body += `\n\n${OPT_OUT_LINE}`;
      const addr = footer.mailingAddress.trim();
      if (addr) body += `\n${addr}`;
    }
  }
  return { subject, body };
}

/* The next cold template not yet logged for this account, or null when
   none was sent yet (or the whole sequence is done). */
export function nextColdKey(sent: Set<string>): string | null {
  if (!COLD_SEQUENCE.some((k) => sent.has(k))) return null;
  return COLD_SEQUENCE.find((k) => !sent.has(k)) ?? null;
}

/* mailto: with RFC 6068 CRLF line breaks. */
export function mailtoHref(to: string | null, subject: string, body: string): string {
  const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));
  const params = [subject ? `subject=${enc(subject)}` : "", body ? `body=${enc(body)}` : ""].filter(Boolean).join("&");
  return `mailto:${to ? encodeURIComponent(to).replace(/%40/g, "@") : ""}${params ? `?${params}` : ""}`;
}
