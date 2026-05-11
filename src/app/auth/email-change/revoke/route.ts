/**
 * /auth/email-change/revoke — handler for the OLD-email "this wasn't me" link.
 *
 * Receives `?id=<row>&sig=<hmac>`. Validates the HMAC, then flips
 * revoked_at on the matching pending_email_changes row. Anyone with a
 * row id alone can't revoke — the HMAC is signed with a server-only
 * secret (see src/lib/auth/email-change.ts).
 *
 * Renders a minimal success/error HTML response — this link is opened
 * from the recipient's email client, often before they're signed in,
 * so we can't redirect them into the app.
 */

import { NextResponse } from "next/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { verifyRevokeToken } from "@/lib/auth/email-change";

// Auth-flow-style routes never want static rendering.
export const dynamic = "force-dynamic";

function htmlPage(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · DSO Hire</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #F7F4ED; color: #14233F; margin: 0; padding: 60px 20px; }
    main { max-width: 480px; margin: 0 auto; background: white; border: 1px solid rgba(20,35,63,0.1); padding: 40px; }
    h1 { font-size: 24px; margin: 0 0 12px; }
    p  { color: #475569; line-height: 1.5; }
    .accent { color: #4D7A60; font-weight: 600; }
    a  { color: #14233F; font-weight: 600; }
  </style>
</head>
<body>
  <main>${body}</main>
</body>
</html>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const sig = url.searchParams.get("sig") ?? "";

  if (!id || !sig) {
    return htmlPage(
      "Invalid revocation link",
      `<h1>Invalid revocation link</h1>
       <p>This link is missing required parameters. If you didn't expect this email, you can safely ignore it.</p>`
    );
  }

  if (!verifyRevokeToken(id, sig)) {
    return htmlPage(
      "Invalid revocation link",
      `<h1>Invalid revocation link</h1>
       <p>The link's signature didn't validate. Either the link expired, was tampered with, or this isn't a real DSO Hire revocation link.</p>`
    );
  }

  // Use the service-role client — the candidate may not be signed in,
  // and the row's RLS would otherwise block this update for anonymous
  // requests. Service-role bypasses RLS, but we still scope by id.
  const admin = createSupabaseServiceRoleClient();
  const { data: row } = await admin
    .from("pending_email_changes")
    .select("id, consumed_at, revoked_at, expires_at")
    .eq("id", id)
    .maybeSingle();

  if (!row) {
    return htmlPage(
      "Request not found",
      `<h1>Request not found</h1>
       <p>That email-change request doesn't exist anymore. It may have already been processed or expired.</p>`
    );
  }

  const r = row as Record<string, unknown>;
  if (r.consumed_at) {
    return htmlPage(
      "Already finalized",
      `<h1>Too late to revoke</h1>
       <p>This email change was already finalized. If you didn't authorize it, sign in to your account and contact support immediately.</p>`
    );
  }
  if (r.revoked_at) {
    return htmlPage(
      "Already revoked",
      `<h1>Already revoked</h1>
       <p class="accent">This change request was already revoked. Your account email is unchanged.</p>`
    );
  }

  await admin
    .from("pending_email_changes")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  return htmlPage(
    "Revoked",
    `<h1>Revoked</h1>
     <p class="accent">The pending email change has been canceled. Your DSO Hire account email is unchanged.</p>
     <p>If you've never received an account-change email like this before, that's a good signal to update your password — <a href="https://www.dsohire.com/candidate/sign-in">sign in</a> and head to Settings → Account.</p>`
  );
}
