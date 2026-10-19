/**
 * schema.org builders for the public marketing site (pure, unit-tested).
 *
 * Rules every builder follows:
 *   - Only mark up what is true and (for FAQ) visible on the page. FAQ
 *     builders take the SAME array the page renders, so markup can't drift.
 *   - Prices come from PRICING_TIERS in src/lib/stripe/prices.ts, never
 *     retyped here.
 *   - No aggregateRating / review: we have no public reviews to cite.
 */

import {
  PRICING_TIERS,
  PRICING_TIER_ORDER,
} from "@/lib/stripe/prices";
import { SALES_EMAIL, SUPPORT_EMAIL } from "@/lib/contact";
import type { JsonLdObject } from "./json-ld";

export const SITE_URL = "https://dsohire.com";
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const SOFTWARE_ID = `${SITE_URL}/#software`;

export const ORG_DESCRIPTION =
  "DSO Hire is a flat-fee dental hiring platform for multi-location dental groups (DSOs). Employers pay one monthly subscription with no per-listing fees and no placement fees; dental professionals use it free.";

/** Absolute URL for a site path ("/pricing" -> "https://dsohire.com/pricing"). */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Organization + WebSite in one @graph. Mounted once, in the root layout. */
export function organizationGraphJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: "DSO Hire",
        url: SITE_URL,
        // Existing canonical lockup PNG (logo canon rule: never re-typeset).
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/email-signature-logo.png`,
          width: 800,
          height: 284,
        },
        description: ORG_DESCRIPTION,
        foundingDate: "2026",
        areaServed: { "@type": "Country", name: "United States" },
        founder: { "@type": "Person", name: "Cam Eslinger" },
        // Role aliases, not a personal inbox (see src/lib/contact.ts).
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "sales",
            email: SALES_EMAIL,
            areaServed: "US",
            availableLanguage: "English",
          },
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            email: SUPPORT_EMAIL,
            areaServed: "US",
            availableLanguage: "English",
          },
        ],
        sameAs: [
          "https://www.linkedin.com/company/dsohire",
          "https://www.crunchbase.com/organization/dso-hire",
        ],
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: "DSO Hire",
        url: SITE_URL,
        inLanguage: "en-US",
        publisher: { "@id": ORG_ID },
      },
    ],
  };
}

/**
 * SoftwareApplication for the employer product, one Offer per tier at the
 * monthly price (billed monthly). Used on /, /for-dental-groups, /pricing.
 */
export function softwareApplicationJsonLd(): JsonLdObject {
  const tiers = PRICING_TIER_ORDER.map((id) => PRICING_TIERS[id]);
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: "DSO Hire",
    url: SITE_URL,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Applicant tracking and job posting for dental groups",
    operatingSystem: "Web",
    description:
      "Dental-only hiring platform for multi-location dental groups: post a role across every location in one flow, work applicants in a shared pipeline, and see a PracticeFit score on every application. Flat monthly subscription with no per-listing fees and no placement fees.",
    publisher: { "@id": ORG_ID },
    offers: tiers.map((t) => ({
      "@type": "Offer",
      name: `${t.name} plan`,
      description: t.description,
      url: `${SITE_URL}/pricing/${t.id}`,
      price: t.monthlyPrice,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: t.monthlyPrice,
        priceCurrency: "USD",
        billingDuration: "P1M",
        unitText: "MONTH",
      },
    })),
  };
}

export interface FaqEntry {
  q: string;
  a: string;
}

/** FAQPage from the exact Q&A array the page renders. */
export function faqPageJsonLd(items: readonly FaqEntry[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export interface Crumb {
  name: string;
  /** Site path ("/guides") or absolute URL. */
  path: string;
}

/** BreadcrumbList; positions are 1-based in the order given. */
export function breadcrumbJsonLd(crumbs: readonly Crumb[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}
