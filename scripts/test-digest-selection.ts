/**
 * Unit checks for the PracticeFit weekly-drip inclusion logic (B.2).
 *
 * No test runner is wired into this repo (engine checks run as ad-hoc tsx
 * scripts), so this is a standalone, assertion-based script:
 *
 *   npx tsx scripts/test-digest-selection.ts
 *
 * decideDigest() only reads `.fit.score` and `.job_id`, so the fixtures are
 * minimal objects cast to the public type.
 */

import {
  decideDigest,
  HIGH_FIT_MIN_SCORE,
  MAX_JOBS_PER_DIGEST,
  MAX_SILENCE_DAYS,
} from "../src/lib/practice-fit/digest-selection";
import type { RoleThatFits } from "../src/lib/practice-fit/roles-that-fit";

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

function job(id: string, score: number): RoleThatFits {
  return { job_id: id, fit: { score } } as unknown as RoleThatFits;
}

const NOW = new Date("2026-06-08T13:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const none = new Set<string>();

// 1. New high-fit present → "new", only not-previously-sent, capped at 5.
{
  const fits = [job("a", 90), job("b", 70), job("c", 50), job("d", 20)];
  const r = decideDigest({
    fits,
    previouslySentJobIds: none,
    lastSentAt: daysAgo(3),
    now: NOW,
  });
  check("1a variant is new", r.variant === "new");
  check(
    "1b only Strong+ included (a,b)",
    r.jobs.map((j) => j.job_id).join(",") === "a,b"
  );
}

// 2. High-fit but all previously sent, recent send → skip.
{
  const fits = [job("a", 90), job("b", 80)];
  const r = decideDigest({
    fits,
    previouslySentJobIds: new Set(["a", "b"]),
    lastSentAt: daysAgo(5),
    now: NOW,
  });
  check("2 all-seen + recent → skip", r.variant === "skip" && r.jobs.length === 0);
}

// 3. High-fit but all seen, last send > 30 days → fallback with top-5 of all fits.
{
  const fits = [job("a", 90), job("b", 80), job("c", 40)];
  const r = decideDigest({
    fits,
    previouslySentJobIds: new Set(["a", "b", "c"]),
    lastSentAt: daysAgo(MAX_SILENCE_DAYS + 10),
    now: NOW,
  });
  check("3a all-seen + >30d → fallback", r.variant === "fallback");
  check("3b fallback includes lower buckets", r.jobs.length === 3);
}

// 4. No high-fit at all, never sent → fallback (Infinity > 30).
{
  const fits = [job("a", 50), job("b", 33)];
  const r = decideDigest({
    fits,
    previouslySentJobIds: none,
    lastSentAt: null,
    now: NOW,
  });
  check("4 no-high-fit + never-sent → fallback", r.variant === "fallback" && r.jobs.length === 2);
}

// 5. No high-fit, recent send → skip.
{
  const fits = [job("a", 50), job("b", 33)];
  const r = decideDigest({
    fits,
    previouslySentJobIds: none,
    lastSentAt: daysAgo(10),
    now: NOW,
  });
  check("5 no-high-fit + recent → skip", r.variant === "skip");
}

// 6. No fits at all, never sent → skip (fallback would be empty).
{
  const r = decideDigest({
    fits: [],
    previouslySentJobIds: none,
    lastSentAt: null,
    now: NOW,
  });
  check("6 empty fits → skip", r.variant === "skip" && r.jobs.length === 0);
}

// 7. More than 5 new high-fit → capped at MAX_JOBS_PER_DIGEST.
{
  const fits = Array.from({ length: 8 }, (_, i) => job(`j${i}`, 95 - i));
  const r = decideDigest({
    fits,
    previouslySentJobIds: none,
    lastSentAt: daysAgo(7),
    now: NOW,
  });
  check("7a variant new", r.variant === "new");
  check(`7b capped at ${MAX_JOBS_PER_DIGEST}`, r.jobs.length === MAX_JOBS_PER_DIGEST);
}

// 8. Mix of new + previously-sent high-fit → only new, order preserved.
{
  const fits = [job("seen1", 92), job("new1", 88), job("seen2", 70), job("new2", 65)];
  const r = decideDigest({
    fits,
    previouslySentJobIds: new Set(["seen1", "seen2"]),
    lastSentAt: daysAgo(7),
    now: NOW,
  });
  check("8a variant new", r.variant === "new");
  check(
    "8b only new, score-order preserved",
    r.jobs.map((j) => j.job_id).join(",") === "new1,new2"
  );
}

// 9. Boundary: score exactly at the floor counts as high-fit.
{
  const r = decideDigest({
    fits: [job("a", HIGH_FIT_MIN_SCORE)],
    previouslySentJobIds: none,
    lastSentAt: daysAgo(3),
    now: NOW,
  });
  check("9 score == floor is high-fit", r.variant === "new" && r.jobs.length === 1);
}

// 10. Boundary: exactly 30 days silent is NOT > 30 → skip (no new).
{
  const r = decideDigest({
    fits: [job("a", 50)],
    previouslySentJobIds: none,
    lastSentAt: daysAgo(MAX_SILENCE_DAYS),
    now: NOW,
  });
  check("10 exactly 30d (not >30) → skip", r.variant === "skip");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
