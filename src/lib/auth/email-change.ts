/**
 * Email-change OTP helpers (Phase 4.3.a).
 *
 * The flow is:
 *   1. Candidate enters a new email on /candidate/settings/account.
 *   2. Server action generates a 6-digit OTP, hashes it (SHA-256 hex),
 *      writes a `pending_email_changes` row with expires_at = now() + 15m.
 *   3. Server action sends the OTP to the NEW address (so a typo can't
 *      let the wrong person change to *their* address).
 *   4. Server action sends a "this wasn't me" notice to the OLD address
 *      with a signed revocation link that flips revoked_at on click.
 *   5. Candidate types the 6-digit code; server action looks up the
 *      latest unconsumed + unrevoked + unexpired row matching
 *      (candidate_user_id, hash(code)), marks consumed, then uses the
 *      service-role admin client to update auth.users.email atomically.
 *
 * The hash (not raw OTP) is what we persist so a database leak doesn't
 * expose codes. Revocation links are HMAC-signed with a secret so a
 * scraper can't enumerate row IDs to maliciously revoke pending changes.
 */

import { randomInt, createHash, createHmac, timingSafeEqual } from "crypto";

export const EMAIL_CHANGE_OTP_TTL_MIN = 15;

/** Generate a cryptographically random 6-digit OTP, e.g. "493201". */
export function generateEmailChangeOtp(): string {
  // randomInt is crypto-strong; uniform across [0, 1_000_000).
  const n = randomInt(0, 1_000_000);
  return n.toString().padStart(6, "0");
}

/** Stable hash for storage — compared at consumption time. */
export function hashEmailChangeOtp(code: string): string {
  return createHash("sha256")
    .update(code.trim().replace(/\s/g, ""))
    .digest("hex");
}

/* ──────────────────────────────────────────────────────────────
 * Revocation link signing
 *
 * The link the OLD email receives is `…/auth/email-change/revoke?id=<row>&sig=<hmac>`.
 * The handler validates the HMAC against EMAIL_CHANGE_REVOKE_SECRET (or
 * falls back to SUPABASE_SERVICE_ROLE_KEY if the dedicated secret isn't
 * set) before flipping revoked_at. Without HMAC, anyone with a row ID
 * could revoke arbitrary pending changes.
 * ─────────────────────────────────────────────────────────── */

function getRevokeSecret(): string {
  const dedicated = process.env.EMAIL_CHANGE_REVOKE_SECRET;
  if (dedicated && dedicated.length >= 32) return dedicated;
  // Fall back to the service-role key — already required by the email
  // sender + the admin client, and is itself a cryptographically strong
  // server-only secret. Acceptable for the size of this surface.
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!fallback) {
    throw new Error(
      "EMAIL_CHANGE_REVOKE_SECRET (or SUPABASE_SERVICE_ROLE_KEY) must be set."
    );
  }
  return fallback;
}

export function signRevokeToken(rowId: string): string {
  const hmac = createHmac("sha256", getRevokeSecret());
  hmac.update(rowId);
  return hmac.digest("hex");
}

export function verifyRevokeToken(rowId: string, token: string): boolean {
  const expected = signRevokeToken(rowId);
  // Both are hex strings of equal length; timingSafeEqual requires equal-len buffers.
  if (expected.length !== token.length) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"));
}
