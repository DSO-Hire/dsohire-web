/**
 * Tokenized public-offer-response helpers (Track E completion).
 *
 * The candidate clicks a CTA in their offer email that drops them at
 * `/o/{token}` — public, no-auth, the token IS the authorization.
 *
 * Generation: 24 bytes from `crypto.randomBytes` → base64url-encoded
 * (32 chars, URL-safe, no padding). Matches the reference_requests
 * token shape so the security posture stays uniform across public
 * surfaces.
 *
 * Validation: server-side only. Token is opaque; the only way to
 * resolve it to an offer-send row is via service-role read.
 */

import { randomBytes } from "node:crypto";

/**
 * Generate a fresh offer-response token. 24 bytes of entropy →
 * 32 characters of base64url. The same shape `reference-actions.ts`
 * uses for /r/[token]. Don't change the length without updating the
 * 128-char ceiling on the page-route input.
 */
export function generateOfferResponseToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Best-effort syntactic sanity check on a string before it ever hits
 * the DB. Keeps obviously malformed input (long URL paths, query
 * strings, accidental concatenation) out of the cheap path. Real
 * validation is "does this token match a row?" — done by the page
 * route's service-role lookup.
 */
export function looksLikeOfferToken(token: string | null | undefined): boolean {
  if (!token) return false;
  if (typeof token !== "string") return false;
  if (token.length < 16 || token.length > 128) return false;
  // base64url alphabet: A-Z a-z 0-9 - _
  return /^[A-Za-z0-9_-]+$/.test(token);
}

/**
 * Build the candidate-facing offer URL from a token. Centralized so
 * the email template, the quick-reply pre-tokenized links, and any
 * future surface stay in sync if the public route slug ever changes.
 */
export function offerResponseUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dsohire.com";
  return `${base}/o/${token}`;
}

/**
 * Quick-reply pre-tokenized URLs. The candidate lands on `/o/{token}`
 * with the choice pre-selected; they still tap a confirm button on
 * the landing page so we capture an explicit, audited acknowledgement
 * (matches the DocuSign "email button is a deep-link, the actual
 * commit is in-app" pattern).
 */
export function offerQuickAcceptUrl(token: string): string {
  return `${offerResponseUrl(token)}?choice=accept`;
}

export function offerQuickDeclineUrl(token: string): string {
  return `${offerResponseUrl(token)}?choice=decline`;
}
