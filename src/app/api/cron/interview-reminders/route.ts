/**
 * /api/cron/interview-reminders — every 30 min sweep (Phase 5A Day 3).
 *
 * Fires reminder emails for confirmed interviews:
 *   - 24h reminder: booking starts in [now, now+25h], not yet 24h-sent
 *   - 1h reminder:  booking starts in [now, now+90min], not yet 1h-sent
 *
 * Generous windows on the upper bound so a missed cron tick doesn't
 * silently skip a reminder — better to send slightly early than not
 * at all. Once sent, the timestamp column dedupes future runs.
 *
 * Vercel cron-auth: `Authorization: Bearer ${CRON_SECRET}` (same secret
 * as the existing crons). Reject anything without it.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { InterviewReminder } from "@/emails/InterviewReminder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

const KIND_LABELS: Record<string, string> = {
  phone: "Phone call",
  video: "Video call",
  in_person: "In-person",
  other: "Interview",
};

interface ReminderReport {
  bookings_evaluated: number;
  reminders_24h_sent: number;
  reminders_1h_sent: number;
  failures: number;
  errors: string[];
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceRoleClient();
  const report: ReminderReport = {
    bookings_evaluated: 0,
    reminders_24h_sent: 0,
    reminders_1h_sent: 0,
    failures: 0,
    errors: [],
  };

  const now = new Date();
  const in25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const in90min = new Date(now.getTime() + 90 * 60 * 1000);

  // Pull every booking whose start_at is within the broader (25h)
  // window AND that still has at least one unsent reminder. Filter
  // in-memory for which reminder window applies — keeps the SQL
  // simple and the dataset is small.
  const { data: bookings, error: bErr } = await admin
    .from("interview_bookings")
    .select(
      "id, proposal_id, selected_option_id, reminder_24h_sent_at, reminder_1h_sent_at, interview_proposal_options!inner(start_at), interview_proposals!inner(application_id, interview_kind, duration_minutes, location_text, status, applications!inner(candidates(full_name, auth_user_id), jobs(title, dso_id, dsos(name))))"
    )
    .gte("interview_proposal_options.start_at", now.toISOString())
    .lte("interview_proposal_options.start_at", in25h.toISOString())
    .or(
      "reminder_24h_sent_at.is.null,reminder_1h_sent_at.is.null"
    );

  if (bErr) {
    return NextResponse.json(
      {
        error: "query failed",
        details: bErr.message,
      },
      { status: 500 }
    );
  }

  for (const row of (bookings ?? []) as unknown as Array<{
    id: string;
    reminder_24h_sent_at: string | null;
    reminder_1h_sent_at: string | null;
    interview_proposal_options: Array<{ start_at: string }>;
    interview_proposals: Array<{
      application_id: string;
      interview_kind: string;
      duration_minutes: number;
      location_text: string | null;
      status: string;
      applications: Array<{
        candidates: Array<{
          full_name: string | null;
          auth_user_id: string | null;
        }>;
        jobs: Array<{
          title: string;
          dso_id: string;
          dsos: Array<{ name: string }>;
        }>;
      }>;
    }>;
  }>) {
    report.bookings_evaluated += 1;

    const proposal = row.interview_proposals?.[0];
    const option = row.interview_proposal_options?.[0];
    if (!proposal || !option) continue;
    if (proposal.status !== "booked") continue;

    const startAtMs = new Date(option.start_at).getTime();
    const msUntil = startAtMs - now.getTime();
    const window24h = !row.reminder_24h_sent_at && msUntil > 0 && msUntil <= 25 * 60 * 60 * 1000;
    const window1h = !row.reminder_1h_sent_at && msUntil > 0 && msUntil <= 90 * 60 * 1000;
    if (!window24h && !window1h) continue;

    // Send the more-imminent reminder when both windows are due (e.g.,
    // a freshly-booked interview that's 45 minutes away — we skip the
    // 24h reminder and only fire the 1h).
    const windowLabel: "tomorrow" | "in an hour" = window1h ? "in an hour" : "tomorrow";

    const app = proposal.applications?.[0];
    const job = app?.jobs?.[0];
    const candidate = app?.candidates?.[0];
    if (!app || !job || !candidate) continue;

    const dsoId = job.dso_id;
    const dsoName = job.dsos?.[0]?.name ?? "the practice";
    const kindLabel = KIND_LABELS[proposal.interview_kind] ?? "Interview";
    const detailUrlCandidate = `${SITE_URL}/candidate/applications/${proposal.application_id}`;
    const detailUrlEmployer = `${SITE_URL}/employer/applications/${proposal.application_id}`;

    void in90min;

    try {
      // Candidate reminder
      if (candidate.auth_user_id) {
        const r = await admin.auth.admin.getUserById(candidate.auth_user_id);
        const email = r.data?.user?.email ?? null;
        if (email) {
          await sendEmail({
            to: email,
            subject:
              windowLabel === "in an hour"
                ? `Interview in 1 hour · ${job.title}`
                : `Interview tomorrow · ${job.title}`,
            template: "shared.interview_reminder",
            relatedDsoId: dsoId,
            react: InterviewReminder({
              recipientName:
                candidate.full_name?.split(/\s+/)[0] ?? null,
              audience: "candidate",
              windowLabel,
              dsoName,
              jobTitle: job.title,
              startAtIso: option.start_at,
              durationMinutes: proposal.duration_minutes,
              kindLabel,
              locationText: proposal.location_text,
              detailUrl: detailUrlCandidate,
            }),
          });
        }
      }

      // Employer reminders — every owner/admin/recruiter/HM on the DSO
      const { data: members } = await admin
        .from("dso_users")
        .select("auth_user_id, full_name")
        .eq("dso_id", dsoId)
        .in("role", ["owner", "admin", "recruiter", "hiring_manager"]);
      for (const m of (members ?? []) as Array<{
        auth_user_id: string;
        full_name: string | null;
      }>) {
        try {
          const r = await admin.auth.admin.getUserById(m.auth_user_id);
          const email = r.data?.user?.email ?? null;
          if (!email) continue;
          await sendEmail({
            to: email,
            subject:
              windowLabel === "in an hour"
                ? `Interview in 1 hour · ${candidate.full_name ?? "candidate"} · ${job.title}`
                : `Interview tomorrow · ${candidate.full_name ?? "candidate"} · ${job.title}`,
            template: "shared.interview_reminder",
            relatedDsoId: dsoId,
            react: InterviewReminder({
              recipientName: m.full_name?.split(/\s+/)[0] ?? null,
              audience: "employer",
              windowLabel,
              dsoName,
              jobTitle: job.title,
              candidateName: candidate.full_name,
              startAtIso: option.start_at,
              durationMinutes: proposal.duration_minutes,
              kindLabel,
              locationText: proposal.location_text,
              detailUrl: detailUrlEmployer,
            }),
          });
        } catch (err) {
          console.warn("[interview-reminders] notify member failed", err);
        }
      }

      // Mark sent.
      const patch: Record<string, string> = {};
      if (window24h) {
        patch.reminder_24h_sent_at = now.toISOString();
        report.reminders_24h_sent += 1;
      }
      if (window1h) {
        patch.reminder_1h_sent_at = now.toISOString();
        report.reminders_1h_sent += 1;
      }
      await admin
        .from("interview_bookings")
        .update(patch)
        .eq("id", row.id);
    } catch (err) {
      report.failures += 1;
      report.errors.push(
        `booking ${row.id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return NextResponse.json(report);
}
