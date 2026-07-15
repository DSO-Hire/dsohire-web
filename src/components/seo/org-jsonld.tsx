/**
 * Organization + WebSite JSON-LD for the homepage (launch SEO spec, Phase 2).
 *
 * One @graph script so both entities land in a single block. Deliberately
 * minimal per the spec: no SearchAction (site search is behind auth), and the
 * logo references the existing canonical lockup PNG in /public — logo canon
 * rule: never re-typeset or generate a new logo file.
 */

const SITE_URL = "https://dsohire.com";

const ORG_WEBSITE_JSONLD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "DSO Hire",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/email-signature-logo.png`,
        width: 800,
        height: 284,
      },
      // TODO(cam): add LinkedIn company page URL to sameAs once created
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "DSO Hire",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export function OrgJsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_WEBSITE_JSONLD) }}
    />
  );
}
