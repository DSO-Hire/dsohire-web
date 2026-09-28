/**
 * POST /api/demo-visits: the demo deployment reports each /demo open.
 *
 * Called server-to-server from demo.dsohire.com's /demo route (see
 * src/app/demo/route.ts), never from a browser. A labeled open (outbound
 * link with ?for=Bridgeway) upserts one row per prospect and bumps its
 * visit count; the first open, and any open after a 6h quiet period,
 * emails the lead-notify list: "Bridgeway just opened the live demo."
 * Anonymous opens insert one row each (demo traffic count).
 *
 * If DEMO_EVENTS_SECRET is set on prod, the call must carry it in
 * x-demo-events-secret (set the same value on the demo project).
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { leadNotifyList } from "@/lib/marketing/notify";
import { sanitizeForLabel, forKey } from "@/lib/marketing/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOTIFY_QUIET_MS = 6 * 60 * 60 * 1000;

function clip(v: unknown, n: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null;
}

export async function POST(request: Request) {
  const secret = process.env.DEMO_EVENTS_SECRET;
  if (secret && request.headers.get("x-demo-events-secret") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const label = sanitizeForLabel(typeof body.for === "string" ? body.for : null);
  const referrer = clip(body.referrer, 300);
  const userAgent = clip(body.userAgent, 300);
  const supabase = createSupabaseServiceRoleClient();
  const now = new Date();

  if (!label) {
    await supabase.from("demo_visits").insert({ referrer, user_agent: userAgent });
    return NextResponse.json({ ok: true });
  }

  const key = forKey(label);
  const { data: existing } = await supabase
    .from("demo_visits")
    .select("id, visits, last_notified_at")
    .eq("for_key", key)
    .maybeSingle();

  let visits = 1;
  let lastNotified: string | null = null;
  if (existing) {
    const row = existing as { id: string; visits: number; last_notified_at: string | null };
    visits = row.visits + 1;
    lastNotified = row.last_notified_at;
    await supabase
      .from("demo_visits")
      .update({ visits, last_seen_at: now.toISOString(), referrer: referrer ?? undefined, user_agent: userAgent ?? undefined })
      .eq("id", row.id);
  } else {
    const { error } = await supabase
      .from("demo_visits")
      .insert({ for_label: label, for_key: key, referrer, user_agent: userAgent });
    // Two opens racing on first visit: the loser just bumps the winner.
    if (error?.code === "23505") {
      return NextResponse.json({ ok: true });
    }
  }

  const quiet = !lastNotified || now.getTime() - new Date(lastNotified).getTime() > NOTIFY_QUIET_MS;
  if (quiet) {
    await supabase.from("demo_visits").update({ last_notified_at: now.toISOString() }).eq("for_key", key);
    try {
      await sendEmail({
        to: leadNotifyList(),
        subject: `[DSO Hire] ${label} just opened the live demo${visits > 1 ? ` (visit ${visits})` : ""}`,
        template: "internal.demo_visit",
        text: [
          visits > 1
            ? `${label} opened the live demo again (visit ${visits}).`
            : `${label} opened the live demo for the first time.`,
          "",
          "They're in the read-only employer app right now. A same-day follow-up lands while it's fresh.",
          "",
          "All demo opens: https://dsohire.com/admin/leads",
        ].join("\n"),
      });
    } catch (err) {
      console.error("[demo-visits] notify failed (visit is saved)", err);
    }
  }

  return NextResponse.json({ ok: true, visits });
}
