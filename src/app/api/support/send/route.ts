/**
 * POST /api/support/send — Tier 1 in-app support contact form endpoint.
 *
 * Why a route handler instead of a server action: the SupportDrawer is
 * a fully client-side component that we want mountable in any layout
 * (employer + candidate shells, future global "?" button). A POST to a
 * dedicated route is easier to reason about than threading a server
 * action through every shell.
 *
 * Flow:
 *   1. Parse + validate body (message + optional page url/title)
 *   2. Resolve auth user
 *   3. Look up DSO membership + role (NULL for candidates) + tier
 *   4. Pull the last 5 audit_events for context
 *   5. Insert support_requests row
 *   6. Send a structured email to support@dsohire.com via Resend
 *   7. Return {ok, requestId} so the drawer can show "we got it" state
 *
 * Errors are returned as JSON with a friendly message; the drawer
 * surfaces them inline. Never throws (network errors caught client-side).
 */

import { NextResponse } from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { getActiveSubscription } from "@/lib/billing/subscription";
import { sendEmail } from "@/lib/email/send";
import { SupportRequest } from "@/emails/SupportRequest";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
const SUPPORT_INBOX = "support@dsohire.com";

interface SubmitBody {
  body: string;
  page_url?: string;
  page_title?: string;
}

export async function POST(request: Request) {
  let parsed: SubmitBody;
  try {
    parsed = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request body." },
      { status: 400 }
    );
  }

  const body = String(parsed.body ?? "").trim();
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "Please add a message before sending." },
      { status: 400 }
    );
  }
  if (body.length > 5000) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Message is too long (max 5000 characters). Email support@dsohire.com directly for longer issues.",
      },
      { status: 400 }
    );
  }
  const pageUrl = parsed.page_url ? String(parsed.page_url).slice(0, 500) : null;
  const pageTitle = parsed.page_title
    ? String(parsed.page_title).slice(0, 240)
    : null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Please sign in first, or email support@dsohire.com directly.",
      },
      { status: 401 }
    );
  }

  // Resolve DSO membership (NULL for candidates).
  const { data: dsoUser } = await supabase
    .from("dso_users")
    .select("id, dso_id, role, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let dsoId: string | null = null;
  let dsoUserId: string | null = null;
  let role: string | null = null;
  let dsoName: string | null = null;
  let memberName: string | null = null;
  let tierSnapshot: string | null = null;

  if (dsoUser) {
    dsoId = (dsoUser as { dso_id: string }).dso_id;
    dsoUserId = (dsoUser as { id: string }).id;
    role = (dsoUser as { role: string }).role;
    memberName = (dsoUser as { full_name: string | null }).full_name;

    const sub = await getActiveSubscription(supabase, dsoId);
    tierSnapshot = sub?.tier ?? "no_subscription";

    const { data: dsoRow } = await supabase
      .from("dsos")
      .select("name")
      .eq("id", dsoId)
      .maybeSingle();
    dsoName = (dsoRow?.name as string | undefined) ?? null;
  }

  // Recent activity — last 5 audit events for THIS user (best-effort).
  const admin = createSupabaseServiceRoleClient();
  const { data: recentEvents } = await admin
    .from("audit_events")
    .select("event_kind, summary, created_at")
    .eq("actor_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // Insert the support_requests row via service-role so the audit trail
  // is coherent regardless of which RLS scope the user falls under.
  const { data: insertedRow, error: insertErr } = await admin
    .from("support_requests")
    .insert({
      dso_id: dsoId,
      dso_user_id: dsoUserId,
      auth_user_id: user.id,
      body,
      page_url: pageUrl,
      page_title: pageTitle,
      tier_snapshot: tierSnapshot,
    })
    .select("id, created_at")
    .single();

  if (insertErr || !insertedRow) {
    console.error("[support/send] insert failed", insertErr);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Couldn't save your request. Email support@dsohire.com and we'll pick it up directly.",
      },
      { status: 500 }
    );
  }

  // Fire-and-forget email to the support inbox. Failures here are
  // logged but don't fail the API call — the row is saved either way
  // and Cam can see it in the support inbox later.
  const subject = dsoName
    ? `[Support] ${dsoName} (${tierSnapshot ?? "no sub"}) — ${truncate(body, 60)}`
    : `[Support] Candidate — ${truncate(body, 60)}`;

  void sendEmail({
    to: SUPPORT_INBOX,
    subject,
    template: "support.request_received",
    replyTo: user.email ?? undefined,
    react: SupportRequest({
      authorEmail: user.email ?? "(no email on file)",
      authorName: memberName ?? user.email ?? "Anonymous",
      dsoName: dsoName ?? "(no DSO — candidate or pre-onboarding)",
      role: role ?? "candidate",
      tier: tierSnapshot ?? "no_subscription",
      pageUrl: pageUrl ?? "(unknown)",
      pageTitle: pageTitle ?? null,
      body,
      recentEvents:
        (recentEvents as Array<{
          event_kind: string;
          summary: string;
          created_at: string;
        }> | null) ?? [],
      requestId: insertedRow.id as string,
      adminUrl: `${SITE_URL}/admin/support/${insertedRow.id}`,
    }),
    relatedDsoId: dsoId,
  });

  return NextResponse.json({
    ok: true,
    requestId: insertedRow.id,
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}
