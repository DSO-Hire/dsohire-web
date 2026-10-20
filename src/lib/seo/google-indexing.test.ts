/**
 * Google Indexing API: pure parts only (no network, no real key).
 *
 *   - JWT claim construction + RS256 signature (throwaway RSA key)
 *   - service-account JSON parsing
 *   - production-only gating
 *   - job eligibility + notification decision
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";

import {
  GOOGLE_INDEXING_SCOPE,
  GOOGLE_TOKEN_URL,
  buildJwtClaims,
  signJwt,
  parseServiceAccountJson,
  isGoogleIndexingEnabled,
  isSubmittableUrl,
  notifyGoogleJobUrl,
} from "./google-indexing";
import {
  isJobIndexable,
  decideJobNotification,
  googleThinksLive,
  jobPublicUrl,
  type JobIndexingRow,
} from "./job-indexing";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

/* ───── JWT ───── */

test("buildJwtClaims: issuer, scope, audience, 1h lifetime", () => {
  const claims = buildJwtClaims("bot@proj.iam.gserviceaccount.com", 1_700_000_000);
  assert.deepEqual(claims, {
    iss: "bot@proj.iam.gserviceaccount.com",
    scope: GOOGLE_INDEXING_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: 1_700_000_000,
    exp: 1_700_003_600,
  });
  assert.equal(GOOGLE_INDEXING_SCOPE, "https://www.googleapis.com/auth/indexing");
  assert.equal(GOOGLE_TOKEN_URL, "https://oauth2.googleapis.com/token");
});

test("signJwt: RS256 header, round-trips claims, signature verifies", () => {
  const claims = buildJwtClaims("bot@proj.iam.gserviceaccount.com", 1_700_000_000);
  const jwt = signJwt(claims, privateKey);
  const parts = jwt.split(".");
  assert.equal(parts.length, 3);
  const [h, p, sig] = parts as [string, string, string];
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(p, "base64url").toString()), claims);
  // base64url: no padding or +/ characters.
  assert.doesNotMatch(jwt, /[=+/]/);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  assert.ok(verifier.verify(publicKey, Buffer.from(sig, "base64url")));
});

/* ───── Credentials ───── */

test("parseServiceAccountJson: extracts email + key, unescapes \\n", () => {
  const escaped = privateKey.replace(/\n/g, "\\n");
  const raw = JSON.stringify({ type: "service_account", client_email: "a@b.com", private_key: escaped });
  // JSON.stringify escapes the backslash, so the parsed value holds a literal "\n".
  const creds = parseServiceAccountJson(raw);
  assert.ok(creds);
  assert.equal(creds.clientEmail, "a@b.com");
  assert.equal(creds.privateKey, privateKey);
  // The unescaped key must still sign.
  assert.ok(signJwt(buildJwtClaims("a@b.com", 1), creds.privateKey).split(".").length === 3);
});

test("parseServiceAccountJson: rejects junk", () => {
  assert.equal(parseServiceAccountJson(undefined), null);
  assert.equal(parseServiceAccountJson("not json"), null);
  assert.equal(parseServiceAccountJson(JSON.stringify({ client_email: "a@b.com" })), null);
});

test("isSubmittableUrl: https dsohire.com only", () => {
  assert.ok(isSubmittableUrl("https://dsohire.com/jobs/abc"));
  assert.ok(!isSubmittableUrl("http://dsohire.com/jobs/abc"));
  assert.ok(!isSubmittableUrl("https://demo.dsohire.com/jobs/abc"));
  assert.ok(!isSubmittableUrl("/jobs/abc"));
  assert.equal(jobPublicUrl("abc"), "https://dsohire.com/jobs/abc");
});

/* ───── Gating ───── */

const GATE_KEYS = [
  "GOOGLE_INDEXING_SA_JSON",
  "VERCEL_ENV",
  "PREVIEW_GATE_DISABLED",
  "DEMO_SITE",
  "DEMO_MODE",
] as const;

