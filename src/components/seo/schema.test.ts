/**
 * Tests for the shared schema.org builders + JSON-LD serializer + IndexNow
 * URL filter.
 *
 * Run: npm test (picked up by the src/**\/*.test.ts glob)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  breadcrumbJsonLd,
  faqPageJsonLd,
  organizationGraphJsonLd,
  softwareApplicationJsonLd,
} from "./schema";
import { serializeJsonLd } from "./json-ld";
import { PRICING_TIERS, PRICING_TIER_ORDER } from "@/lib/stripe/prices";
import { filterIndexNowUrls, INDEXNOW_KEY } from "@/lib/seo/indexnow";

test("serializeJsonLd escapes script-breaking characters and round-trips", () => {
  const data = { text: "a </script><script>alert(1)</script> & b \u2028" };
  const out = serializeJsonLd(data);
  assert.ok(!out.includes("</script>"));
  assert.ok(!out.includes("<"));
  assert.deepEqual(JSON.parse(out), data);
});

test("SoftwareApplication offers mirror PRICING_TIERS (no retyped prices, no ratings)", () => {
  const app = softwareApplicationJsonLd() as {
    offers: Array<{ name: string; price: number; priceCurrency: string; priceSpecification: { billingDuration: string } }>;
  };
  assert.equal(app.offers.length, PRICING_TIER_ORDER.length);
  PRICING_TIER_ORDER.forEach((id, i) => {
    assert.equal(app.offers[i].price, PRICING_TIERS[id].monthlyPrice);
    assert.equal(app.offers[i].priceCurrency, "USD");
    assert.equal(app.offers[i].priceSpecification.billingDuration, "P1M");
  });
  const json = JSON.stringify(app);
  assert.ok(!json.includes("aggregateRating"));
  assert.ok(!json.includes("review"));
});

test("Organization graph has Organization + WebSite and no personal inbox", () => {
  const g = organizationGraphJsonLd() as { "@graph": Array<{ "@type": string }> };
  assert.deepEqual(
    g["@graph"].map((n) => n["@type"]),
    ["Organization", "WebSite"],
  );
  assert.ok(!JSON.stringify(g).includes("cam@"));
});

test("FAQPage + BreadcrumbList builders", () => {
  const faq = faqPageJsonLd([{ q: "Q1?", a: "A1." }]) as {
    mainEntity: Array<{ name: string; acceptedAnswer: { text: string } }>;
  };
  assert.equal(faq.mainEntity[0].name, "Q1?");
  assert.equal(faq.mainEntity[0].acceptedAnswer.text, "A1.");

  const bc = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Guides", path: "/guides" },
  ]) as { itemListElement: Array<{ position: number; item: string }> };
  assert.equal(bc.itemListElement[1].position, 2);
  assert.equal(bc.itemListElement[1].item, "https://dsohire.com/guides");
});

test("IndexNow key is 32 hex and the URL filter keeps only our https host", () => {
  assert.match(INDEXNOW_KEY, /^[0-9a-f]{32}$/);
  assert.deepEqual(
    filterIndexNowUrls([
      "https://dsohire.com/pricing",
      "https://dsohire.com/pricing",
      "http://dsohire.com/faq",
      "https://demo.dsohire.com/demo",
      "not a url",
    ]),
    ["https://dsohire.com/pricing"],
  );
});
