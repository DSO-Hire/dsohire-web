/**
 * schema.org builders for DSO Hire Research reports (pure, unit-tested).
 *
 * Article with a named Person author, the site Organization as publisher
 * (referenced by @id; the full Organization node is mounted once in the
 * root layout), and a `citation` array built from the SAME sources list
 * the page renders, so markup and the visible bibliography can't drift.
 */

import { ORG_ID, SITE_URL, absoluteUrl } from "@/components/seo/schema";
import type { JsonLdObject } from "@/components/seo/json-ld";
import { researchPath, type ResearchReportMeta, type ResearchSource } from "./reports";

export function researchArticleJsonLd(
  report: ResearchReportMeta,
  sources: readonly ResearchSource[],
): JsonLdObject {
  const url = absoluteUrl(researchPath(report.slug));
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: report.title,
    description: report.description,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: [`${url}/opengraph-image`],
    datePublished: report.datePublished,
    dateModified: report.dateModified,
    inLanguage: "en-US",
    articleSection: "Research",
    author: {
      "@type": "Person",
      name: report.author.name,
      jobTitle: "Founder",
      worksFor: { "@id": ORG_ID },
    },
    publisher: {
      "@type": "Organization",
      "@id": ORG_ID,
      name: "DSO Hire",
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/email-signature-logo.png` },
    },
    // Unique, in bibliography order.
    citation: Array.from(new Set(sources.map((s) => s.url))),
  };
}
