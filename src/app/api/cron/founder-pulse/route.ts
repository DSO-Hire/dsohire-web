/**
 * /api/cron/founder-pulse — Vantage founder digest (build spec §7 / Phase 4).
 *
 * Schedule (vercel.json): Monday 14:00 UTC = 9am US Central, after the customer
 * weekly-digest + credential-expiry crons.
 *
 * Emails the FounderPulse summary to the superadmin allowlist ONLY (founder-only
 * — this is Cam's business data, never a customer surface). Aggregate +
 * contentless: traffic, top channels, sign-ups, paid, and WoW movement.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`. Reject anything
 * without it — same pattern as the other crons.
 *
 * Optional daily cadence: if ANALYTICS_DAILY_PULSE=on, a separately-scheduled
 * hit with `?cadence=daily` renders the leaner daily-pulse copy. (Add a daily
 * vercel.json entry to use it; the weekly entry needs no flag.)
 */

import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/send";
import { ADMIN_EMAILS } from "@/lib/admin/gate";
import { FounderPulse } from "@/emails/admin/FounderPulse";
import {
  loadVantageWeeklyCompare,
  loadVantageChannels,
} from "@/lib/analytics/vantage-dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

function weekRangeLabel(): string {
  const end = new Date();
  const start = new Date(end.getTime() - 7 * 86400 * 1000);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const cadence =
    url.searchParams.get("cadence") === "daily" &&
    process.env.ANALYTICS_DAILY_PULSE === "on"
      ? "daily"
      : "weekly";

  const [compare, channels] = await Promise.all([
    loadVantageWeeklyCompare(),
    loadVantageChannels(7),
  ]);

  const tw = compare.this_week;
  const pw = compare.prev_week;

  const report = { cadence, emails_sent: 0, emails_failed: 0, errors: [] as string[] };

  for (const email of ADMIN_EMAILS) {
    try {
      const res = await sendEmail({
        to: email,
        subject:
          cadence === "daily"
            ? "Vantage · daily pulse"
            : `Vantage · weekly pulse (${weekRangeLabel()})`,
        template: "admin.founder_pulse",
        react: FounderPulse({
          rangeLabel: weekRangeLabel(),
          cadence,
          visitors: tw.visitors,
          visitorsPrev: pw.visitors,
          pageviews: tw.pageviews,
          employerSignups: tw.employer_signups,
          candidateSignups: tw.candidate_signups,
          paid: tw.paid,
          topChannels: channels
            .slice(0, 6)
            .map((c) => ({ channel: c.channel, visitors: c.visitors })),
          dashboardUrl: `${SITE_URL}/admin/analytics`,
        }),
      });
      if (res.ok) report.emails_sent += 1;
      else {
        report.emails_failed += 1;
        report.errors.push(`${email}: ${res.error ?? "send failed"}`);
      }
    } catch (err) {
      report.emails_failed += 1;
      report.errors.push(
        `${email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return NextResponse.json(report);
}
