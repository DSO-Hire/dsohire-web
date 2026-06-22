/**
 * Phase 0 spike — proves the three cookieless-identity properties the build
 * spec (§4.2, §13) requires before any ingestion is wired up.
 *
 * No test runner is wired into this repo (engine checks run as ad-hoc tsx
 * scripts — see test-digest-selection.ts), so this is a standalone,
 * assertion-based script:
 *
 *   npx tsx scripts/test-vantage-hash.ts
 *
 * Properties:
 *   1. Determinism — same (salt, ip, ua, host) → same visitor_id.
 *   2. Salt rotation breaks linkage — same (ip, ua, host) under a new salt
 *      → DIFFERENT visitor_id (so tomorrow's visitor can't be linked).
 *   3. The id is a valid signed int64 (fits Postgres bigint), and distinct
 *      visitors separate (different ip → different id).
 *
 * Property 3 of §14 ("no raw ip/ua persisted") is enforced structurally: the
 * module does no I/O and returns only a bigint. That is verified by inspection
 * (the accompanying grep in the Phase 0 gate report), not exercisable here.
 */

import { randomBytes } from "node:crypto";
import {
  computeVisitorId,
  computeSessionId,
  digestToSignedInt64,
} from "../src/lib/analytics/visitor-hash";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${name}`);
  }
}

const INT64_MIN = BigInt("-9223372036854775808");
const INT64_MAX = BigInt("9223372036854775807");

// Two fixed salts standing in for "today" and "after rotation".
const saltToday = randomBytes(16);
const saltTomorrow = randomBytes(16);

const ip = "203.0.113.7";
const ua =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";
const host = "dsohire.com";

console.log("Vantage cookieless-identity spike\n");

// 1. Determinism within a day.
const a = computeVisitorId(saltToday, ip, ua, host);
const b = computeVisitorId(saltToday, ip, ua, host);
check("determinism: same inputs + same salt → same visitor_id", a === b);

// 2. Salt rotation severs linkage.
const tomorrow = computeVisitorId(saltTomorrow, ip, ua, host);
check(
  "salt rotation: same visitor, new salt → different visitor_id",
  a !== tomorrow,
);

// 3a. Valid signed int64 (Postgres bigint range).
check(
  "range: visitor_id is a signed int64",
  typeof a === "bigint" && a >= INT64_MIN && a <= INT64_MAX,
);

// 3b. Distinct visitors separate.
const otherIp = computeVisitorId(saltToday, "198.51.100.42", ua, host);
check("separation: different ip → different visitor_id", a !== otherIp);

const otherUa = computeVisitorId(saltToday, ip, ua + " Chrome/130", host);
check("separation: different ua → different visitor_id", a !== otherUa);

const otherHost = computeVisitorId(saltToday, ip, ua, "www.dsohire.com");
check("separation: different host → different visitor_id", a !== otherHost);

// digestToSignedInt64 sanity — a 0xFF.. prefix must read as negative (signed).
check(
  "signed decode: 0xFF prefix reads negative",
  digestToSignedInt64(Buffer.from("ffffffffffffffff", "hex")) === BigInt(-1),
);

// Session bucketing: same visitor + same day → same session; next day differs.
const s1 = computeSessionId(a, "2026-06-22", host);
const s2 = computeSessionId(a, "2026-06-22", host);
const s3 = computeSessionId(a, "2026-06-23", host);
check("session: same visitor + same UTC day → same session_id", s1 === s2);
check("session: next UTC day → different session_id", s1 !== s3);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 1 - 1 : 1);
