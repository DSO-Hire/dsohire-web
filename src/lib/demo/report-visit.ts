/**
 * Report a demo open to PROD (demo_visits + the "Group just opened the
 * demo" email for ?for= links). Server-only; called from the demo
 * deployment's /demo/engaged route once a real person interacts with the
 * demo. Capped at 1.5s and never throws.
 */
import { PROD_ORIGIN } from "@/lib/marketing/demo";

export async function reportDemoVisit(forLabel: string | null, referrer: string | null, userAgent: string | null) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    await fetch(`${PROD_ORIGIN}/api/demo-visits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.DEMO_EVENTS_SECRET ? { "x-demo-events-secret": process.env.DEMO_EVENTS_SECRET } : {}),
      },
      body: JSON.stringify({ for: forLabel, referrer, userAgent }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
  } catch (err) {
    console.error("[demo] visit report failed", (err as Error).message);
  }
}

/* Link scanners, unfurlers and headless browsers that load links without a
   person behind them. */
export const BOT_UA =
  /headless|bot\b|crawler|spider|preview|scanner|slurp|facebookexternalhit|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|skypeuripreview|proofpoint|mimecast|barracuda|safelinks|python-requests|curl\/|wget\//i;
