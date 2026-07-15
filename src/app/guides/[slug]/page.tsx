/**
 * /guides/[slug] — pillar guide pages (launch SEO spec, Phase 3).
 *
 * Server component rendering Cam's final markdown drafts from
 * src/content/guides/ (via @/lib/guides/loader) through react-markdown +
 * remark-gfm with the shared .dso-prose rules — same pattern as /legal/[slug].
 * Each page emits Article + FAQPage JSON-LD built from the same source
 * markdown that renders on-page. Internal links come from the draft's
 * frontmatter. CTAs point at neutral marketing surfaces (/for-dental-groups,
 * /jobs) — never a sign-up page — and the SiteShell nav resolves the primary
 * CTA per auth state, so a signed-in user never lands on account creation.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight } from "lucide-react";
import { SiteShell } from "@/components/marketing/site-shell";
import {
  loadGuide,
  listGuideSlugs,
  isGuideSlug,
  buildGuideArticleJsonLd,
  buildGuideFaqJsonLd,
} from "@/lib/guides/loader";
import type { Metadata } from "next";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return listGuideSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!isGuideSlug(slug)) return { title: "Not found" };
  const guide = loadGuide(slug);
  return {
    // metaTitle already carries the "| DSO Hire" suffix — skip the template.
    title: { absolute: guide.metaTitle },
    description: guide.metaDescription,
    alternates: { canonical: `https://dsohire.com/guides/${slug}` },
    openGraph: {
      title: guide.title,
      description: guide.metaDescription,
      url: `https://dsohire.com/guides/${slug}`,
      type: "article",
    },
  };
}

/** Labels for the frontmatter `internalLinks` paths. */
const INTERNAL_LINK_LABELS: Record<string, string> = {
  "/for-dental-groups": "DSO Hire for dental groups",
  "/for-candidates": "DSO Hire for dental professionals",
  "/practicefit": "How PracticeFit™ scoring works",
  "/jobs": "Browse open dental jobs",
  "/vs/staffing-agencies": "DSO Hire vs. staffing agencies",
  "/salary": "Dental salary data by role and state",
};

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  if (!isGuideSlug(slug)) notFound();
  const guide = loadGuide(slug);

  const relatedLinks = guide.internalLinks
    .filter((href) => INTERNAL_LINK_LABELS[href])
    .map((href) => ({ href, label: INTERNAL_LINK_LABELS[href] }));

  return (
    <SiteShell ctaIntent="dso">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildGuideArticleJsonLd(guide)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildGuideFaqJsonLd(guide)),
        }}
      />

      <article className="pt-[120px] pb-24 px-6 sm:px-14 max-w-[860px] mx-auto">
        <Link
          href="/guides"
          className="inline-flex items-center gap-2 text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
        >
          ← All guides
        </Link>

        <div className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3">
          Hiring Guide
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink mb-10 pb-6 border-b border-[var(--rule)]">
          {guide.heading}
        </h1>

        <div className="dso-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{guide.body}</ReactMarkdown>
        </div>

        {relatedLinks.length > 0 && (
          <section className="mt-16 pt-8 border-t border-[var(--rule)]">
            <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-4">
              Keep reading
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {relatedLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-heritage-deep hover:text-ink underline underline-offset-2"
                  >
                    {link.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </SiteShell>
  );
}
