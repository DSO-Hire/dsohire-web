/**
 * Tests for the /guides content pipeline (launch SEO spec, Phase 3).
 *
 * Guards: the three pillar guides load with complete frontmatter, the FAQ
 * parser extracts real Q/A pairs from the same markdown that renders on-page,
 * the Article + FAQPage JSON-LD builders emit valid parseable JSON, and the
 * sitemap lists all four /guides routes.
 *
 * Run: npm test (picked up by the src/**\/*.test.ts glob)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  loadGuide,
  loadAllGuides,
  listGuideSlugs,
  buildGuideArticleJsonLd,
  buildGuideFaqJsonLd,
} from "@/lib/guides/loader";
import sitemap from "@/app/sitemap";
import { stateDetail, stateProjection } from "@/lib/comp/salary-detail";

/* ── Content loading ── */

test("all guides load with complete frontmatter", () => {
  const guides = loadAllGuides();
  assert.equal(guides.length, 4);
  for (const g of guides) {
    assert.ok(g.title.length > 0, `${g.slug}: title`);
    assert.ok(g.metaTitle.includes("DSO Hire"), `${g.slug}: metaTitle`);
    assert.ok(g.metaDescription.length > 0, `${g.slug}: metaDescription`);
    assert.ok(g.heading.length > 0, `${g.slug}: heading`);
    assert.ok(!g.body.startsWith("#"), `${g.slug}: body H1 stripped`);
    assert.ok(g.internalLinks.length >= 4, `${g.slug}: internal links`);
    assert.ok(g.faq.length >= 4, `${g.slug}: FAQ parsed (got ${g.faq.length})`);
  }
});

test("FAQ items are real Q/A pairs without markdown emphasis", () => {
  for (const g of loadAllGuides()) {
    for (const item of g.faq) {
      assert.ok(item.q.endsWith("?"), `${g.slug}: question "${item.q}"`);
      assert.ok(item.a.length > 40, `${g.slug}: answer too short for "${item.q}"`);
      assert.ok(!item.a.includes("**"), `${g.slug}: answer has raw bold markup`);
    }
  }
});

/* ── JSON-LD ── */

test("Article + FAQPage JSON-LD parse as valid JSON with required fields", () => {
  const guide = loadGuide("dso-multi-location-hiring");

  const article = JSON.parse(JSON.stringify(buildGuideArticleJsonLd(guide)));
  assert.equal(article["@type"], "Article");
  assert.equal(article.headline, guide.title);
  assert.ok(article.datePublished);
  assert.equal(article.author.name, "DSO Hire");
  assert.equal(
    article.url,
    "https://dsohire.com/guides/dso-multi-location-hiring",
  );

  const faq = JSON.parse(JSON.stringify(buildGuideFaqJsonLd(guide)));
  assert.equal(faq["@type"], "FAQPage");
  assert.ok(Array.isArray(faq.mainEntity) && faq.mainEntity.length >= 4);
  assert.equal(faq.mainEntity[0]["@type"], "Question");
  assert.ok(faq.mainEntity[0].acceptedAnswer.text.length > 0);
});

/* ── Sitemap ── */

test("sitemap lists the guides index and all three guide pages", async () => {
  // Distribution gate is off in the test env, so sitemap() never touches
  // Supabase — the dynamic job/company sections contribute nothing.
  const entries = await sitemap();
  const urls = new Set(entries.map((e) => e.url));
  for (const slug of listGuideSlugs()) {
    assert.ok(
      urls.has(`https://dsohire.com/guides/${slug}`),
      `missing /guides/${slug}`,
    );
  }
  assert.ok(urls.has("https://dsohire.com/guides"), "missing /guides index");
  const index = entries.find((e) => e.url === "https://dsohire.com/guides");
  assert.equal(index?.priority, 0.6);
  const guide = entries.find(
    (e) => e.url === "https://dsohire.com/guides/dso-multi-location-hiring",
  );
  assert.equal(guide?.priority, 0.7);
  assert.equal(guide?.changeFrequency, "monthly");
});

/* ── Texas hygienist career guide ── */

const TX_HYG = "how-to-become-dental-hygienist-texas";

test("Texas hygienist guide is a dated candidate guide with its own dates", () => {
  const g = loadGuide(TX_HYG);
  assert.equal(g.audience, "candidate");
  assert.equal(g.lastReviewed, "2026-10-20");
  assert.ok(g.byline?.includes("Cam Eslinger"));
  assert.equal(g.jobsHref, "/jobs?category=dental_hygienist&state=TX");
  assert.ok(g.faq.length >= 5 && g.faq.length <= 7, `FAQ count ${g.faq.length}`);
  // The FAQ parser must stop at the Sources section that follows it.
  assert.ok(!g.faq.some((f) => f.a.includes("tsbde.texas.gov")));

  const article = buildGuideArticleJsonLd(g);
  assert.equal(article.datePublished, "2026-10-20T09:00:00-05:00");
  assert.equal(article.dateModified, "2026-10-20");

  // Original guides keep the shared launch date and no dateModified.
  const legacy = buildGuideArticleJsonLd(loadGuide("dso-multi-location-hiring"));
  assert.equal(legacy.dateModified, undefined);
  assert.equal(loadGuide("dso-multi-location-hiring").audience, "employer");
});

test("Texas hygienist guide copy has no em dashes", () => {
  const g = loadGuide(TX_HYG);
  assert.ok(!`${g.title}${g.metaDescription}${g.body}`.includes("\u2014"));
});

test("Texas hygienist guide pay figures match the committed OEWS + projection data", () => {
  // If the salary data is refreshed, this fails until the guide copy (and its
  // Last reviewed date) are updated to match.
  const g = loadGuide(TX_HYG);
  const tx = stateDetail("29-1292", "TX");
  const proj = stateProjection("29-1292", "TX");
  assert.ok(tx && proj);
  const usd = (n: number | null) => `$${(n ?? 0).toLocaleString("en-US")}`;
  for (const needle of [
    usd(tx.annual.p50),
    `$${tx.hourly.p50?.toFixed(2)}`,
    usd(tx.annual.p10),
    usd(tx.annual.p90),
    (tx.emp ?? 0).toLocaleString("en-US"),
    `${proj.pct}%`,
    (proj.base ?? 0).toLocaleString("en-US"),
    (proj.projected ?? 0).toLocaleString("en-US"),
    (proj.openings ?? 0).toLocaleString("en-US"),
  ]) {
    assert.ok(g.body.includes(needle), `guide body missing ${needle}`);
  }
});
