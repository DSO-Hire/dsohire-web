/**
 * Tests for the salary page builders and the committed BLS data accessors.
 * Run: npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildNationalFaq, buildStateFaq, compareToNational, occupationJsonLd } from "./salary-content";
import { OEWS_VINTAGE, metroDetail, nationalDetail, stateDetail, stateMetroDetails, stateProjection, nationalProjection, PROJECTION_PERIOD } from "./salary-detail";
import { STATE_LICENSING, licensingForRole } from "./state-licensing";
import { SALARY_ROLES } from "./salary";

test("committed OEWS file is the May 2025 vintage and matches spot-checked BLS values", () => {
  assert.equal(OEWS_VINTAGE, "May 2025");
  // Values cross-checked against the BLS Public Data API on 2026-10-19.
  const tx = stateDetail("29-1292", "TX")!;
  assert.equal(tx.annual.p50, 99240);
  assert.equal(tx.lq, 0.81);
  assert.equal(stateDetail("29-1292", "CA")!.emp, 24500);
  assert.equal(stateDetail("31-9091", "OH")!.annual.p90, 78000);
  assert.equal(nationalDetail("29-1292")!.annual.p50, 98100);
  // comp_benchmarks stores metro codes without leading zeros.
  assert.equal(metroDetail("29-1292", "19100")!.emp, 7050);
});

test("every salary role SOC has national detail", () => {
  for (const r of SALARY_ROLES) assert.ok(nationalDetail(r.soc), r.soc);
});

test("state metro lookup matches multi-state metro names", () => {
  const ny = stateMetroDetails("29-1292", "NJ").map((m) => m.name);
  assert.ok(ny.some((n) => n.startsWith("New York-Newark-Jersey City")));
});

test("projections cover the 7 focus states for the 3 focus roles", () => {
  assert.match(PROJECTION_PERIOD, /^\d{4}–\d{4}$/);
  for (const soc of ["29-1292", "31-9091", "29-1021"]) {
    assert.ok(nationalProjection(soc)?.pct !== null);
    for (const st of ["CA", "TX", "FL", "NY", "PA", "IL", "OH"]) assert.ok(stateProjection(soc, st), `${soc} ${st}`);
  }
});

test("compareToNational labels direction with a 1% dead band", () => {
  assert.deepEqual(compareToNational(110, 100), { pct: 10, diff: 10, dir: "higher than" });
  assert.equal(compareToNational(99.5, 100)!.dir, "about the same as");
  assert.equal(compareToNational(90, 100)!.dir, "lower than");
  assert.equal(compareToNational(90, 0), null);
});

test("state FAQ: 4-6 entries, built from page data, no em dashes", () => {
  const sd = stateDetail("29-1292", "TX")!;
  const faq = buildStateFaq({
    plural: "dental hygienists",
    stateName: "Texas",
    vintage: OEWS_VINTAGE,
    state: sd,
    national: nationalDetail("29-1292"),
    metros: [{ name: "Dallas", median: 101870 }, { name: "Tyler", median: 80000 }],
    projection: stateProjection("29-1292", "TX"),
    nationalProjection: nationalProjection("29-1292"),
    projectionPeriod: PROJECTION_PERIOD,
    licensingFaq: licensingForRole("hygienists", "TX", "Texas")!.faq,
  });
  assert.ok(faq.length >= 4 && faq.length <= 6, String(faq.length));
  assert.equal(faq[0].q, "How much do dental hygienists make in Texas?");
  assert.ok(faq[0].a.includes("$99,240"));
  assert.ok(faq.some((f) => f.q.includes("metro area pays")));
  for (const f of faq) assert.ok(!f.a.includes("—") && !f.q.includes("—"));
});

test("national FAQ includes outlook when given", () => {
  const faq = buildNationalFaq({
    plural: "dental assistants",
    vintage: OEWS_VINTAGE,
    national: nationalDetail("31-9091")!,
    topStates: [{ name: "A", median: 3 }, { name: "B", median: 2 }, { name: "C", median: 1 }],
    outlook: { pct: 7, period: "2025–35", openings: 53000, descriptor: "much faster than the average for all occupations" },
  });
  assert.equal(faq.length, 4);
});

test("Occupation JSON-LD carries an annual MonetaryAmountDistribution", () => {
  const o = occupationJsonLd({
    name: "Dental Hygienist",
    description: "x",
    soc: "29-1292",
    blsTitle: "Dental Hygienists",
    url: "https://dsohire.com/salary/hygienists/texas",
    location: { type: "State", name: "Texas" },
    detail: stateDetail("29-1292", "TX")!,
  }) as { "@type": string; estimatedSalary: Array<Record<string, unknown>> };
  assert.equal(o["@type"], "Occupation");
  const d = o.estimatedSalary[0];
  assert.equal(d["@type"], "MonetaryAmountDistribution");
  assert.equal(d.duration, "P1Y");
  assert.equal(d.median, 99240);
  assert.equal(d.percentile10, 71530);
});

test("licensing entries exist for the 7 focus states and copy has no em dashes", () => {
  assert.deepEqual(Object.keys(STATE_LICENSING).sort(), ["CA", "FL", "IL", "NY", "OH", "PA", "TX"]);
  for (const role of ["hygienists", "dental-assistants", "dentists"]) {
    for (const st of Object.keys(STATE_LICENSING)) {
      const l = licensingForRole(role, st, st)!;
      assert.ok(l.board.url.startsWith("https://"));
      assert.ok(!JSON.stringify(l).includes("—"));
    }
  }
  assert.equal(licensingForRole("hygienists", "CA", "California")!.board.name, "Dental Hygiene Board of California");
  assert.equal(licensingForRole("front-desk", "CA", "California"), null);
});
