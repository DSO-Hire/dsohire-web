/**
 * Trust-this-device for MFA — signed 30-day HMAC cookie.
 *
 * Standard friction-killer pattern (Google, Microsoft, Stripe, GitHub,
 * Salesforce all do this). After a successful AAL2 challenge the user
 * can opt into trusting the current browser for 30 days; subsequent
 * dashboard hits skip the routine challenge prompt as long as the cookie
 * validates and still matches the user's current verified factor.
 *
 * Sensitive actions (data export, billing change, role change, password
 * change) MUST re-check via `userNeedsMfaChallenge()` regardless — the
 * trust cookie only suppresses the routine prompt, not the step-up gate.
 *
 * Cookie payload: { auth_user_id, factor_id, exp }
 *   - auth_user_id pins the cookie to the user (defense against
 *     account switching on a shared machine)
 *   - factor_id auto-invalidates when MFA is disabled or rotated
 *     (a deleted factor gets a new id on re-enroll → old cookie fails)
 *   - exp lets us roll cookies forward without per-device tracking
 *
 * No device-fingerprint or IP is included — fingerprinting is brittle
 * (mobile networks, ISP changes, user-agent updates), and the factor-id
 * pin already invalidates when the user disables MFA from any device.
 *
 * Signing key: MFA_TRUST_SECRET env var. Must be set in Vercel before
 * deploy or the trust path silently no-ops (returns null on read; never
 * sets on write). Generate with `openssl rand -base64 48`.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { cookies as nextCookies } from "next/headers";

type CookieStore = Awaited<ReturnType<typeof nextCookies>>;

export const MFA_TRUST_COOKIE = "dsohire_mfa_trust";
export const MFA_TRUST_DURATION_DAYS = 30;
const MFA_TRUST_DURATION_SECONDS = MFA_TRUST_DURATION_DAYS * 24 * 60 * 60;

interface TrustPayload {
  /** Supabase auth.users.id */
  uid: string;
  /** Verified TOTP factor id at signing time. Invalidates on rotation. */
  fid: string;
  /** Unix epoch seconds */
  exp: number;
}

function getSecret(): string | null {
  const s = process.env.MFA_TRUST_SECRET;
  return s && s.length >= 32 ? s : null;
}

function b64urlEncode(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = (4 - (input.length % 4)) % 4;
  const padded = (input + "=".repeat(pad))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

function signPayload(payload: TrustPayload, secret: string): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

function verifyToken(token: string, secret: string): TrustPayload | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let providedSig: Buffer;
  try {
    providedSig = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  const expectedSig = createHmac("sha256", secret).update(body).digest();
  if (
    providedSig.length !== expectedSig.length ||
    !timingSafeEqual(providedSig, expectedSig)
  ) {
    return null;
  }

  let payload: TrustPayload;
  try {
    const json = b64urlDecode(body).toString("utf8");
    payload = JSON.parse(json) as TrustPayload;
  } catch {
    return null;
  }

  if (
    typeof payload.uid !== "string" ||
    typeof payload.fid !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}

/**
 * Mint and set the trust cookie on the response. No-op when the env var
 * is missing (we'd rather not pretend to trust something we can't
 * cryptographically verify).
 */
export function setMfaTrustCookie(
  cookieStore: CookieStore,
  args: { authUserId: string; factorId: string }
): void {
  const secret = getSecret();
  if (!secret) {
    console.warn(
      "[mfa-trust] MFA_TRUST_SECRET not set — trust-this-device disabled."
    );
    return;
  }
  const payload: TrustPayload = {
    uid: args.authUserId,
    fid: args.factorId,
    exp: Math.floor(Date.now() / 1000) + MFA_TRUST_DURATION_SECONDS,
  };
  const token = signPayload(payload, secret);
  cookieStore.set(MFA_TRUST_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MFA_TRUST_DURATION_SECONDS,
  });
}

/**
 * Returns the validated payload iff the cookie is present, signed, not
 * expired, AND its factor_id matches the user's currently-verified
 * factor. Mismatched factor → null (the user disabled MFA and re-enrolled
 * since trust was set; old cookie no longer represents a real trust).
 */
export function readMfaTrustCookie(
  cookieStore: CookieStore,
  args: { authUserId: string; verifiedFactorId: string | null }
): TrustPayload | null {
  const secret = getSecret();
  if (!secret) return null;

  const raw = cookieStore.get(MFA_TRUST_COOKIE)?.value;
  if (!raw) return null;

  const payload = verifyToken(raw, secret);
  if (!payload) return null;
  if (payload.uid !== args.authUserId) return null;
  if (!args.verifiedFactorId) return null;
  if (payload.fid !== args.verifiedFactorId) return null;

  return payload;
}

/** Drop the trust cookie. Call when user disables MFA or signs out. */
export function clearMfaTrustCookie(cookieStore: CookieStore): void {
  cookieStore.set(MFA_TRUST_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
