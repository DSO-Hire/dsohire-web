/**
 * Tests for the research draft gate and Article JSON-LD builder.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { researchRobots } from "./config";
import { researchArticleJsonLd } from "./schema";
import { RESEARCH_REPORTS, STAFFING_COSTS_2026 } from "./reports";
import { ORG_ID } from "@/components/seo/schema";

test("draft gate: unpublished research is noindex,nofollow; published defers to site policy", () => {
  assert.deepEqual(researchRobots(false), {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  });
  assert.equal(researchRobots(true), undefined);
});

test("research Article JSON-LD: Person author, org publisher, deduped citations", () => {
  const sources = [
    { label: "A", url: "https://example.com/a", kind: "Government" },
    { label: "A again", url: "https://example.com/a", kind: "Government" },
    { label: "B", url: "https://example.com/b", kind: "Vendor" },
  ];
  const ld = researchArticleJsonLd(STAFFING_COSTS_2026, sources) as Record<string, unknown>;
  assert.equal(ld["@type"], "Article");
  assert.equal((ld.author as Record<string, unknown>)["@type"], "Person");
  assert.equal((ld.author as Record<string, unknown>).name, "Cam Eslinger");
  assert.equal((ld.publisher as Record<string, unknown>)["@id"], ORG_ID);
  assert.deepEqual(ld.citation, ["https://example.com/a", "https://example.com/b"]);
  assert.equal(ld.url, `https://dsohire.com/research/${STAFFING_COSTS_2026.slug}`);
  assert.equal(ld.datePublished, STAFFING_COSTS_2026.datePublished);
});

test("report slugs are unique and URL-safe", () => {
  const slugs = RESEARCH_REPORTS.map((r) => r.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const s of slugs) assert.match(s, /^[a-z0-9-]+$/);
});
