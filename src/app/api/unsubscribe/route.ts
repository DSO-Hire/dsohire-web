/**
 * /api/unsubscribe — one-click unsubscribe endpoint (Phase E8.14).
 *
 * This is the URL placed in the `List-Unsubscribe` header of commercial mail,
 * paired with `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
 *
 *   POST  → the mail client's one-click unsubscribe. Verify the signed token,
 *           turn the category's email off, return 200. No body/redirect needed —
 *           the action completes server-side, exactly as RFC 8058 requires.
 *   GET   → some clients open the header URL in a browser. Apply the same
 *           opt-out, then 302 to the human-facing confirmation page.
 *
 * No auth session is required (and must not be) — the signed token is the
 * authorization. Writes go through the service-role client inside
 * applyCategoryUnsubscribe().
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe-token";
import { applyCategoryUnsubscribe } from "@/lib/notifications/unsubscribe";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";

export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) {
    return NextResponse.json({ ok: false, error: "Invalid link." }, { status: 400 });
  }
  const result = await applyCategoryUnsubscribe(decoded.userId, decoded.categoryKey);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Unsubscribe failed." },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) {
    return NextResponse.redirect(`${SITE_URL}/unsubscribe?status=invalid`);
  }
  await applyCategoryUnsubscribe(decoded.userId, decoded.categoryKey);
  // Hand off to the confirmation page (which re-verifies + shows resubscribe).
  return NextResponse.redirect(
    `${SITE_URL}/unsubscribe?token=${encodeURIComponent(token!)}&done=1`
  );
}
