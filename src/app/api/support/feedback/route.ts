/**
 * POST /api/support/feedback — Tier 2 Phase D thumbs up/down.
 *
 * User clicks 👍 or 👎 on one assistant message in their chat. We:
 *   1. Verify the message belongs to a conversation the user authored
 *   2. Insert a support_chat_feedback row
 *   3. Thumbs down → also flip support_requests.review_status to
 *      'flagged_bad' so Cam sees it in the admin queue
 *
 * Optional note captured on thumbs-down ("what didn't work").
 */

import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

interface FeedbackBody {
  message_id: string;
  rating: "up" | "down";
  note?: string;
}

export async function POST(request: Request) {
  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const messageId = String(body.message_id ?? "").trim();
  const rating = body.rating;
  const note = body.note ? String(body.note).slice(0, 1000) : null;

  if (!messageId) {
    return NextResponse.json(
      { ok: false, error: "Missing message_id." },
      { status: 400 }
    );
  }
  if (rating !== "up" && rating !== "down") {
    return NextResponse.json(
      { ok: false, error: "rating must be 'up' or 'down'." },
      { status: 400 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Please sign in." },
      { status: 401 }
    );
  }

  const admin = createSupabaseServiceRoleClient();

  // Verify the message belongs to a conversation the user authored.
  const { data: msg, error: msgErr } = await admin
    .from("support_chat_messages")
    .select("id, request_id, role")
    .eq("id", messageId)
    .maybeSingle();
  if (msgErr || !msg) {
    return NextResponse.json(
      { ok: false, error: "Message not found." },
      { status: 404 }
    );
  }
  const m = msg as { id: string; request_id: string; role: string };
  if (m.role !== "assistant") {
    return NextResponse.json(
      { ok: false, error: "Feedback is only valid on assistant messages." },
      { status: 400 }
    );
  }

  const { data: req } = await admin
    .from("support_requests")
    .select("id, auth_user_id")
    .eq("id", m.request_id)
    .maybeSingle();
  if (!req || (req as { auth_user_id: string }).auth_user_id !== user.id) {
    return NextResponse.json(
      { ok: false, error: "Conversation not yours." },
      { status: 403 }
    );
  }

  // Insert feedback row.
  const { error: insertErr } = await admin
    .from("support_chat_feedback")
    .insert({
      message_id: messageId,
      request_id: m.request_id,
      auth_user_id: user.id,
      rating,
      note,
    });

  if (insertErr) {
    console.error("[support/feedback] insert failed", insertErr);
    return NextResponse.json(
      { ok: false, error: "Couldn't save your feedback. Try again." },
      { status: 500 }
    );
  }

  // Thumbs down auto-flags the conversation for review.
  if (rating === "down") {
    await admin
      .from("support_requests")
      .update({
        review_status: "flagged_bad",
        auto_flag_reason: note
          ? `User gave thumbs-down: ${note.slice(0, 200)}`
          : "User gave thumbs-down",
      })
      .eq("id", m.request_id);
  }

  return NextResponse.json({ ok: true });
}
