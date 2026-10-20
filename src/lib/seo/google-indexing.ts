/**
 * Google Indexing API: tells Google directly that a job page was published,
 * changed, or removed, so Google for Jobs picks it up in minutes instead of
 * waiting for a sitemap recrawl.
 *
 * Google only allows this API for pages carrying JobPosting (or
 * BroadcastEvent) structured data, so the ONLY caller should be the job
 * lifecycle sync in ./job-indexing.ts, which applies the same eligibility
 * rules as the JobPosting JSON-LD on /jobs/[id].
 *
 * Auth: a Google Cloud service account whose email is an Owner of the
 * dsohire.com property in Search Console. The full JSON key lives in the
 * GOOGLE_INDEXING_SA_JSON env var (Vercel Production only). We sign an RS256
 * JWT with node:crypto (no extra dependency), swap it for an OAuth access
 * token, and cache that token in memory until shortly before it expires.
 *
 * Gating: notifyGoogleJobUrl() is a no-op unless the env var is set AND
 * indexing is allowed (launched, not the demo site) AND this is not the demo
 * deployment AND VERCEL_ENV === "production". It never throws, and it never
 * logs the key or the access token.
 *
 * Quota: 200 publish requests per day by default. Callers send one request
 * per real lifecycle event; nothing here loops over jobs on page render.
 * Setup guide: docs/seo/google-indexing-api-setup.md
 */

import { createSign } from "node:crypto";
import { isIndexingAllowed } from "@/lib/launch/gate";
import { isDemoDeployment } from "@/lib/demo/mode";

export const GOOGLE_INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_INDEXING_PUBLISH_URL =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
export const GOOGLE_INDEXING_METADATA_URL =
  "https://indexing.googleapis.com/v3/urlNotifications/metadata";

/** Only URLs on this host are ever submitted. */
export const GOOGLE_INDEXING_HOST = "dsohire.com";

export type GoogleNotificationType = "URL_UPDATED" | "URL_DELETED";

export type GoogleIndexingResult =
  | { ok: true; type: GoogleNotificationType; url: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string; status?: number };

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKey: string;
}

/** What Google last recorded for a URL (from the metadata endpoint). */
export interface GoogleUrlMetadata {
  latestUpdateAt: string | null;
  latestRemoveAt: string | null;
}

/* ───── Gating ───── */

/** True only when a key is configured and this is the real production site. */
export function isGoogleIndexingEnabled(): boolean {
  const raw = process.env.GOOGLE_INDEXING_SA_JSON;
  if (!raw || raw.trim() === "") return false;
  return (
    process.env.VERCEL_ENV === "production" && isIndexingAllowed() && !isDemoDeployment()
  );
}

/* ───── Credentials + JWT (pure) ───── */

/** Parse the service-account JSON key. Returns null if unusable. */
export function parseServiceAccountJson(raw: string | undefined): ServiceAccountCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown; private_key?: unknown };
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
      return null;
    }
    // Keys pasted through some UIs arrive with literal "\n" sequences.
    const privateKey = parsed.private_key.includes("\\n")
      ? parsed.private_key.replace(/\\n/g, "\n")
      : parsed.private_key;
    return { clientEmail: parsed.client_email, privateKey };
  } catch {
    return null;
  }
}

export function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

export interface JwtClaims {
  iss: string;
  scope: string;
  aud: string;
  iat: number;
  exp: number;
}

/** Claims for the OAuth JWT-bearer grant. Tokens may live at most 1 hour. */
export function buildJwtClaims(clientEmail: string, nowSeconds: number): JwtClaims {
  return {
    iss: clientEmail,
    scope: GOOGLE_INDEXING_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
}

/** header.claims.signature, RS256 over the first two segments. */
export function signJwt(claims: JwtClaims, privateKeyPem: string): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem).toString("base64url");
  return `${signingInput}.${signature}`;
}

/** Same host rule as IndexNow: absolute https on dsohire.com only. */
export function isSubmittableUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === GOOGLE_INDEXING_HOST;
  } catch {
    return false;
  }
}

/* ───── Access token (cached per server instance) ───── */

let cachedToken: { token: string; expiresAtMs: number; clientEmail: string } | null = null;

/** Refresh this long before Google's stated expiry. */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

