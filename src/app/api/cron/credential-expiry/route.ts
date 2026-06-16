/**
 * /api/cron/credential-expiry — weekly credential-expiry digest (#9d).
 *
 * Schedule (vercel.json): Mondays 13:30 UTC (8:30am US Central), just after
 * the weekly hiring digest.
 *
 * For each active DSO, finds hired/active candidates whose licenses or certs
 * are EXPIRED or expiring within 30 days (urgent set) and emails each
 * owner/admin a CredentialExpiryDigest. Suppressed when a DSO has nothing
 * urgent — no empty-noise mail.
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}`. Reject without.
 *
 * Reuses getExpiringCredentials (service-role client here; the query is
 * explicitly DSO-scoped, so RLS isn't relied on).
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { getExpiringCredentials } from "@/lib/credentials/expiring-credentials";
import { isUrgentExpiry } from "@/lib/credentials/expiry";
import {
  CredentialExpiryDigest,
  type CredentialExpiryItem,
} from "@/emails/employer/CredentialExpiryDigest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

interface Report {
  dsos_evaluated: number;
  dsos_skipped_empty: number;
  emails_sent: number;
  emails_failed: number;
  errors: string[];
}

function expiryText(daysLeft: number): string {
  if (daysLeft < 0) {
    const ago = Math.abs(daysLeft);
    return `Expired ${ago} day${ago === 1 ? "" : "s"} ago`;
  }
  return daysLeft === 0
    ? "Expires today"
    : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRoleClient();
  const report: Report = {
    dsos_evaluated: 0,
    dsos_skipped_empty: 0,
    emails_sent: 0,
    emails_failed: 0,
    errors: [],
  };

  const { data: dsos } = await admin
    .from("dsos")
    .select("id, name")
    .is("deleted_at", null);

  for (const dso of (dsos ?? []) as Array<{ id: string; name: string }>) {
    report.dsos_evaluated += 1;
    try {
      // Pull the actionable set, then narrow to urgent (expired / <=30d).
      const rows = (await getExpiringCredentials(admin, dso.id, 100)).filter(
        (r) => isUrgentExpiry(r.expiryState)
      );
      if (rows.length === 0) {
        report.dsos_skipped_empty += 1;
        continue;
      }

      const items: CredentialExpiryItem[] = rows.map((r) => ({
        candidateName: r.candidateName,
        credentialLabel: r.credentialLabel,
        expiryText: expiryText(r.daysLeft),
        expired: r.expiryState === "expired",
        url: `${SITE_URL}/employer/applications/${r.applicationId}#hire-readiness`,
      }));

      const { data: members } = await admin
        .from("dso_users")
        .select("auth_user_id, full_name, role")
        .eq("dso_id", dso.id)
        .in("role", ["owner", "admin"]);

      for (const m of (members ?? []) as Array<{
        auth_user_id: string;
        full_name: string | null;
        role: string;
      }>) {
        try {
          const res = await admin.auth.admin.getUserById(m.auth_user_id);
          const email = res.data?.user?.email ?? null;
          if (!email) continue;
          const firstName = m.full_name?.trim().split(/\s+/)[0] ?? null;
          await sendEmail({
            to: email,
            subject: `${rows.length} credential${rows.length === 1 ? "" : "s"} need attention · ${dso.name}`,
            template: "employer.credential_expiry",
            relatedDsoId: dso.id,
            react: CredentialExpiryDigest({
              recipientFirstName: firstName ?? "there",
              dsoName: dso.name,
              items,
              dashboardUrl: `${SITE_URL}/employer/dashboard#credentials-expiring`,
            }),
          });
          report.emails_sent += 1;
        } catch (err) {
          report.emails_failed += 1;
          report.errors.push(
            `email-fail dso=${dso.id} user=${m.auth_user_id}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    } catch (err) {
      report.errors.push(
        `dso-fail ${dso.id}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return NextResponse.json(report);
}
