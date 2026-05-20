/**
 * /api/resend/webhook — Resend delivery-event receiver (Phase E8.12).
 *
 * Resend signs webhooks with Svix. We verify the signature manually (no svix
 * dependency) and advance the matching email_log row as events arrive:
 *
 *   email.sent             → last_event only (row was already 'sent')
 *   email.delivered        → status='delivered', delivered_at
 *   email.delivery_delayed → last_event only
 *   email.bounced          → status='bounced',    bounced_at, bounce_kind
 *   email.complained       → status='complained', complained_at
 *   email.opened           → opened_at  (status untouched — don't downgrade)
 *   email.clicked          → clicked_at (status untouched)
 *
 * Rows are matched on resend_message_id = data.email_id (the id returned by
 * the send call). Writes go through the service-role client.
 *
 * Setup: add RESEND_WEBHOOK_SECRET (the "whsec_…" signing secret from the
 * Resend dashboard webhook config) to Vercel, and point the Resend webhook at
 * https://dsohire.com/api/resend/webhook. If the secret is unset we ack with
 * 200 and no-op (never process an unverifiable request).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

type EmailLogUpdate = Database["public"]["Tables"]["email_log"]["Update"];

interface ResendEvent {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    bounce?: { type?: string; subType?: string };
  };
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("[resend-webhook] RESEND_WEBHOOK_SECRET not set — ignoring event");
    return NextResponse.json({ ok: true, skipped: "unconfigured" });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ ok: false, error: "Missing signature headers." }, { status: 400 });
  }

  if (!verifySvix(secret, svixId, svixTimestamp, raw, svixSignature)) {
    return NextResponse.json({ ok: false, error: "Bad signature." }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(raw) as ResendEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const emailId = event.data?.email_id;
  if (!emailId) {
    // Nothing to correlate — ack so Resend doesn't retry.
    return NextResponse.json({ ok: true, skipped: "no_email_id" });
  }

  const eventAt = event.created_at ?? new Date().toISOString();
  const update: EmailLogUpdate = {
    last_event: event.type,
    last_event_at: eventAt,
  };

  switch (event.type) {
    case "email.delivered":
      update.status = "delivered";
      update.delivered_at = eventAt;
      break;
    case "email.bounced":
      update.status = "bounced";
      update.bounced_at = eventAt;
      if (event.data?.bounce?.type || event.data?.bounce?.subType) {
        update.bounce_kind =
          event.data.bounce.type ?? event.data.bounce.subType ?? "unknown";
      }
      break;
    case "email.complained":
      update.status = "complained";
      update.complained_at = eventAt;
      break;
    case "email.opened":
      update.opened_at = eventAt;
      break;
    case "email.clicked":
      update.clicked_at = eventAt;
      break;
    // email.sent / email.delivery_delayed / unknown → last_event only
    default:
      break;
  }

  try {
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin
      .from("email_log")
      .update(update)
      .eq("resend_message_id", emailId);
    if (error) {
      console.warn("[resend-webhook] email_log update error:", error.message);
    }
  } catch (err) {
    console.warn("[resend-webhook] update exception:", err);
  }

  // Always 200 once verified — a DB hiccup shouldn't trigger endless retries.
  return NextResponse.json({ ok: true });
}

/**
 * Svix signature verification (the scheme Resend uses).
 * signedContent = `${id}.${timestamp}.${body}`; expected = base64(HMAC-SHA256(
 * base64decode(secret without "whsec_" prefix), signedContent)). The header may
 * carry multiple space-separated `v1,<sig>` entries — any match passes.
 */
function verifySvix(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
  signatureHeader: string
): boolean {
  try {
    const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
    const signedContent = `${id}.${timestamp}.${body}`;
    const expected = createHmac("sha256", key).update(signedContent).digest("base64");
    const expectedBuf = Buffer.from(expected);

    for (const part of signatureHeader.split(" ")) {
      const comma = part.indexOf(",");
      const sig = comma === -1 ? part : part.slice(comma + 1);
      const sigBuf = Buffer.from(sig);
      if (sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
