/**
 * Smoke tests for the job-distribution safety rules — the first toe-hold of a
 * test suite. These guard the launch-safety invariants the whole feature rests
 * on: nothing distributes pre-launch, demo DSOs are denylisted, confidential/
 * comp/affiliation masking is applied, and no PII leaks.
 *
 * Run: npm run test:distribution
 *
 * Pure functions only — no DB. The DB-backed path of
 * getPublicJobsForDistribution is covered by the gate-off case (it must return
 * [] before ever touching Supabase).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  mapRowToPublicJob,
  buildJobPostingJsonLd,
  publicJobToJson,
  getPublicJobsForDistribution,
  DEMO_DSO_SLUGS,
  type DistributionRpcRow,
} from "@/lib/distribution/public-jobs";
import { isDistributionLive } from "@/lib/launch/gate";

function row(over: Partial<DistributionRpcRow> = {}): DistributionRpcRow {
  return {
    job_id: "job-1",
    title: "Associate Dentist",
    slug: "associate-dentist",
    description: "<p>Great <b>role</b></p>",
    employment_type: "full_time",
    role_category: "dentist",
    scope: "location",
    posted_at: "2026-06-01T00:00:00Z",
    expires_at: "2026-08-01T00:00:00Z",
    compensation_min: 180000,
    compensation_max: 220000,
    compensation_period: "annual",
    compensation_visible: true,
    dso_id: "dso-1",
    dso_name: "Bridgeway Dental Operations",
    dso_slug: "bridgeway-dental-operations",
    is_public_affiliated: true,
    locations: [
      {
        name: "Bridgeway Midtown",
        city: "Austin",
        state: "TX",
        address_line1: "123 Main St",
        postal_code: "78701",
        public_dso_affiliation: true,
        anonymize_name: false,
      },
    ],
    ...over,
  };
}

/* ── Launch gate ── */

test("isDistributionLive is false unless BOTH flags are set", () => {
  const orig = {
    gate: process.env.PREVIEW_GATE_DISABLED,
    dist: process.env.DISTRIBUTION_LIVE,
  };
  try {
    delete process.env.PREVIEW_GATE_DISABLED;
    delete process.env.DISTRIBUTION_LIVE;
    assert.equal(isDistributionLive(), false, "neither flag");

    process.env.PREVIEW_GATE_DISABLED = "true";
    assert.equal(isDistributionLive(), false, "only launch flag");

    delete process.env.PREVIEW_GATE_DISABLED;
    process.env.DISTRIBUTION_LIVE = "true";
    assert.equal(isDistributionLive(), false, "only distribution flag");

    process.env.PREVIEW_GATE_DISABLED = "true";
    process.env.DISTRIBUTION_LIVE = "true";
    assert.equal(isDistributionLive(), true, "both flags");
  } finally {
    if (orig.gate === undefined) delete process.env.PREVIEW_GATE_DISABLED;
    else process.env.PREVIEW_GATE_DISABLED = orig.gate;
    if (orig.dist === undefined) delete process.env.DISTRIBUTION_LIVE;
    else process.env.DISTRIBUTION_LIVE = orig.dist;
  }
});

test("getPublicJobsForDistribution returns [] pre-launch (no DB hit)", async () => {
  const orig = {
    gate: process.env.PREVIEW_GATE_DISABLED,
    dist: process.env.DISTRIBUTION_LIVE,
  };
  try {
    delete process.env.PREVIEW_GATE_DISABLED;
    delete process.env.DISTRIBUTION_LIVE;
    const jobs = await getPublicJobsForDistribution();
    assert.deepEqual(jobs, []);
    const scoped = await getPublicJobsForDistribution({ dsoSlug: "anything" });
    assert.deepEqual(scoped, []);
  } finally {
    if (orig.gate === undefined) delete process.env.PREVIEW_GATE_DISABLED;
    else process.env.PREVIEW_GATE_DISABLED = orig.gate;
    if (orig.dist === undefined) delete process.env.DISTRIBUTION_LIVE;
    else process.env.DISTRIBUTION_LIVE = orig.dist;
  }
});

/* ── Demo denylist ── */

test("DEMO_DSO_SLUGS denylists the known seed DSOs", () => {
  for (const slug of [
    "lakeshore-dental-group",
    "riverstone-dental-partners",
    "summit-dental-group",
    "bridgeway-dental-operations",
  ]) {
    assert.ok(DEMO_DSO_SLUGS.has(slug), `${slug} should be denylisted`);
  }
});

