/**
 * Loader for /guides/* pillar-page markdown content (launch SEO spec, Phase 3).
 *
 * Mirrors src/lib/legal/loader.ts: markdown files live in src/content/guides/,
 * frontmatter is parsed via gray-matter, and everything is server-side only.
 * The FAQ section is parsed out of the SAME markdown that renders on-page, so
 * the FAQPage JSON-LD can never drift from visible content (Google policy:
 * only mark up what renders). Content is Cam's final copy — do not rewrite or
 * add claims here; this module is formatting/plumbing only.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const GUIDES_DIR = path.join(process.cwd(), "src", "content", "guides");

const SITE_URL = "https://dsohire.com";

/** The site went publicly live 2026-07-15; the guides shipped with launch. */
export const GUIDES_DATE_PUBLISHED = "2026-07-15";

export interface GuideFaqItem {
  q: string;
  a: string;
}

export interface Guide {
  slug: string;
  /** Full SEO title from frontmatter (used as the Article headline). */
  title: string;
  /** <title> tag text — already includes the "| DSO Hire" suffix. */
  metaTitle: string;
  metaDescription: string;
  targetQuery: string;
  /** Site paths to cross-link from the guide (frontmatter `internalLinks`). */
  internalLinks: string[];
  /** On-page H1 — the body's leading `# ` heading (sentence case). */
  heading: string;
  /** Markdown body with the leading H1 stripped (rendered separately). */
  body: string;
  faq: GuideFaqItem[];
}

/** Order matters — this drives the /guides index page. */
export const GUIDE_SLUGS = [
  "dso-multi-location-hiring",
  "reduce-time-to-hire-dental-practice",
  "dental-culture-fit-screening",
] as const;

export function listGuideSlugs(): string[] {
  return [...GUIDE_SLUGS];
}

export function isGuideSlug(slug: string): boolean {
  return (GUIDE_SLUGS as readonly string[]).includes(slug);
}

/** Strip markdown emphasis for plain-text JSON-LD answer fields. */
function plainText(md: string): string {
  return md
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .trim();
}

/**
 * Parse the `## FAQ` section: each item is a paragraph block starting with a
 * bold question line followed by the answer text.
 */
export function parseGuideFaq(body: string): GuideFaqItem[] {
  const afterHeading = body.split(/^## FAQ\s*$/m)[1];
  if (!afterHeading) return [];
  // Stop at the next section heading, if the FAQ ever isn't last.
  const section = afterHeading.split(/^## /m)[0];
  const items: GuideFaqItem[] = [];
  for (const block of section.split(/\n\s*\n/)) {
    const m = block.trim().match(/^\*\*(.+?)\*\*\s*\n([\s\S]+)$/);
    if (m) items.push({ q: m[1].trim(), a: plainText(m[2]) });
  }
  return items;
}

export function loadGuide(slug: string): Guide {
  const file = path.join(GUIDES_DIR, `${slug}.md`);
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);

  // Pull the leading `# ` H1 out of the body — it renders in the styled
  // header block, not through the prose renderer.
  const h1Match = content.match(/^\s*# (.+)\n/);
  const heading = h1Match ? h1Match[1].trim() : (data.title as string);
  const body = h1Match ? content.replace(h1Match[0], "").trim() : content.trim();

  return {
    slug,
    title: data.title as string,
    metaTitle: data.metaTitle as string,
    metaDescription: data.metaDescription as string,
    targetQuery: (data.targetQuery as string) ?? "",
    internalLinks: (data.internalLinks as string[]) ?? [],
    heading,
    body,
    faq: parseGuideFaq(content),
  };
}

export function loadAllGuides(): Guide[] {
  return listGuideSlugs().map(loadGuide);
}

/* ── JSON-LD builders (pure — unit-tested) ── */

export function buildGuideArticleJsonLd(guide: Guide): Record<string, unknown> {
  const url = `${SITE_URL}/guides/${guide.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.metaDescription,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    datePublished: GUIDES_DATE_PUBLISHED,
    author: {
      "@type": "Organization",
      name: "DSO Hire",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "DSO Hire",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/email-signature-logo.png`,
      },
    },
  };
}

export function buildGuideFaqJsonLd(guide: Guide): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}
