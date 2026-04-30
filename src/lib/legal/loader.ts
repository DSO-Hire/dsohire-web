/**
 * Loader for /legal/* markdown content.
 *
 * Reads files from src/content/legal/*.md, parses frontmatter via gray-matter,
 * and exposes a typed list of available legal documents. Designed to run
 * server-side only — `fs` and `path` aren't available in the browser.
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface LegalDoc {
  slug: string;
  title: string;
  effectiveDate: string;
  body: string;
}

/** Where the markdown files live, relative to the repo root. */
const LEGAL_DIR = path.join(process.cwd(), "src", "content", "legal");

/** Documents we publicly list at /legal — order matters for the index page. */
export const LEGAL_INDEX: Array<{ slug: string; blurb: string }> = [
  {
    slug: "privacy",
    blurb:
      "How DSO Hire collects, uses, shares, and protects personal information across the Services.",
  },
  {
    slug: "terms",
    blurb:
      "The umbrella agreement that governs your access to and use of dsohire.com.",
  },
  {
    slug: "cookies",
    blurb:
      "How and why DSO Hire uses cookies, pixels, and similar technologies on the Services.",
  },
  {
    slug: "acceptable-use",
    blurb:
      "What kinds of content and behavior are and aren't allowed on the platform.",
  },
  {
    slug: "candidate-terms",
    blurb:
      "Specific terms that apply to job seekers who create profiles and apply to jobs.",
  },
  {
    slug: "dmca",
    blurb:
      "How copyright owners can submit takedown notices and how counter-notifications work.",
  },
];

/** Read and parse a single legal doc by slug. Throws if the file is missing. */
export function loadLegalDoc(slug: string): LegalDoc {
  const file = path.join(LEGAL_DIR, `${slug}.md`);
  const raw = fs.readFileSync(file, "utf8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: (data.title as string) ?? slug,
    // YAML auto-parses unquoted dates as Date objects — coerce to YYYY-MM-DD string
    // so React can render it directly without crashing.
    effectiveDate: formatEffectiveDate(data.effectiveDate),
    body: content,
  };
}

function formatEffectiveDate(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10); // YYYY-MM-DD
  }
  return String(value);
}

/** Available slugs (used for `generateStaticParams` in the dynamic route). */
export function listLegalSlugs(): string[] {
  return LEGAL_INDEX.map((entry) => entry.slug);
}