/* ── Affiliation masking ── */

test("public-affiliated job shows the real DSO name", () => {
  const job = mapRowToPublicJob(row());
  assert.equal(job.employerName, "Bridgeway Dental Operations");
  assert.equal(job.isPublicAffiliated, true);
});

test("private-affiliated single-location masks DSO name to the practice", () => {
  const job = mapRowToPublicJob(
    row({
      is_public_affiliated: false,
      locations: [
        {
          name: "Smile Dental of Austin",
          city: "Austin",
          state: "TX",
          address_line1: "123 Main St",
          postal_code: "78701",
          public_dso_affiliation: false,
          anonymize_name: false,
        },
      ],
    }),
  );
  assert.equal(job.employerName, "Smile Dental of Austin");
  assert.notEqual(job.employerName, "Bridgeway Dental Operations");
});

test("private-affiliated multi-location shows 'Multiple locations'", () => {
  const job = mapRowToPublicJob(
    row({
      is_public_affiliated: false,
      locations: [
        { name: "A", city: "Austin", state: "TX", address_line1: null, postal_code: null, public_dso_affiliation: false, anonymize_name: false },
        { name: "B", city: "Dallas", state: "TX", address_line1: null, postal_code: null, public_dso_affiliation: false, anonymize_name: false },
      ],
    }),
  );
  assert.equal(job.employerName, "Multiple locations");
});

test("anonymized location masks name AND drops street address", () => {
  const job = mapRowToPublicJob(
    row({
      is_public_affiliated: false,
      locations: [
        {
          name: "Smile Dental of Austin",
          city: "Austin",
          state: "TX",
          address_line1: "123 Main St",
          postal_code: "78701",
          public_dso_affiliation: false,
          anonymize_name: true,
        },
      ],
    }),
  );
  assert.equal(job.employerName, "Dental Office in Austin");
  assert.equal(job.locations[0]!.streetAddress, null);
  assert.equal(job.locations[0]!.postalCode, null);
  assert.equal(job.locations[0]!.city, "Austin");
});

/* ── Compensation visibility ── */

test("comp is hidden when not visible", () => {
  const job = mapRowToPublicJob(row({ compensation_visible: false }));
  assert.equal(job.comp, null);
  const ld = buildJobPostingJsonLd(job) as Record<string, unknown>;
  assert.equal(ld.baseSalary, undefined);
});

test("comp is emitted when visible", () => {
  const job = mapRowToPublicJob(row());
  assert.deepEqual(job.comp, { min: 180000, max: 220000, period: "annual" });
});

/* ── JSON-LD ── */

test("JSON-LD has validThrough, identifier, directApply", () => {
  const ld = buildJobPostingJsonLd(mapRowToPublicJob(row())) as Record<
    string,
    unknown
  >;
  assert.equal(ld.validThrough, "2026-08-01T00:00:00Z");
  assert.equal(ld.directApply, true);
  assert.ok(ld.identifier);
});

test("JSON-LD sameAs only for public affiliation", () => {
  const pub = buildJobPostingJsonLd(mapRowToPublicJob(row())) as {
    hiringOrganization: { sameAs?: string };
  };
  assert.ok(pub.hiringOrganization.sameAs);

  const priv = buildJobPostingJsonLd(
    mapRowToPublicJob(
      row({
        is_public_affiliated: false,
        locations: [
          { name: "Smile", city: "Austin", state: "TX", address_line1: null, postal_code: null, public_dso_affiliation: false, anonymize_name: false },
        ],
      }),
    ),
  ) as { hiringOrganization: { sameAs?: string } };
  assert.equal(priv.hiringOrganization.sameAs, undefined);
});

/* ── JSON API shape ── */

test("publicJobToJson carries ?source= and leaks no PII", () => {
  const json = publicJobToJson(
    mapRowToPublicJob(row()),
    "careers-embed:bridgeway-dental-operations",
  );
  assert.match(String(json.url), /source=careers-embed/);
  assert.match(String(json.applyUrl), /source=careers-embed/);
  // No candidate/applicant fields anywhere.
  const keys = Object.keys(json).join(",");
  assert.doesNotMatch(keys, /candidate|applicant|email|phone|resume/i);
});
