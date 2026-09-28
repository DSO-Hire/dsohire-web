/**
 * Who gets pinged about marketing hand-raises (leads, named demo opens).
 * LEAD_NOTIFY_EMAILS (comma-separated, set in Vercel) when present, else
 * the inbox the /contact form has always used. The DB row is always the
 * record of truth; this is only the heads-up.
 */
export function leadNotifyList(): string[] {
  const list = (process.env.LEAD_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : ["cam@dsohire.com"];
}