function withEnv(env: Partial<Record<(typeof GATE_KEYS)[number], string>>, fn: () => void) {
  const saved = GATE_KEYS.map((k) => [k, process.env[k]] as const);
  for (const k of GATE_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  try {
    fn();
  } finally {
    for (const [k, v] of saved) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const PROD = {
  GOOGLE_INDEXING_SA_JSON: '{"client_email":"a@b.com","private_key":"x"}',
  VERCEL_ENV: "production",
  PREVIEW_GATE_DISABLED: "true",
};

test("gating: on only for launched, non-demo Vercel production with a key", () => {
  withEnv(PROD, () => assert.equal(isGoogleIndexingEnabled(), true));
  withEnv({ ...PROD, GOOGLE_INDEXING_SA_JSON: "" }, () => assert.equal(isGoogleIndexingEnabled(), false));
  withEnv({ ...PROD, VERCEL_ENV: "preview" }, () => assert.equal(isGoogleIndexingEnabled(), false));
  withEnv({ ...PROD, VERCEL_ENV: "development" }, () => assert.equal(isGoogleIndexingEnabled(), false));
  withEnv({ ...PROD, PREVIEW_GATE_DISABLED: "false" }, () => assert.equal(isGoogleIndexingEnabled(), false));
  withEnv({ ...PROD, DEMO_SITE: "true" }, () => assert.equal(isGoogleIndexingEnabled(), false));
  withEnv({ ...PROD, DEMO_MODE: "1" }, () => assert.equal(isGoogleIndexingEnabled(), false));
});

test("notifyGoogleJobUrl: skips (never throws, never fetches) when gated off", async () => {
  const realFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("should not fetch");
  }) as typeof fetch;
  try {
    const saved = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = "preview";
    const r = await notifyGoogleJobUrl("https://dsohire.com/jobs/abc", "URL_UPDATED");
    if (saved === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = saved;
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.skipped, true);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ───── Eligibility ───── */

const NOW = new Date("2026-10-19T12:00:00Z");

function job(overrides: Partial<JobIndexingRow> = {}): JobIndexingRow {
  return {
    id: "job-1",
    status: "active",
    deleted_at: null,
    visibility: "public",
    confidential: false,
    expires_at: null,
    dso: { status: "active", deleted_at: null, is_demo: false, slug: "acme-dental" },
    ...overrides,
  };
}

test("isJobIndexable: active public job qualifies", () => {
  assert.equal(isJobIndexable(job(), NOW), true);
  assert.equal(isJobIndexable(job({ expires_at: "2026-11-01T00:00:00Z" }), NOW), true);
});

test("isJobIndexable: every exclusion", () => {
  for (const status of ["draft", "paused", "expired", "filled", "archived"]) {
    assert.equal(isJobIndexable(job({ status }), NOW), false, status);
  }
  assert.equal(isJobIndexable(job({ deleted_at: "2026-10-01T00:00:00Z" }), NOW), false);
  assert.equal(isJobIndexable(job({ visibility: "internal_only" }), NOW), false);
  assert.equal(isJobIndexable(job({ confidential: true }), NOW), false);
  assert.equal(isJobIndexable(job({ expires_at: "2026-10-19T11:59:59Z" }), NOW), false);
  assert.equal(isJobIndexable(job({ dso: null }), NOW), false);
  const dso = job().dso!;
  assert.equal(isJobIndexable(job({ dso: { ...dso, is_demo: true } }), NOW), false);
  assert.equal(isJobIndexable(job({ dso: { ...dso, status: "suspended" } }), NOW), false);
  assert.equal(isJobIndexable(job({ dso: { ...dso, deleted_at: "2026-10-01T00:00:00Z" } }), NOW), false);
  assert.equal(isJobIndexable(job({ dso: { ...dso, slug: "bridgeway-dental-operations" } }), NOW), false);
});

/* ───── Decision ───── */

const NEVER = { latestUpdateAt: null, latestRemoveAt: null };
const LIVE = { latestUpdateAt: "2026-10-18T00:00:00Z", latestRemoveAt: null };
const REMOVED = { latestUpdateAt: "2026-10-10T00:00:00Z", latestRemoveAt: "2026-10-11T00:00:00Z" };

test("googleThinksLive", () => {
  assert.equal(googleThinksLive(NEVER), false);
  assert.equal(googleThinksLive(LIVE), true);
  assert.equal(googleThinksLive(REMOVED), false);
  assert.equal(
    googleThinksLive({ latestUpdateAt: "2026-10-12T00:00:00Z", latestRemoveAt: "2026-10-11T00:00:00Z" }),
    true,
  );
});

test("decideJobNotification: indexable always updates (real-time path)", () => {
  assert.equal(decideJobNotification({ indexable: true, metadata: null }), "URL_UPDATED");
  assert.equal(decideJobNotification({ indexable: true, metadata: LIVE }), "URL_UPDATED");
});

test("decideJobNotification: not indexable deletes only if it was live", () => {
  assert.equal(decideJobNotification({ indexable: false, wasLive: true, metadata: null }), "URL_DELETED");
  assert.equal(decideJobNotification({ indexable: false, metadata: LIVE }), "URL_DELETED");
  assert.equal(decideJobNotification({ indexable: false, metadata: NEVER }), null);
  assert.equal(decideJobNotification({ indexable: false, metadata: REMOVED }), null);
  // Unknown metadata (Google off or errored) and no hint: send nothing.
  assert.equal(decideJobNotification({ indexable: false, metadata: null }), null);
});

test("decideJobNotification: cron liveSince skips jobs Google already has", () => {
  const postedAt = "2026-10-17T00:00:00Z";
  assert.equal(decideJobNotification({ indexable: true, metadata: LIVE, liveSince: postedAt }), null);
  assert.equal(
    decideJobNotification({ indexable: true, metadata: LIVE, liveSince: "2026-10-18T06:00:00Z" }),
    "URL_UPDATED",
  );
  assert.equal(decideJobNotification({ indexable: true, metadata: NEVER, liveSince: postedAt }), "URL_UPDATED");
  assert.equal(decideJobNotification({ indexable: true, metadata: REMOVED, liveSince: postedAt }), "URL_UPDATED");
});
