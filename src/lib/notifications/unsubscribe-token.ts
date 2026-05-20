/**
 * Signed unsubscribe tokens (Phase E8.14).
 *
 * A stateless, tamper-proof token that encodes the recipient (auth user id) and
 * the unsubscribe category. Embedded in List-Unsubscribe headers + visible
 * footer links so an out-of-session recipient can opt out with one click — no
 * login, no DB lookup, exactly what CAN-SPAM requires.
 *
 * Format:  base64url(payloadJson) + "." + base64url(hmacSha256(payloadJson))
 *   payloadJson = {"u": <userId>, "c": <categoryKey>, "v": 1}
 *
 * Properties:
 *   - No expiry. Unsubscribe links must keep working forever — a delivered
 *     email may be opened months later, and an expired opt-out link is a
 *     compliance failure.
 *   - HMAC-SHA256 with a server secret; payload is signed, not encrypted (it
 *     only contains an opaque user id + a public category key, no secrets).
 *   - Server-only. Never import from a "use client" module.
 *
 * Secret resolution: prefers a dedicated UNSUBSCRIBE_SECRET env var; falls back
 * to SUPABASE_SERVICE_ROLE_KEY so the feature works in production today without
 * a new env var. Adding UNSUBSCRIBE_SECRET (any long random string) to Vercel
 * is recommended so unsubscribe links survive a service-role key rotation.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

interface TokenPayload {
  /** auth.users.id of the recipient. */
  u: string;
  /** UnsubscribeCategory.key. */
  c: string;
  /** Schema version. */
  v: 1;
}

function getSecret(): string | null {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

/**
 * Build a signed unsubscribe token. Returns null only if no secret is
 * configured (in which case callers should omit the unsubscribe link rather
 * than ship a broken one).
 */
export function signUnsubscribeToken(
  userId: string,
  categoryKey: string
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload: TokenPayload = { u: userId, c: categoryKey, v: 1 };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/**
 * Verify + decode a token. Returns the recipient + category, or null if the
 * token is malformed, the signature doesn't match, or no secret is configured.
 */
export function verifyUnsubscribeToken(
  token: string | null | undefined
): { userId: string; categoryKey: string } | null {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const expected = sign(payloadB64, secret);
  // Constant-time compare; bail if lengths differ (timingSafeEqual throws).
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
    if (
      parsed &&
      typeof parsed.u === "string" &&
      typeof parsed.c === "string" &&
      parsed.v === 1
    ) {
      return { userId: parsed.u, categoryKey: parsed.c };
    }
    return null;
  } catch {
    return null;
  }
}