async function getAccessToken(creds: ServiceAccountCredentials): Promise<string> {
  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.clientEmail === creds.clientEmail &&
    cachedToken.expiresAtMs - TOKEN_REFRESH_MARGIN_MS > now
  ) {
    return cachedToken.token;
  }

  const assertion = signJwt(buildJwtClaims(creds.clientEmail, Math.floor(now / 1000)), creds.privateKey);
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`token exchange HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("token exchange returned no access_token");
  cachedToken = {
    token: json.access_token,
    expiresAtMs: now + (json.expires_in ?? 3600) * 1000,
    clientEmail: creds.clientEmail,
  };
  return json.access_token;
}

/** Test hook: forget the cached access token. */
export function resetGoogleIndexingTokenCache(): void {
  cachedToken = null;
}

/* ───── Per-instance duplicate guard ───── */

/**
 * A recruiter saving three sections of the same job in a minute should cost
 * one quota unit, not three. Same URL + same type inside this window is
 * skipped. Per server instance only, which is fine: it is a quota courtesy,
 * not a correctness rule.
 */
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;
const recentlySent = new Map<string, number>();

function recentlyNotified(url: string, type: GoogleNotificationType, now: number): boolean {
  const key = `${type} ${url}`;
  const at = recentlySent.get(key);
  if (at !== undefined && now - at < DEDUPE_WINDOW_MS) return true;
  if (recentlySent.size > 500) {
    for (const [k, t] of recentlySent) if (now - t >= DEDUPE_WINDOW_MS) recentlySent.delete(k);
  }
  return false;
}

/* ───── Public API ───── */

/**
 * Notify Google that a job URL was added/changed (URL_UPDATED) or removed
 * (URL_DELETED). Never throws.
 */
export async function notifyGoogleJobUrl(
  url: string,
  type: GoogleNotificationType,
): Promise<GoogleIndexingResult> {
  try {
    if (!isGoogleIndexingEnabled()) {
      return { ok: false, skipped: true, reason: "google indexing not enabled for this deployment" };
    }
    if (!isSubmittableUrl(url)) {
      return { ok: false, skipped: true, reason: "url not on dsohire.com" };
    }
    const now = Date.now();
    if (recentlyNotified(url, type, now)) {
      return { ok: false, skipped: true, reason: "already sent recently" };
    }
    const creds = parseServiceAccountJson(process.env.GOOGLE_INDEXING_SA_JSON);
    if (!creds) {
      console.error("[google-indexing] GOOGLE_INDEXING_SA_JSON is not valid service account JSON");
      return { ok: false, skipped: false, error: "invalid service account JSON" };
    }

    const token = await getAccessToken(creds);
    const res = await fetch(GOOGLE_INDEXING_PUBLISH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url, type }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) resetGoogleIndexingTokenCache();
      const error = `publish HTTP ${res.status}${text ? `: ${text.slice(0, 300)}` : ""}`;
      console.error(`[google-indexing] ${type} failed for ${url}: ${error}`);
      return { ok: false, skipped: false, error, status: res.status };
    }
    recentlySent.set(`${type} ${url}`, now);
    console.log(`[google-indexing] ok ${type} ${url}`);
    return { ok: true, type, url };
  } catch (e) {
    const error = (e as Error)?.message ?? String(e);
    console.error(`[google-indexing] ${type} failed for ${url}: ${error}`);
    return { ok: false, skipped: false, error };
  }
}

/**
 * What Google last recorded for this URL. Uses the read quota, not the
 * 200/day publish quota. Returns null when disabled or on any error (the
 * caller treats null as "unknown"). A 404 means Google has no notification
 * on record, which we report as both timestamps null.
 */
export async function getGoogleUrlMetadata(url: string): Promise<GoogleUrlMetadata | null> {
  try {
    if (!isGoogleIndexingEnabled() || !isSubmittableUrl(url)) return null;
    const creds = parseServiceAccountJson(process.env.GOOGLE_INDEXING_SA_JSON);
    if (!creds) return null;
    const token = await getAccessToken(creds);
    const res = await fetch(`${GOOGLE_INDEXING_METADATA_URL}?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return { latestUpdateAt: null, latestRemoveAt: null };
    if (!res.ok) {
      if (res.status === 401) resetGoogleIndexingTokenCache();
      const text = await res.text().catch(() => "");
      console.error(`[google-indexing] metadata HTTP ${res.status} for ${url}${text ? `: ${text.slice(0, 200)}` : ""}`);
      return null;
    }
    const json = (await res.json()) as {
      latestUpdate?: { notifyTime?: string };
      latestRemove?: { notifyTime?: string };
    };
    return {
      latestUpdateAt: json.latestUpdate?.notifyTime ?? null,
      latestRemoveAt: json.latestRemove?.notifyTime ?? null,
    };
  } catch (e) {
    console.error(`[google-indexing] metadata failed for ${url}: ${(e as Error)?.message ?? String(e)}`);
    return null;
  }
}
