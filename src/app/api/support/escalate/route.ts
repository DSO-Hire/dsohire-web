/**
 * POST /api/support/escalate — Tier 2 chat → human handoff.
 *
 * User clicks "Escalate to a human" after a Claude conversation that
 * didn't fully solve their question. We:
 *   1. Verify the request belongs to the asking user
 *   2. Load the full conversation transcript from support_chat_messages
 *   3. Flip support_requests.status from 'new' → 'in_progress'
 *   4. Email Cam with the transcript + user context + recent activity
 *      pre-attached (reply-to user's email so direct reply lands there)
 *
 * Why a separate route: keeps the escalation logic separate from the
 * streaming chat endpoint, easier to reason about, and naturally rate-
 * limited (user clicks the button consciously).
 *
 * AWAITS the email send per the Vercel serverless gotcha rule —
 * fire-and-forget gets killed mid-flight.
 */

import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { sendEmail } from "@/lib/email/send";
import { SupportEscalation } from "@/emails/SupportEscalation";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const SUPPORT_INBOX = "support@dsohire.com";

interface EscalateBody {
  request_id: string;
}

export async function POST(request: Request) {
  let body: EscalateBody;
  try {
    body = (await request.json()) as EscalateBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const requestId = String(body.request_id ?? "").trim();
  if (!requestId) {
    return NextResponse.json(
      { ok: false, error: "Missing request_id." },
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

  // Verify the request belongs to this user (defense-in-depth — RLS
  // also blocks but we want a clear 403 instead of silent empty rows).
  const { data: req, error: reqErr } = await admin
    .from("support_requests")
    .select("id, dso_id, dso_user_id, auth_user_id, page_url, page_title, tier_snapshot, status")
    .eq("id", requestId)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (reqErr || !req) {
    return NextResponse.json(
      { ok: false, error: "Conversation not found or access denied." },
      { status: 404 }
    );
  }

  // Load the transcript.
  const { data: messages } = await admin
    .from("support_chat_messages")
    .select("role, content, created_at")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  const transcript = (
    messages as Array<{
      role: string;
      content: string | null;
      created_at: string;
    }> | null ?? []
  )
    .filter((m) => m.content && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content ?? "",
      created_at: m.created_at,
    }));

  // Pull DSO context for the email subject + escalation body.
  const r = req as { dso_id: string | null; tier_snapshot: string | null; page_url: string | null; page_title: string | null };
  let dsoName: string | null = null;
  if (r.dso_id) {
    const { data: dsoRow } = await admin
      .from("dsos")
      .select("name")
      .eq("id", r.dso_id)
      .maybeSingle();
    dsoName = (dsoRow?.name as string | undefined) ?? null;
  }

  // Resolve current tier (may have changed since the request was created;
  // surface both snapshot and current for transparency).
  let currentTier: string | null = r.tier_snapshot;
  if (r.dso_id) {
    const sub = await getActiveSubscription(supabase, r.dso_id);
    currentTier = sub?.tier ?? r.tier_snapshot;
  }

  // Recent activity (last 5 audit events for this user).
  const { data: recentEvents } = await admin
    .from("audit_events")
    .select("event_kind, summary, created_at")
    .eq("actor_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Get member name for the email.
  let memberName: string | null = null;
  if (r.dso_id) {
    const { data: dsoUser } = await admin
      .from("dso_users")
      .select("full_name")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    memberName = (dsoUser?.full_name as string | null | undefined) ?? null;
  }

  // Flip status.
  await admin
    .from("support_requests")
    .update({ status: "in_progress" })
    .eq("id", requestId);

  // Email Cam.
  const subject = dsoName
    ? `[Escalated] ${dsoName} (${currentTier ?? "no sub"}) — Claude chat handed off`
    : `[Escalated] Candidate — Claude chat handed off`;

  const emailResult = await sendEmail({
    to: SUPPORT_INBOX,
    subject,
    template: "support.escalated_from_chat",
    replyTo: user.email ?? undefined,
    react: SupportEscalation({
      authorEmail: user.email ?? "(no email on file)",
      authorName: memberName ?? user.email ?? "Anonymous",
      dsoName: dsoName ?? "(no DSO — candidate or pre-onboarding)",
      tier: currentTier ?? "no_subscription",
      pageUrl: r.page_url ?? "(unknown)",
      pageTitle: r.page_title ?? null,
      transcript,
      recentEvents:
        (recentEvents as Array<{
          event_kind: string;
          summary: string;
          created_at: string;
        }> | null) ?? [],
      requestId,
      adminUrl: `${SITE_URL}/admin/support/${requestId}`,
    }),
    relatedDsoId: r.dso_id,
  });

  if (!emailResult.ok) {
    console.error("[support/escalate] email failed", {
      requestId,
      error: emailResult.error,
    });
    return NextResponse.json({
      ok: true,
      warning:
        "Conversation saved but notification email didn't go through. We'll still see it in the queue — no action needed on your end.",
    });
  }

  return NextResponse.json({ ok: true });
}
