/**
 * Kill-switch notifier — emails Cam when a per-DSO or global kill
 * switch trips so a frozen feature is never silent.
 *
 * Throttled by an in-memory flag PER PROCESS so we don't blast 50
 * emails when 50 concurrent requests all hit the kill switch in the
 * same minute. For multi-instance Vercel serverless this is imperfect
 * (each instance has its own flag) but reduces volume by 90%+. Long-
 * term: write a row to a dedicated kill_switch_alerts table with a
 * unique (date, scope) constraint so the alert is truly fire-once.
 *
 * Always fire-and-forget from caller — but AWAITED here so it
 * actually delivers (per the Vercel serverless gotcha rule).
 */

import { sendEmail } from "@/lib/email/send";

const RECENT_ALERTS: Map<string, number> = new Map();
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

interface AlertInput {
  scope: "per_dso" | "global";
  dsoId?: string | null;
  perDsoCents?: number;
  globalCents?: number;
  triggeringAuthUserId?: string;
}

export async function notifyKillSwitchTripped(input: AlertInput): Promise<void> {
  const key = input.scope === "per_dso" ? `dso:${input.dsoId ?? "unknown"}` : "global";
  const lastSent = RECENT_ALERTS.get(key);
  const now = Date.now();
  if (lastSent && now - lastSent < ALERT_COOLDOWN_MS) {
    return;
  }
  RECENT_ALERTS.set(key, now);

  const subject =
    input.scope === "global"
      ? `🚨 [URGENT] Global Claude support kill switch tripped — $${centsToDollars(input.globalCents ?? 0)} today`
      : `⚠ Per-DSO Claude kill switch tripped — DSO ${input.dsoId} — $${centsToDollars(input.perDsoCents ?? 0)} today`;

  const text = [
    subject,
    "",
    `Scope: ${input.scope}`,
    input.dsoId ? `DSO id: ${input.dsoId}` : "",
    input.perDsoCents !== undefined
      ? `Per-DSO spend today: $${centsToDollars(input.perDsoCents)}`
      : "",
    input.globalCents !== undefined
      ? `Global spend today: $${centsToDollars(input.globalCents)}`
      : "",
    input.triggeringAuthUserId
      ? `Triggered by user: ${input.triggeringAuthUserId}`
      : "",
    "",
    "AI support is now frozen for the affected scope until the day resets at 00:00 UTC (or manually unfrozen).",
    "",
    "Investigate via the claude_usage_log table — sort by cost_cents DESC to find the heaviest hitters.",
  ]
    .filter(Boolean)
    .join("\n");

  await sendEmail({
    to: "cam@dsohire.com",
    subject,
    template: "support.kill_switch_alert",
    text,
    relatedDsoId: input.dsoId ?? null,
  });
}

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}
