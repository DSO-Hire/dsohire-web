/**
 * "View as" read-only impersonation — signed cookie (Tranche 1, Phase 4.1).
 *
 * Mirrors the unsubscribe-token HMAC pattern: payload is SIGNED (not encrypted)
 * — it holds no secrets, only ids + a timestamp. Pure node:crypto, NO
 * next/headers import, so call sites (server actions, layouts, route handlers)
 * can use it; the edge proxy presence-checks the cookie by name only and never
 * imports this module.
 *
 * Format: base64url(payloadJson) + "." + base64url(hmacSha256(payloadJson)).
 * Security: HMAC-verified (timingSafeEqual) AND TTL-checked (≤30 min) on every
 * read — a forged or stale cookie verifies as null (fail-closed). The cookie is
 * set httpOnly/Secure/SameSite=Strict by the issuing action.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Cookie name. Kept in sync with the literal in src/proxy.ts (which must not
 * import this node:crypto module into the edge runtime). */
export const IMPERSONATION_COOKIE = "dsohire_view_as";

/** Max lifetime of an impersonation session. */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;
export const IMPERSONATION_TTL_SECONDS = IMPERSONATION_TTL_MS / 1000;

export type ImpersonationTargetType = "candidate" | "dso";

export interface Impersonation {
  adminUserId: string;
  targetType: ImpersonationTargetType;
  targetId: string;
  startedAt: number; // epoch ms
}

interface Payload {
  a: string; // admin auth user id
  tt: ImpersonationTargetType;
  ti: string; // target id
  s: number; // started_at (ms)
  v: 1;
}

function getSecret(): string | null {
  return (
    process.env.IMPERSONATION_COOKIE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    null
  );
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}
function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payloadB64).digest());
}

/** Build a signed cookie value. `startedAt` defaults to now. Null if no secret. */
export function signImpersonation(
  imp: Omit<Impersonation, "startedAt"> & { startedAt?: number },
): string | null {
  const secret = getSecret();
  if (!secret) return null;
  const payload: Payload = {
    a: imp.adminUserId,
    tt: imp.targetType,
    ti: imp.targetId,
    s: imp.startedAt ?? Date.now(),
    v: 1,
  };
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Verify HMAC + TTL. Returns the impersonation or null (fail-closed). */
export function verifyImpersonationToken(
  token: string | null | undefined,
): Impersonation | null {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  const a = Buffer.from(sigB64);
  const b = Buffer.from(sign(payloadB64, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const p = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
    if (
      !p ||
      typeof p.a !== "string" ||
      (p.tt !== "candidate" && p.tt !== "dso") ||
      typeof p.ti !== "string" ||
      typeof p.s !== "number" ||
      p.v !== 1
    ) {
      return null;
    }
    // TTL — stale cookie is treated as absent.
    if (Date.now() - p.s > IMPERSONATION_TTL_MS) return null;
    return { adminUserId: p.a, targetType: p.tt, targetId: p.ti, startedAt: p.s };
  } catch {
    return null;
  }
}
