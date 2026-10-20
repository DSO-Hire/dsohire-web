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
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/components/seo/schema";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowRight } from "lucide-react";
import { ReportSignup } from "@/components/marketing/report-signup";
import { SiteShell } from "@/components/marketing/site-shell";
import { candidateCtaHref } from "@/lib/marketing/candidate-cta";
import {
  loadGuide,
  listGuideSlugs,
  isGuideSlug,
  buildGuideArticleJsonLd,
  buildGuideFaqJsonLd,
  formatGuideDate,
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
    alternates: { canonical: `/guides/${slug}` },
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
  "/salary/hygienists/texas": "Texas dental hygienist salary data",
  "/for-hygienists": "DSO Hire for dental hygienists",
  "/research/dental-hiring-shortage-2026": "The dental hiring shortage, by the numbers",
};

/**
 * GFM tables (career guides use requirement / cost / timeline tables).
 * .dso-prose has no table rules, so style them here: square corners, rem
 * type scale, and a horizontal scroll wrapper so wide tables never push the
 * page sideways on a phone.
 */
const MARKDOWN_COMPONENTS: Components = {
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto border border-[var(--rule)]">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-cream/60">{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 align-bottom text-2xs font-bold uppercase tracking-[1.5px] text-heritage-deep border-b border-[var(--rule)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 align-top leading-relaxed text-ink border-b border-[var(--rule)]">
      {children}
    </td>
  ),
};

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  if (!isGuideSlug(slug)) notFound();
  const guide = loadGuide(slug);

  const isCandidate = guide.audience === "candidate";
  // Auth-aware: a signed-in candidate never gets sent back to sign-up.
  const accountHref = isCandidate ? await candidateCtaHref("dashboard") : null;

  const relatedLinks = guide.internalLinks
    .filter((href) => INTERNAL_LINK_LABELS[href])
    .map((href) => ({ href, label: INTERNAL_LINK_LABELS[href] }));

  return (
    <SiteShell ctaIntent={isCandidate ? "candidate" : "dso"}>
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
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: isCandidate ? "Career guides" : "Hiring guides", path: "/guides" },
          { name: guide.heading, path: `/guides/${guide.slug}` },
        ])}
      />

      <article className="pt-[120px] pb-24 px-6 sm:px-14 max-w-[860px] mx-auto">
        <Link
          href="/guides"
          className="inline-flex items-center gap-2 text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep hover:text-ink transition-colors mb-6"
        >
          ← All guides
        </Link>

        <div className="text-2xs font-bold tracking-[3.5px] uppercase text-heritage-deep mb-3">
          {isCandidate ? "Career Guide" : "Hiring Guide"}
        </div>
        <h1
          className={`text-3xl sm:text-5xl font-extrabold tracking-[-1.5px] leading-[1.1] text-ink ${
            guide.byline || guide.lastReviewed
              ? "mb-4"
              : "mb-10 pb-6 border-b border-[var(--rule)]"
          }`}
        >
          {guide.heading}
        </h1>
        {(guide.byline || guide.lastReviewed) && (
          <div className="mb-10 pb-6 border-b border-[var(--rule)] text-xs text-slate-body leading-relaxed">
            {guide.byline && <p>{guide.byline}</p>}
            {guide.lastReviewed && (
              <p>
                Last reviewed:{" "}
                <time dateTime={guide.lastReviewed}>
                  {formatGuideDate(guide.lastReviewed)}
                </time>
              </p>
            )}
          </div>
        )}

        <div className="dso-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {guide.body}
          </ReactMarkdown>
        </div>

        {isCandidate && (
          <section className="mt-12 border border-[var(--rule)] bg-card p-6 sm:p-8">
            <div className="text-2xs font-bold tracking-[2.5px] uppercase text-heritage-deep mb-2">
              Next step
            </div>
            <p className="text-lg font-extrabold tracking-[-0.3px] text-ink mb-2">
              Looking for your first (or next) hygiene job?
            </p>
            <p className="text-sm text-slate-body leading-relaxed mb-5 max-w-[620px]">
              Browse open hygienist roles on DSO Hire, or create a free
              candidate account to see how each office fits the way you work.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={guide.jobsHref ?? "/jobs"}
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                Browse hygienist jobs <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
              <Link
                href={accountHref ?? "/candidate/sign-up"}
                className="inline-flex items-center px-6 py-3.5 border border-[var(--rule-strong)] text-ink text-sm font-semibold hover:border-ink hover:bg-cream transition-colors"
              >
                Create a free candidate account
              </Link>
            </div>
          </section>
        )}

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
      {!isCandidate && <ReportSignup page="guide" />}
    </SiteShell>
  );
}
