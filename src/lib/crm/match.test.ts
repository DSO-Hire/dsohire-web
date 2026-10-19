import { test } from "node:test";
import assert from "node:assert/strict";
import {
  domainOf,
  findAccountMatch,
  matchKind,
  mrrFromPrice,
  normalizeOrgName,
  pickOpportunityToWin,
  rankDsosForAccount,
} from "./match";

test("normalizeOrgName drops case, punctuation and noise words", () => {
  assert.equal(normalizeOrgName("Bright Smile Dental Partners, LLC"), "bright smile");
  assert.equal(normalizeOrgName("bright-smile"), "bright smile");
  assert.equal(normalizeOrgName("The Bright Smile Group"), "bright smile");
  assert.equal(normalizeOrgName("Smith & Jones Dental"), "smith and jones");
  assert.equal(normalizeOrgName("Señor Dental"), "senor");
  assert.equal(normalizeOrgName("Dr. Lee's Dental Group"), "dr lees");
});

test("normalizeOrgName returns empty when nothing identifying remains", () => {
  assert.equal(normalizeOrgName("Dental Group"), "");
  assert.equal(normalizeOrgName(""), "");
  assert.equal(normalizeOrgName(null), "");
});

test("domainOf strips protocol, www, port, path and query", () => {
  assert.equal(domainOf("https://www.BrightSmile.com/about?x=1"), "brightsmile.com");
  assert.equal(domainOf("brightsmile.com"), "brightsmile.com");
  assert.equal(domainOf("http://brightsmile.com:8080/"), "brightsmile.com");
  assert.equal(domainOf("www.brightsmile.co.uk."), "brightsmile.co.uk");
  assert.equal(domainOf("  https://careers.brightsmile.com#jobs "), "careers.brightsmile.com");
  assert.equal(domainOf("not a url"), null);
  assert.equal(domainOf(""), null);
  assert.equal(domainOf(null), null);
});

test("matchKind prefers domain, then exact normalized name", () => {
  assert.equal(matchKind({ name: "X", website: "www.a.com" }, { name: "Y", website: "https://a.com/x" }), "domain");
  assert.equal(matchKind({ name: "Bright Smile Dental", website: null }, { name: "Bright Smile, LLC", website: null }), "name");
  assert.equal(matchKind({ name: "Bright Smile", website: "a.com" }, { name: "Bright Smiles", website: "b.com" }), null);
  // Generic names never match each other.
  assert.equal(matchKind({ name: "Dental Group", website: null }, { name: "Dental Partners", website: null }), null);
});

test("findAccountMatch is conservative about ambiguity", () => {
  const dso = { name: "Bright Smile Dental", website: "brightsmile.com" };
  const a1 = { id: "1", name: "Bright Smile", website: null };
  const a2 = { id: "2", name: "Bright Smile Partners", website: null };
  const a3 = { id: "3", name: "Something Else", website: "https://www.brightsmile.com" };
  assert.equal(findAccountMatch(dso, [a1]), a1);
  assert.equal(findAccountMatch(dso, [a1, a2]), null); // two name matches
  assert.equal(findAccountMatch(dso, [a1, a2, a3]), a3); // unique domain wins
  assert.equal(findAccountMatch(dso, [{ id: "4", name: "Other", website: null }]), null);
});

test("rankDsosForAccount puts domain, then name matches first", () => {
  const acct = { name: "Bright Smile", website: "brightsmile.com" };
  const dsos = [
    { id: "z", name: "Zeta", website: null },
    { id: "n", name: "Bright Smile Dental", website: null },
    { id: "d", name: "BSD Holdings", website: "www.brightsmile.com" },
    { id: "a", name: "Alpha", website: null },
  ];
  const r = rankDsosForAccount(acct, dsos);
  assert.deepEqual(r.suggested.map((d) => d.id), ["d", "n"]);
  assert.deepEqual(r.rest.map((d) => d.id), ["a", "z"]);
});

test("pickOpportunityToWin takes the furthest open stage, then most recent", () => {
  const opps = [
    { id: "a", stage: "demo", stage_changed_at: "2026-10-01T00:00:00Z" },
    { id: "b", stage: "proposal", stage_changed_at: "2026-09-01T00:00:00Z" },
    { id: "c", stage: "won", stage_changed_at: "2026-10-10T00:00:00Z" },
    { id: "d", stage: "lost", stage_changed_at: "2026-10-10T00:00:00Z" },
    { id: "e", stage: "proposal", stage_changed_at: "2026-09-15T00:00:00Z" },
  ];
  assert.equal(pickOpportunityToWin(opps)?.id, "e");
  assert.equal(pickOpportunityToWin(opps.filter((o) => o.stage === "won" || o.stage === "lost")), null);
  const custom = [{ id: "x", stage: "pilot", custom_stages: ["intro", "pilot", "won"] }, { id: "y", stage: "intro", custom_stages: ["intro", "pilot", "won"] }];
  assert.equal(pickOpportunityToWin(custom)?.id, "x");
});

test("mrrFromPrice converts the Stripe amount to monthly dollars", () => {
  assert.equal(mrrFromPrice({ unitAmountCents: 69900, interval: "month" }), 699);
  assert.equal(mrrFromPrice({ unitAmountCents: 754800, interval: "year" }), 629);
  assert.equal(mrrFromPrice({ unitAmountCents: 39900, quantity: 2, interval: "month" }), 798);
  assert.equal(mrrFromPrice({ unitAmountCents: 120000, interval: "month", intervalCount: 3 }), 400);
  assert.equal(mrrFromPrice({ unitAmountCents: null, interval: "month" }), null);
  assert.equal(mrrFromPrice({ unitAmountCents: 100, interval: null }), null);
});
